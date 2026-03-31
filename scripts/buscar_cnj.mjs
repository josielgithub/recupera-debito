/**
 * Script para buscar um CNJ na Judit e atualizar o banco de dados.
 * Uso: node scripts/buscar_cnj.mjs <CNJ>
 */
import mysql from '../node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise.js';

const CNJ = process.argv[2] || "1004572-07.2025.8.11.0007";
const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const JUDIT_BASE_URL = "https://requests.prod.judit.io";

function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error("DATABASE_URL inválida");
  return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]), database: m[5] };
}

async function juditFetch(path, options = {}) {
  const res = await fetch(`${JUDIT_BASE_URL}${path}`, {
    ...options,
    headers: {
      "api-key": JUDIT_API_KEY,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`\nBuscando CNJ: ${CNJ}`);
  console.log("=".repeat(60));

  // Etapa 1: Criar requisição
  console.log("\n[1/3] Criando requisição na Judit...");
  const reqData = await juditFetch("/requests", {
    method: "POST",
    body: JSON.stringify({
      search: { search_type: "lawsuit_cnj", search_key: CNJ },
      cache_ttl_in_days: 7,
    }),
  });
  const requestId = reqData.request_id ?? reqData.id;
  console.log(`  request_id = ${requestId}`);

  // Etapa 2: Polling
  console.log("\n[2/3] Aguardando processamento...");
  let status = "processing";
  for (let i = 0; i < 20; i++) {
    await sleep(5000);
    const statusData = await juditFetch(`/requests/${requestId}`);
    status = (statusData.status ?? statusData.state ?? "processing").toLowerCase();
    process.stdout.write(`  ${(i+1)*5}s — status: ${status}\n`);
    if (status === "completed" || status === "done") { status = "completed"; break; }
    if (status === "error" || status === "failed") { status = "error"; break; }
  }

  if (status !== "completed") {
    console.log(`\n  Resultado: ${status === "error" ? "ERRO" : "TIMEOUT"}`);
    return;
  }

  // Etapa 3: Obter resultado
  console.log("\n[3/3] Coletando resultado...");
  const respData = await juditFetch(`/responses?request_id=${requestId}`);

  let resultado = null;
  if (respData.page_data?.length > 0) {
    resultado = respData.page_data[0].response_data ?? null;
  }

  if (!resultado) {
    console.log("  Resultado: NÃO ENCONTRADO na Judit");
    return;
  }

  // Verificar NOT_FOUND
  if (resultado.code === 2 || (typeof resultado.message === "string" && resultado.message.includes("NOT_FOUND"))) {
    console.log("  Resultado: NÃO ENCONTRADO na Judit (LAWSUIT_NOT_FOUND)");
    return;
  }

  // Exibir dados
  console.log("\n  === DADOS DO PROCESSO ===");
  console.log(`  CNJ: ${resultado.lawsuit_cnj ?? CNJ}`);
  console.log(`  Status: ${resultado.status ?? resultado.situation ?? "N/A"}`);
  console.log(`  Fase: ${resultado.phase ?? "N/A"}`);
  console.log(`  Tribunal: ${resultado.court ?? resultado.tribunal ?? "N/A"}`);
  console.log(`  Valor: ${resultado.value ?? resultado.valor ?? "N/A"}`);
  console.log(`  Nome: ${resultado.name ?? "N/A"}`);
  
  const parties = resultado.parties ?? [];
  if (parties.length > 0) {
    console.log(`\n  Partes (${parties.length}):`);
    parties.slice(0, 5).forEach(p => {
      console.log(`    [${p.type ?? p.polo ?? ""}] ${p.name ?? p.nome ?? ""}`);
    });
  }

  const steps = resultado.steps ?? [];
  if (steps.length > 0) {
    console.log(`\n  Movimentações (${steps.length} total — últimas 5):`);
    steps.slice(0, 5).forEach(s => {
      console.log(`    [${s.step_date ?? s.date ?? ""}] ${(s.content ?? s.description ?? "").slice(0, 120)}`);
    });
  }

  // Salvar no banco
  console.log("\n  Salvando no banco de dados...");
  const dbParams = parseDbUrl(DATABASE_URL);
  const conn = await mysql.createConnection({ ...dbParams, ssl: { rejectUnauthorized: true } });

  const [rows] = await conn.execute("SELECT id FROM processos WHERE cnj = ?", [CNJ]);
  const payloadJson = JSON.stringify({ ...resultado, _request_id: requestId });

  if (rows.length > 0) {
    const id = rows[0].id;
    await conn.execute(
      "UPDATE processos SET status_original = ?, raw_payload = ?, ultima_atualizacao_api = NOW(), updated_at = NOW() WHERE id = ?",
      [resultado.status ?? resultado.situation ?? null, payloadJson, id]
    );
    console.log(`  [ATUALIZADO] processo id=${id}`);
  } else {
    await conn.execute(
      "INSERT INTO processos (cnj, status_resumido, status_original, raw_payload, fonte_atualizacao, created_at, updated_at) VALUES (?, 'em_andamento', ?, ?, 'judit', NOW(), NOW())",
      [CNJ, resultado.status ?? resultado.situation ?? null, payloadJson]
    );
    console.log(`  [CRIADO] novo processo`);
  }

  await conn.end();
  console.log("\nConcluído!");
}

main().catch(err => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
