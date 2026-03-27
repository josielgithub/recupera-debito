/**
 * Script para disparar atualização Judit para todos os processos do banco.
 * Cria requisições em lotes e depois faz polling para coletar resultados.
 */
import { createConnection } from "mysql2/promise";
import https from "https";

const DB_URL = process.env.DATABASE_URL;
const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE_URL = "https://requests.prod.judit.io";

if (!DB_URL || !JUDIT_API_KEY) {
  console.error("DATABASE_URL ou JUDIT_API_KEY não definidos");
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function juditPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(JUDIT_BASE_URL + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "api-key": JUDIT_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(opts, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function juditGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(JUDIT_BASE_URL + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: { "api-key": JUDIT_API_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(opts, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function mapearStatus(data) {
  const campos = ["status", "situation", "situacao", "fase", "phase", "state", "movimento"];
  const candidatos = [];
  for (const c of campos) {
    const v = data[c];
    if (typeof v === "string" && v.trim()) candidatos.push(v.trim());
  }
  const nested = data.process ?? data.processo ?? data.lawsuit ?? data.data;
  if (nested && typeof nested === "object") {
    for (const c of campos) {
      const v = nested[c];
      if (typeof v === "string" && v.trim()) candidatos.push(v.trim());
    }
  }
  const statusOriginal = candidatos[0] ?? "Não Informado";
  const t = statusOriginal.toLowerCase();

  let statusResumido = "em_analise_inicial";
  if (/movimento|andamento|ativo|tramit|em curso/.test(t)) statusResumido = "em_andamento";
  else if (/senten[çc]a|concluso|julgado/.test(t)) statusResumido = "aguardando_sentenca";
  else if (/audi[eê]ncia/.test(t)) statusResumido = "aguardando_audiencia";
  else if (/recurso|apela[çc][aã]o|agravo|embargos/.test(t)) statusResumido = "em_recurso";
  else if (/execu[çc][aã]o|cumprimento/.test(t)) statusResumido = "cumprimento_de_sentenca";
  else if (/arquivado|baixado|extinto|encerrado/.test(t)) statusResumido = "arquivado_encerrado";
  else if (/acordo|negocia[çc][aã]o|concilia[çc][aã]o/.test(t)) statusResumido = "acordo_negociacao";
  else if (/ganho|procedente|favorav/.test(t)) statusResumido = "concluido_ganho";
  else if (/improcedente|perdido|desfavorav/.test(t)) statusResumido = "concluido_perdido";
  else if (/documento|pend[eê]ncia/.test(t)) statusResumido = "aguardando_documentos";
  else if (/protocolado|distribu[ií]do|petici/.test(t)) statusResumido = "protocolado";
  return { statusResumido, statusOriginal };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const conn = await createConnection(DB_URL);
console.log("✅ Conectado ao banco.");

// Buscar todos os processos com CNJ válido
const [processos] = await conn.execute(
  `SELECT id, cnj FROM processos WHERE cnj IS NOT NULL AND cnj != '' ORDER BY id LIMIT 200`
);
console.log(`📋 ${processos.length} processos encontrados para atualizar.`);

// ─── FASE 1: Criar requisições Judit ─────────────────────────────────────────
console.log("\n─── FASE 1: Criando requisições Judit ─────────────────────────");
let criadas = 0, errosCriacao = 0;
const requestMap = new Map(); // cnj → requestId

const BATCH = 5;
for (let i = 0; i < processos.length; i += BATCH) {
  const lote = processos.slice(i, i + BATCH);
  await Promise.all(lote.map(async (p) => {
    try {
      // Verificar se já existe requisição recente (< 7 dias)
      const [existing] = await conn.execute(
        `SELECT request_id, status, created_at FROM judit_requests WHERE cnj = ? ORDER BY created_at DESC LIMIT 1`,
        [p.cnj]
      );
      if (existing.length > 0) {
        const diasDesde = (Date.now() - new Date(existing[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (diasDesde < 7 && existing[0].status !== "error") {
          requestMap.set(p.cnj, existing[0].request_id);
          return;
        }
      }

      const res = await juditPost("/requests", {
        search: { search_type: "lawsuit_cnj", search_key: p.cnj },
        cache_ttl_in_days: 7,
      });
      const requestId = res.request_id ?? res.id;
      if (!requestId) throw new Error(`Sem requestId: ${JSON.stringify(res)}`);

      // Salvar no banco
      await conn.execute(
        `INSERT INTO judit_requests (cnj, request_id, status, processo_id, created_at, updated_at)
         VALUES (?, ?, 'processing', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE status='processing', updated_at=NOW()`,
        [p.cnj, requestId, p.id]
      );
      requestMap.set(p.cnj, requestId);
      criadas++;
    } catch (err) {
      console.error(`  ❌ Erro CNJ=${p.cnj}: ${err.message}`);
      errosCriacao++;
    }
  }));

  if (i % 50 === 0 && i > 0) {
    console.log(`  Progresso: ${i}/${processos.length} (${criadas} criadas, ${errosCriacao} erros)`);
  }
  await sleep(300); // respeitar rate limit
}

console.log(`\n✅ Fase 1 concluída: ${criadas} requisições criadas, ${errosCriacao} erros.`);
console.log(`   Total com requestId mapeado: ${requestMap.size}`);

// ─── FASE 2: Aguardar e coletar resultados ────────────────────────────────────
console.log("\n─── FASE 2: Aguardando processamento (90s)... ──────────────────");
await sleep(90_000);

console.log("Coletando resultados...");
let atualizados = 0, semResultado = 0, errosColeta = 0;

const entries = [...requestMap.entries()];
for (let i = 0; i < entries.length; i += BATCH) {
  const lote = entries.slice(i, i + BATCH);
  await Promise.all(lote.map(async ([cnj, requestId]) => {
    try {
      // Buscar resultado diretamente pelo request_id
      const resData = await juditGet(`/responses?request_id=${requestId}`);
      const reqStatus = (resData.request_status ?? "").toLowerCase();
      const pageData = resData.page_data ?? [];

      if (reqStatus === "completed" && pageData.length > 0) {
        const responseData = pageData[0].response_data ?? pageData[0];
        const { statusResumido, statusOriginal } = mapearStatus(responseData);
        await conn.execute(
          `UPDATE processos SET status_resumido=?, status_original=?, ultima_atualizacao_api=NOW(),
           judit_process_id=?, sem_atualizacao_7dias=0, updated_at=NOW() WHERE cnj=?`,
          [statusResumido, statusOriginal, requestId, cnj]
        );
        await conn.execute(
          `UPDATE judit_requests SET status='completed', updated_at=NOW() WHERE request_id=?`,
          [requestId]
        );
        atualizados++;
      } else if (reqStatus === "processing" || reqStatus === "") {
        semResultado++; // ainda processando
      } else {
        await conn.execute(
          `UPDATE judit_requests SET status='completed', updated_at=NOW() WHERE request_id=?`,
          [requestId]
        );
        semResultado++;
      }
    } catch (err) {
      console.error(`  ❌ Erro coleta CNJ=${cnj}: ${err.message}`);
      errosColeta++;
    }
  }));
  await sleep(200);
}

await conn.end();

console.log("\n─── Resultado Final ────────────────────────────────────────────");
console.log(`✅ Processos atualizados com status Judit : ${atualizados}`);
console.log(`⏳ Sem resultado ainda (processing)       : ${semResultado}`);
console.log(`❌ Erros na coleta                         : ${errosColeta}`);
console.log("\nPara coletar os restantes, use o botão 'Coletar Resultados' no admin.");
