/**
 * Script manual para coletar resultados de requisições Judit pendentes.
 * Equivalente a chamar admin.juditColetarResultados via tRPC.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Carregar variáveis de ambiente
import { config } from "dotenv";
config();

const mysql = require("mysql2/promise");

const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE_URL = "https://api.judit.io";

if (!JUDIT_API_KEY) {
  console.error("JUDIT_API_KEY não configurada");
  process.exit(1);
}

async function juditFetch(path, opts = {}) {
  const url = `${JUDIT_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${JUDIT_API_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judit ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Buscar todos os registros com status = processing
  const [pendentes] = await conn.execute(
    "SELECT request_id, cnj FROM judit_requests WHERE status = 'processing' ORDER BY created_at ASC"
  );

  console.log(`\n=== ${pendentes.length} requisições pendentes encontradas ===\n`);

  const resultados = [];

  for (const row of pendentes) {
    const { request_id, cnj } = row;
    console.log(`Verificando CNJ ${cnj} (request_id: ${request_id})...`);

    try {
      // Verificar status na Judit
      const statusResp = await juditFetch(`/requests/${request_id}`);
      const reqStatus = statusResp?.status ?? statusResp?.request_status ?? "unknown";

      console.log(`  → Status Judit: ${reqStatus}`);

      if (reqStatus === "completed" || reqStatus === "done" || reqStatus === "finished") {
        // Atualizar para completed no banco
        await conn.execute(
          "UPDATE judit_requests SET status = 'completed', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "completed", statusJudit: reqStatus });
        console.log(`  ✓ Atualizado para completed`);
      } else if (reqStatus === "error" || reqStatus === "failed" || reqStatus === "cancelled") {
        // Atualizar para error no banco
        await conn.execute(
          "UPDATE judit_requests SET status = 'error', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "error", statusJudit: reqStatus });
        console.log(`  ✗ Atualizado para error`);
      } else {
        // Ainda processing na Judit
        resultados.push({ cnj, request_id, resultado: "ainda_processing", statusJudit: reqStatus });
        console.log(`  ⏳ Ainda em processamento na Judit (status: ${reqStatus})`);
      }
    } catch (err) {
      console.log(`  ✗ Erro ao consultar Judit: ${err.message}`);
      // Marcar como error se não conseguiu verificar (request_id inválido ou expirado)
      if (err.message.includes("404") || err.message.includes("not found")) {
        await conn.execute(
          "UPDATE judit_requests SET status = 'error', updated_at = NOW() WHERE request_id = ?",
          [request_id]
        );
        resultados.push({ cnj, request_id, resultado: "error", statusJudit: "not_found_404" });
        console.log(`  ✗ Marcado como error (404 na Judit)`);
      } else {
        resultados.push({ cnj, request_id, resultado: "erro_consulta", statusJudit: err.message });
      }
    }

    // Pequena pausa para não sobrecarregar a API
    await sleep(500);
  }

  // Verificar contador final
  const [contagem] = await conn.execute(
    "SELECT status, COUNT(*) as total FROM judit_requests GROUP BY status"
  );

  console.log("\n=== RESULTADO FINAL ===\n");

  const completed = resultados.filter(r => r.resultado === "completed");
  const errors = resultados.filter(r => r.resultado === "error");
  const aindaProcessing = resultados.filter(r => r.resultado === "ainda_processing");

  console.log(`✓ Atualizadas para completed: ${completed.length}`);
  if (completed.length > 0) {
    completed.forEach(r => console.log(`   - CNJ: ${r.cnj} | Status Judit: ${r.statusJudit}`));
  }

  console.log(`✗ Atualizadas para error: ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach(r => console.log(`   - CNJ: ${r.cnj} | Status Judit: ${r.statusJudit}`));
  }

  if (aindaProcessing.length > 0) {
    console.log(`⏳ Ainda em processing na Judit: ${aindaProcessing.length}`);
    aindaProcessing.forEach(r => console.log(`   - CNJ: ${r.cnj} | Status Judit: ${r.statusJudit}`));
  }

  console.log("\n=== CONTAGEM ATUAL NA TABELA judit_requests ===");
  contagem.forEach(row => console.log(`   ${row.status}: ${row.total}`));

  const processingRestante = contagem.find(r => r.status === "processing");
  const qtdProcessing = processingRestante ? Number(processingRestante.total) : 0;
  console.log(`\n→ Contador "Requisições processando": ${qtdProcessing} ${qtdProcessing === 0 ? "✓ ZERADO" : "⚠ AINDA HÁ PENDENTES"}`);

  await conn.end();
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
