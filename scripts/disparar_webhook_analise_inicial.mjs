/**
 * Dispara requisições na Judit para todos os processos com status em_analise_inicial.
 * Não faz polling — os resultados chegarão via webhook automaticamente.
 */
import { createConnection } from '/home/ubuntu/recupera-debito/node_modules/mysql2/promise.js';

const baseUrl = 'https://requests.prod.judit.io';
const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  const conn = await createConnection(DATABASE_URL);

  // Buscar todos os processos em análise inicial
  const [rows] = await conn.execute(
    "SELECT id, cnj FROM processos WHERE status_resumido = 'em_analise_inicial' ORDER BY created_at ASC"
  );

  console.log(`Total de processos em análise inicial: ${rows.length}`);
  console.log('Disparando requisições na Judit (sem polling — webhook ativo)...\n');

  let sucesso = 0;
  let erro = 0;
  const requestIds = [];

  for (let i = 0; i < rows.length; i++) {
    const { id, cnj } = rows[i];
    try {
      const r = await fetch(baseUrl + '/requests', {
        method: 'POST',
        headers: {
          'api-key': JUDIT_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          search: { search_type: 'lawsuit_cnj', search_key: cnj }
        }),
        signal: AbortSignal.timeout(15000)
      });

      const req = await r.json();

      if (req.request_id) {
        sucesso++;
        requestIds.push({ cnj, request_id: req.request_id });
        console.log(`[${i+1}/${rows.length}] ✅ ${cnj} → requestId=${req.request_id}`);
      } else {
        erro++;
        console.log(`[${i+1}/${rows.length}] ❌ ${cnj} → Erro: ${JSON.stringify(req)}`);
      }
    } catch (e) {
      erro++;
      console.log(`[${i+1}/${rows.length}] ❌ ${cnj} → Exceção: ${e.message}`);
    }

    // Pequena pausa para não sobrecarregar a API
    await sleep(500);
  }

  await conn.end();

  console.log(`\n=== RESUMO ===`);
  console.log(`✅ Requisições criadas: ${sucesso}`);
  console.log(`❌ Erros: ${erro}`);
  console.log(`\nOs resultados chegarão automaticamente via webhook:`);
  console.log(`https://recuperadeb-futgbwve.manus.space/api/judit/webhook`);
  console.log(`\nRequest IDs gerados:`);
  requestIds.forEach(r => console.log(`  ${r.cnj} → ${r.request_id}`));
}

main().catch(console.error);
