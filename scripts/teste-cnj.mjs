/**
 * Teste controlado: consulta um CNJ específico na Judit,
 * aguarda o resultado, salva no banco e registra em judit_consulta_log.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { config } from "dotenv";
config();

const mysql = require("mysql2/promise");

const CNJ = process.argv[2] ?? "5000472-08.2025.8.08.0044";
const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE_URL = process.env.JUDIT_BASE_URL ?? "https://requests.prod.judit.io";
const CUSTO_POR_CONSULTA = 0.25;

async function juditFetch(path, opts = {}) {
  const url = `${JUDIT_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "api-key": JUDIT_API_KEY,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.substring(0, 300)}`);
  return JSON.parse(text);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log(`\n=== TESTE CONTROLADO: CNJ ${CNJ} ===\n`);

  // ── PASSO 1: Verificar se já existe no banco ──────────────────────────────
  const [existente] = await conn.execute(
    "SELECT cnj, status_resumido, status_original, advogado FROM processos WHERE cnj = ? LIMIT 1",
    [CNJ]
  );
  if (existente.length > 0) {
    console.log("Processo já existe no banco:");
    console.log("  CNJ:", existente[0].cnj);
    console.log("  Status resumido:", existente[0].status_resumido);
    console.log("  Status original:", existente[0].status_original);
    console.log("  Advogado:", existente[0].advogado);
  } else {
    console.log("Processo NÃO existe no banco ainda.");
  }

  // ── PASSO 2: Enviar requisição à Judit ────────────────────────────────────
  console.log("\n→ Enviando requisição à Judit...");
  const reqBody = {
    search: {
      search_type: "lawsuit_cnj",
      search_key: CNJ,
    },
  };

  let requestId;
  try {
    const reqResp = await juditFetch("/requests", {
      method: "POST",
      body: JSON.stringify(reqBody),
    });
    requestId = reqResp?.request_id ?? reqResp?.id;
    console.log("  ✓ Requisição criada. request_id:", requestId);
    console.log("  Resposta completa:", JSON.stringify(reqResp).substring(0, 400));
  } catch (err) {
    console.error("  ✗ Erro ao criar requisição:", err.message);
    await conn.end();
    return;
  }

  if (!requestId) {
    console.error("  ✗ request_id não retornado pela Judit");
    await conn.end();
    return;
  }

  // Salvar request no banco
  await conn.execute(
    "INSERT INTO judit_requests (request_id, cnj, status, created_at, updated_at) VALUES (?, ?, 'processing', NOW(), NOW()) ON DUPLICATE KEY UPDATE status='processing', updated_at=NOW()",
    [requestId, CNJ]
  );
  console.log("  ✓ request_id salvo na tabela judit_requests");

  // ── PASSO 3: Polling até completar (máx 10 tentativas, 5s intervalo) ─────
  console.log("\n→ Aguardando processamento pela Judit (polling a cada 5s, máx 50s)...");
  let reqStatus = "processing";
  let tentativas = 0;
  const MAX_TENTATIVAS = 10;

  while ((reqStatus === "processing" || reqStatus === "pending") && tentativas < MAX_TENTATIVAS) {
    await sleep(5000);
    tentativas++;
    try {
      const statusResp = await juditFetch(`/requests/${requestId}`);
      reqStatus = statusResp?.status ?? statusResp?.request_status ?? "unknown";
      console.log(`  Tentativa ${tentativas}/${MAX_TENTATIVAS}: status = "${reqStatus}"`);
    } catch (err) {
      console.log(`  Tentativa ${tentativas}: erro ao verificar status: ${err.message}`);
    }
  }

  // ── PASSO 4: Buscar resultado se completado ───────────────────────────────
  let dadosProcesso = null;
  if (reqStatus === "completed" || reqStatus === "done" || reqStatus === "finished") {
    console.log("\n→ Buscando resultado na Judit...");
    try {
      const respResp = await juditFetch(`/responses?request_id=${requestId}&page_size=5`);
      const pageData = respResp?.page_data ?? [];
      console.log(`  Entradas retornadas: ${pageData.length}`);
      
      for (const entry of pageData) {
        if (entry.response_type === "lawsuit" || entry.response_type === "process") {
          dadosProcesso = entry.response_data ?? entry;
          console.log("  ✓ Dados do processo encontrados!");
          console.log("  Campos disponíveis:", Object.keys(dadosProcesso).join(", "));
          break;
        }
      }
      
      if (!dadosProcesso && pageData.length > 0) {
        dadosProcesso = pageData[0];
        console.log("  ✓ Usando primeira entrada. Tipo:", pageData[0].response_type);
      }
    } catch (err) {
      console.log("  ✗ Erro ao buscar resultado:", err.message);
    }
  }

  // ── PASSO 5: Atualizar status no banco ────────────────────────────────────
  const statusFinal = (reqStatus === "completed" || reqStatus === "done" || reqStatus === "finished")
    ? "completed"
    : "error";

  await conn.execute(
    "UPDATE judit_requests SET status = ?, updated_at = NOW() WHERE request_id = ?",
    [statusFinal, requestId]
  );
  console.log(`\n→ judit_requests atualizado: status = "${statusFinal}"`);

  // ── PASSO 6: Salvar dados do processo no banco ────────────────────────────
  if (dadosProcesso) {
    console.log("\n→ Dados retornados pela Judit:");
    console.log(JSON.stringify(dadosProcesso, null, 2).substring(0, 1000));

    // Extrair campos relevantes
    const cnj = dadosProcesso.cnj ?? dadosProcesso.lawsuit_cnj ?? CNJ;
    const nomeParte = dadosProcesso.main_subject ?? dadosProcesso.subject ?? dadosProcesso.nome_parte ?? null;
    const status = dadosProcesso.status ?? dadosProcesso.lawsuit_status ?? null;
    const tribunal = dadosProcesso.court ?? dadosProcesso.tribunal ?? null;
    const ultimaAtualizacao = dadosProcesso.last_update ?? dadosProcesso.ultima_atualizacao ?? null;

    // Verificar se o processo existe no banco para upsert
    const [proc] = await conn.execute("SELECT id FROM processos WHERE cnj = ? LIMIT 1", [CNJ]);
    if (proc.length > 0) {
      // Atualizar campos relevantes
      const statusOriginal = dadosProcesso.status ?? dadosProcesso.lawsuit_status ?? dadosProcesso.situation ?? null;
      await conn.execute(
        "UPDATE processos SET status_judit = 'consultado', status_original = COALESCE(?, status_original), ultima_atualizacao_api = NOW(), updated_at = NOW() WHERE cnj = ?",
        [statusOriginal, CNJ]
      );
      console.log("  ✓ Processo atualizado no banco (status_judit = consultado, status_original atualizado)");
    } else {
      console.log("  ℹ Processo não existe na tabela processos (não foi importado previamente)");
    }
  }

  // ── PASSO 7: Registrar em judit_consulta_log ──────────────────────────────
  console.log("\n→ Registrando em judit_consulta_log...");
  // Mapear status para enum da tabela
  const logStatus = statusFinal === 'completed' ? 'sucesso' : 'erro';
  try {
    await conn.execute(
      `INSERT INTO judit_consulta_log (processo_cnj, request_id, tipo, status, custo, aprovado_por_id, created_at)
       VALUES (?, ?, 'consulta_avulsa', ?, ?, NULL, NOW())`,
      [CNJ, requestId, logStatus, CUSTO_POR_CONSULTA]
    );
    console.log("  ✓ Entrada registrada em judit_consulta_log");
  } catch (err) {
    console.log("  ✗ Erro ao registrar log:", err.message);
  }

  // ── PASSO 8: Verificar entrada no log ────────────────────────────────────
  const [logEntry] = await conn.execute(
    "SELECT * FROM judit_consulta_log WHERE processo_cnj = ? ORDER BY created_at DESC LIMIT 1",
    [CNJ]
  );

  console.log("\n════════════════════════════════════════");
  console.log("RESUMO FINAL");
  console.log("════════════════════════════════════════\n");
  console.log("CNJ consultado:", CNJ);
  console.log("request_id:", requestId);
  console.log("Status final na Judit:", reqStatus);
  console.log("Status salvo no banco (judit_requests):", statusFinal);
  console.log("Dados do processo retornados:", dadosProcesso ? "SIM" : "NÃO");

  if (logEntry.length > 0) {
    const log = logEntry[0];
    console.log("\nEntrada em judit_consulta_log:");
    console.log("  CNJ:", log.cnj);
    console.log("  request_id:", log.request_id);
    console.log("  status:", log.status);
    console.log("  custo:", log.custo ?? log.cost ?? "—");
    console.log("  created_at:", log.created_at);
    const custo = Number(log.custo ?? log.cost ?? 0);
    console.log(`  → Custo R$ ${custo.toFixed(2)} ${custo === 0.25 ? "✓ R$0,25 CORRETO" : "⚠ DIFERENTE DO ESPERADO"}`);
  } else {
    console.log("\n⚠ Nenhuma entrada encontrada em judit_consulta_log para este CNJ");
  }

  await conn.end();
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
