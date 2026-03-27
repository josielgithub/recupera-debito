/**
 * Reprocessa os processos que já têm judit_request completed
 * mas sem raw_payload salvo no banco.
 * Usa GET /responses?request_id={id} para buscar o payload completo.
 */
import { createConnection } from "mysql2/promise";
import https from "https";

const API_KEY = process.env.JUDIT_API_KEY;
const BASE_URL = "requests.prod.judit.io";

if (!API_KEY) {
  console.error("JUDIT_API_KEY não configurada");
  process.exit(1);
}

function juditGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE_URL,
      path,
      method: "GET",
      headers: { "api-key": API_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(d)); } catch { reject(new Error("JSON inválido: " + d.slice(0, 100))); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);

  // Buscar todos os judit_requests com status=completed
  const [requests] = await conn.execute(
    `SELECT jr.request_id, jr.cnj, p.raw_payload IS NULL AS sem_payload
     FROM judit_requests jr
     JOIN processos p ON p.cnj = jr.cnj
     WHERE jr.status = 'completed'
     ORDER BY jr.created_at DESC`
  );

  console.log(`Total de requests completed: ${requests.length}`);
  const semPayload = requests.filter((r) => r.sem_payload);
  console.log(`Sem payload salvo: ${semPayload.length}`);

  let atualizados = 0;
  let erros = 0;
  let semDados = 0;

  for (const req of requests) {
    try {
      const data = await juditGet(`/responses?request_id=${req.request_id}`);

      if (!data.page_data || !Array.isArray(data.page_data) || data.page_data.length === 0) {
        semDados++;
        continue;
      }

      const entry = data.page_data[0];
      const payload = {
        ...(entry.response_data ?? {}),
        parties: entry.parties ?? [],
        steps: entry.steps ?? [],
        attachments: entry.attachments ?? [],
      };

      // Extrair status do payload
      const situation = payload.situation ?? payload.status ?? payload.phase ?? "Não Informado";

      await conn.execute(
        `UPDATE processos SET raw_payload = ?, status_original = ?, ultima_atualizacao_api = NOW()
         WHERE cnj = ?`,
        [JSON.stringify(payload), situation, req.cnj]
      );

      atualizados++;
      process.stdout.write(`\r[${atualizados}/${requests.length}] CNJ: ${req.cnj} → ${situation}     `);
    } catch (err) {
      erros++;
      console.error(`\nErro no CNJ ${req.cnj}: ${err.message}`);
    }

    // Rate limit: 180 req/min → ~300ms entre chamadas
    await sleep(350);
  }

  await conn.end();
  console.log(`\n\n=== CONCLUÍDO ===`);
  console.log(`Atualizados: ${atualizados}`);
  console.log(`Sem dados: ${semDados}`);
  console.log(`Erros: ${erros}`);
}

main().catch(console.error);
