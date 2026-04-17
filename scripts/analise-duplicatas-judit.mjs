import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

// Carregar .env do projeto
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL não encontrada");
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

console.log("=".repeat(80));
console.log("ANÁLISE DE DUPLICATAS JUDIT");
console.log("=".repeat(80));

// ─── 1. CNJs duplicados em judit_consulta_log ─────────────────────────────
console.log("\n\n📋 1. CNJs com mais de uma consulta em judit_consulta_log");
console.log("-".repeat(80));
const [dupLog] = await conn.execute(`
  SELECT
    processo_cnj AS cnj,
    COUNT(*) AS total_consultas,
    SUM(custo) AS custo_total,
    MIN(created_at) AS primeira_consulta,
    MAX(created_at) AS ultima_consulta,
    GROUP_CONCAT(DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') ORDER BY created_at SEPARATOR ' | ') AS datas
  FROM judit_consulta_log
  GROUP BY processo_cnj
  HAVING COUNT(*) > 1
  ORDER BY total_consultas DESC
  LIMIT 50
`);

if (dupLog.length === 0) {
  console.log("  Nenhum CNJ consultado mais de uma vez em judit_consulta_log.");
} else {
  console.log(`  ${dupLog.length} CNJs consultados mais de uma vez:\n`);
  for (const row of dupLog) {
    console.log(`  CNJ: ${row.cnj}`);
    console.log(`    Consultas: ${row.total_consultas}x | Custo total: R$ ${Number(row.custo_total).toFixed(2)}`);
    console.log(`    Datas: ${row.datas}`);
    console.log();
  }
}

// ─── 2. CNJs duplicados em judit_requests ─────────────────────────────────
console.log("\n\n📋 2. CNJs com múltiplos requests em judit_requests");
console.log("-".repeat(80));
const [dupReq] = await conn.execute(`
  SELECT
    cnj,
    COUNT(*) AS total_requests,
    GROUP_CONCAT(request_id ORDER BY created_at SEPARATOR ' | ') AS request_ids,
    GROUP_CONCAT(status ORDER BY created_at SEPARATOR ' | ') AS statuses,
    GROUP_CONCAT(DATE_FORMAT(created_at, '%d/%m/%Y %H:%i') ORDER BY created_at SEPARATOR ' | ') AS datas
  FROM judit_requests
  GROUP BY cnj
  HAVING COUNT(*) > 1
  ORDER BY total_requests DESC
  LIMIT 50
`);

if (dupReq.length === 0) {
  console.log("  Nenhum CNJ com múltiplos requests em judit_requests.");
} else {
  console.log(`  ${dupReq.length} CNJs com múltiplos requests:\n`);
  for (const row of dupReq) {
    console.log(`  CNJ: ${row.cnj}`);
    console.log(`    Requests: ${row.total_requests}x`);
    console.log(`    Request IDs: ${row.request_ids}`);
    console.log(`    Status: ${row.statuses}`);
    console.log(`    Datas: ${row.datas}`);
    console.log();
  }
}

// ─── 3. Custo total em consultas duplicadas ───────────────────────────────
console.log("\n\n💰 3. Custo total em consultas duplicadas");
console.log("-".repeat(80));
const [custoTotal] = await conn.execute(`
  SELECT
    SUM(custo_duplicado) AS custo_total_duplicado,
    SUM(consultas_duplicadas) AS total_consultas_duplicadas,
    COUNT(*) AS cnjs_afetados
  FROM (
    SELECT
      processo_cnj,
      COUNT(*) - 1 AS consultas_duplicadas,
      (COUNT(*) - 1) * MIN(custo) AS custo_duplicado
    FROM judit_consulta_log
    GROUP BY processo_cnj
    HAVING COUNT(*) > 1
  ) sub
`);
const cd = custoTotal[0];
console.log(`  CNJs afetados: ${cd.cnjs_afetados ?? 0}`);
console.log(`  Consultas duplicadas (além da primeira): ${cd.total_consultas_duplicadas ?? 0}`);
console.log(`  Custo total desperdiçado: R$ ${Number(cd.custo_total_duplicado ?? 0).toFixed(2)}`);

// ─── 4. Total geral de consultas e custo ──────────────────────────────────
console.log("\n\n📊 4. Resumo geral de judit_consulta_log");
console.log("-".repeat(80));
const [resumo] = await conn.execute(`
  SELECT
    COUNT(*) AS total_consultas,
    COUNT(DISTINCT processo_cnj) AS cnjs_unicos,
    SUM(custo) AS custo_total,
    MIN(created_at) AS primeira_consulta,
    MAX(created_at) AS ultima_consulta
  FROM judit_consulta_log
`);
const r = resumo[0];
console.log(`  Total de consultas registradas: ${r.total_consultas}`);
console.log(`  CNJs únicos consultados: ${r.cnjs_unicos}`);
console.log(`  Custo total gasto: R$ ${Number(r.custo_total ?? 0).toFixed(2)}`);
console.log(`  Primeira consulta: ${r.primeira_consulta}`);
console.log(`  Última consulta: ${r.ultima_consulta}`);

// ─── 5. Top 10 CNJs mais consultados ─────────────────────────────────────
console.log("\n\n🏆 5. Top 10 CNJs mais consultados");
console.log("-".repeat(80));
const [top10] = await conn.execute(`
  SELECT
    processo_cnj AS cnj,
    COUNT(*) AS total_consultas,
    SUM(custo) AS custo_acumulado,
    MIN(created_at) AS primeira_consulta,
    MAX(created_at) AS ultima_consulta,
    GROUP_CONCAT(status ORDER BY created_at SEPARATOR ', ') AS statuses
  FROM judit_consulta_log
  GROUP BY processo_cnj
  ORDER BY total_consultas DESC
  LIMIT 10
`);

if (top10.length === 0) {
  console.log("  Nenhum registro em judit_consulta_log.");
} else {
  let rank = 1;
  for (const row of top10) {
    console.log(`  #${rank++} CNJ: ${row.cnj}`);
    console.log(`     Consultas: ${row.total_consultas}x | Custo acumulado: R$ ${Number(row.custo_acumulado).toFixed(2)}`);
    console.log(`     Primeira: ${row.primeira_consulta} | Última: ${row.ultima_consulta}`);
    console.log(`     Status: ${row.statuses}`);
    console.log();
  }
}

// ─── 6. Total de registros nas tabelas ────────────────────────────────────
console.log("\n\n📦 6. Contagem total das tabelas");
console.log("-".repeat(80));
const [[logCount]] = await conn.execute("SELECT COUNT(*) AS n FROM judit_consulta_log");
const [[reqCount]] = await conn.execute("SELECT COUNT(*) AS n FROM judit_requests");
console.log(`  judit_consulta_log: ${logCount.n} registros`);
console.log(`  judit_requests: ${reqCount.n} registros`);

await conn.end();
console.log("\n" + "=".repeat(80));
console.log("Análise concluída.");
