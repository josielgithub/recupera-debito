/**
 * Verifica os 7 request_ids pendentes diretamente na API da Judit
 * e atualiza o banco conforme o status retornado.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { config } from "dotenv";
config();

const mysql = require("mysql2/promise");

const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE_URL = process.env.JUDIT_BASE_URL ?? "https://requests.prod.judit.io";

async function juditFetch(path) {
  const url = `${JUDIT_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      "api-key": JUDIT_API_KEY,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [pendentes] = await conn.execute(
    "SELECT request_id, cnj FROM judit_requests WHERE status = 'processing' ORDER BY created_at ASC"
  );

  console.log(`\n=== ${pendentes.length} requisições pendentes ===\n`);

  const resultados = [];

  for (const { request_id, cnj } of pendentes) {
    console.log(`Verificando CNJ ${cnj}`);
    console.log(`  request_id: ${request_id}`);

    try {
      const data = await juditFetch(`/requests/${request_id}`);
      
      // A Judit pode retornar diferentes campos dependendo da versão
      const reqStatus = data?.status ?? data?.request_status ?? data?.state ?? "unknown";
      const rawData = JSON.stringify(data).substring(0, 300);
      
      console.log(`  → Status Judit: "${reqStatus}"`);
      console.log(`  → Resposta: ${rawData}`);

      // Normalizar status
      const isCompleted = ["completed", "done", "finished", "success"].includes(reqStatus?.toLowerCase());
      const isError = ["error", "failed", "cancelled", "canceled", "not_found"].includes(reqStatus?.toLowerCase());

      if (isCompleted) {
        await conn.execute(
          "UPDATE judit_requests SET status = 'completed', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "completed", statusJudit: reqStatus });
        console.log(`  ✓ Atualizado para COMPLETED\n`);
      } else if (isError) {
        await conn.execute(
          "UPDATE judit_requests SET status = 'error', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "error", statusJudit: reqStatus });
        console.log(`  ✗ Atualizado para ERROR\n`);
      } else {
        resultados.push({ cnj, request_id, resultado: "ainda_processing", statusJudit: reqStatus });
        console.log(`  ⏳ Ainda processando (status: ${reqStatus})\n`);
      }
    } catch (err) {
      const msg = err.message ?? String(err);
      console.log(`  ✗ Erro: ${msg}`);

      if (msg.includes("404") || msg.includes("not found") || msg.includes("Not Found")) {
        await conn.execute(
          "UPDATE judit_requests SET status = 'error', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "error", statusJudit: "404_not_found" });
        console.log(`  ✗ Marcado como ERROR (request_id não encontrado na Judit)\n`);
      } else {
        resultados.push({ cnj, request_id, resultado: "erro_consulta", statusJudit: msg });
        console.log(`  ⚠ Mantido como processing (erro de rede)\n`);
      }
    }

    await sleep(300);
  }

  // Contagem final
  const [contagem] = await conn.execute(
    "SELECT status, COUNT(*) as total FROM judit_requests GROUP BY status"
  );

  console.log("════════════════════════════════════════");
  console.log("RESULTADO FINAL");
  console.log("════════════════════════════════════════\n");

  const completed = resultados.filter(r => r.resultado === "completed");
  const errors = resultados.filter(r => r.resultado === "error");
  const aindaProcessing = resultados.filter(r => r.resultado === "ainda_processing");
  const erroConsulta = resultados.filter(r => r.resultado === "erro_consulta");

  console.log(`✓ Atualizadas para COMPLETED: ${completed.length}`);
  completed.forEach(r => console.log(`   CNJ: ${r.cnj} | Status Judit: ${r.statusJudit}`));

  console.log(`\n✗ Atualizadas para ERROR: ${errors.length}`);
  errors.forEach(r => console.log(`   CNJ: ${r.cnj} | Motivo: ${r.statusJudit}`));

  if (aindaProcessing.length > 0) {
    console.log(`\n⏳ Ainda em PROCESSING na Judit: ${aindaProcessing.length}`);
    aindaProcessing.forEach(r => console.log(`   CNJ: ${r.cnj} | Status: ${r.statusJudit}`));
  }

  if (erroConsulta.length > 0) {
    console.log(`\n⚠ Erro de rede (mantidos como processing): ${erroConsulta.length}`);
    erroConsulta.forEach(r => console.log(`   CNJ: ${r.cnj} | Erro: ${r.statusJudit}`));
  }

  console.log("\n─── Contagem atual na tabela judit_requests ───");
  contagem.forEach(r => console.log(`   ${r.status}: ${r.total}`));

  const processingRestante = contagem.find(r => r.status === "processing");
  const qtd = processingRestante ? Number(processingRestante.total) : 0;
  console.log(`\n→ Contador "Requisições processando": ${qtd} ${qtd === 0 ? "✓ ZERADO" : "⚠ AINDA HÁ PENDENTES"}`);

  await conn.end();
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
