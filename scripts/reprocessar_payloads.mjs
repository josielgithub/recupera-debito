/**
 * Script para reprocessar processos que foram salvos com o envelope da Judit
 * em vez do response_data correto.
 * Identifica processos onde raw_payload tem chave "response_id" (envelope)
 * mas não tem "name" (dados do processo).
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const JUDIT_BASE = 'https://requests.prod.judit.io';

if (!JUDIT_API_KEY) {
  console.error('JUDIT_API_KEY não encontrada');
  process.exit(1);
}

const headers = {
  'api-key': JUDIT_API_KEY,
  'Content-Type': 'application/json',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapearStatus(status, phase) {
  if (!status) return 'em_analise_inicial';
  const s = status.toLowerCase();
  const p = (phase || '').toLowerCase();
  const texto = `${s} ${p}`;

  if (/arquivado|extinto|encerrado|baixa definitiva|baixado/.test(texto) ||
      (s === 'finalizado' && /arquivado|extinto|encerrado/.test(p)) ||
      s === 'finalizado') return 'arquivado_encerrado';
  if (/^ativo$|^ativa$|movimento|andamento|tramit|em curso/.test(s)) return 'em_andamento';
  if (/sentença|concluso|julgado|aguarda.*despacho/.test(texto)) return 'aguardando_sentenca';
  if (/audiência|pauta/.test(texto)) return 'aguardando_audiencia';
  if (/recurso|apelação|agravo|embargos/.test(texto)) return 'em_recurso';
  if (/execução|cumprimento/.test(texto)) return 'cumprimento_de_sentenca';
  if (/protocolado|distribuído|petici|inicial|citação/.test(texto)) return 'protocolado';
  return 'em_andamento';
}

function extrairNomeCliente(name) {
  if (!name) return null;
  const partes = name.split(' X ');
  if (partes.length >= 2) return partes[0].trim();
  return name.trim();
}

async function criarRequest(cnj) {
  const resp = await fetch(`${JUDIT_BASE}/requests`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      search: { search_type: 'lawsuit_cnj', search_key: cnj },
      cache_ttl_in_days: 0,
    }),
  });
  if (!resp.ok) throw new Error(`POST /requests ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.request_id || data.id;
}

async function aguardarRequest(requestId, maxTentativas = 25) {
  for (let i = 0; i < maxTentativas; i++) {
    await sleep(3000 + i * 500);
    const resp = await fetch(`${JUDIT_BASE}/requests/${requestId}`, { headers });
    if (!resp.ok) continue;
    const data = await resp.json();
    const status = (data.request_status || data.status || 'processing').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'success') return true;
    if (status === 'failed' || status === 'error') return false;
  }
  return false;
}

async function obterResponse(requestId) {
  const resp = await fetch(`${JUDIT_BASE}/responses?request_id=${requestId}`, { headers });
  if (!resp.ok) throw new Error(`GET /responses ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  if (data.page_data && Array.isArray(data.page_data) && data.page_data.length > 0) {
    const entry = data.page_data[0];
    const rd = entry.response_data || {};
    if (rd.code && rd.message) return null; // Erro da API
    return {
      ...rd,
      steps: rd.steps || entry.steps || [],
      parties: rd.parties || entry.parties || [],
      attachments: rd.attachments || entry.attachments || [],
    };
  }
  return null;
}

async function vincularCliente(conn, processoId, nomeCliente) {
  if (!nomeCliente) return null;
  const [rows] = await conn.execute('SELECT id FROM clientes WHERE nome = ?', [nomeCliente]);
  let clienteId;
  if (rows.length > 0) {
    clienteId = rows[0].id;
  } else {
    const [res] = await conn.execute('INSERT INTO clientes (nome) VALUES (?)', [nomeCliente]);
    clienteId = res.insertId;
  }
  await conn.execute('UPDATE processos SET cliente_id = ? WHERE id = ?', [clienteId, processoId]);
  return clienteId;
}

async function processarCNJ(conn, row) {
  const { id, cnj } = row;
  try {
    process.stdout.write(`\n[${cnj}] Buscando...`);
    const requestId = await criarRequest(cnj);
    process.stdout.write(` ${requestId.substring(0,8)}... aguardando`);

    const ok = await aguardarRequest(requestId);
    if (!ok) {
      process.stdout.write(` TIMEOUT\n`);
      return { cnj, status: 'timeout' };
    }

    process.stdout.write(` done. Obtendo...`);
    const payload = await obterResponse(requestId);
    if (!payload) {
      process.stdout.write(` NOT_FOUND\n`);
      return { cnj, status: 'not_found' };
    }

    const statusOriginal = payload.status || 'Não Informado';
    const phase = payload.phase || '';
    const statusResumido = mapearStatus(statusOriginal, phase);
    const nomeCompleto = payload.name || '';
    const nomeCliente = nomeCompleto ? extrairNomeCliente(nomeCompleto) : null;

    await conn.execute(
      `UPDATE processos SET raw_payload=?, status_original=?, status_resumido=?, ultima_atualizacao_api=NOW() WHERE id=?`,
      [JSON.stringify(payload), statusOriginal, statusResumido, id]
    );

    let clienteId = null;
    if (nomeCliente) clienteId = await vincularCliente(conn, id, nomeCliente);

    process.stdout.write(` ✓ ${statusResumido} | ${nomeCliente || 'sem nome'}\n`);
    return { cnj, status: 'ok', statusResumido, nomeCliente };
  } catch (err) {
    process.stdout.write(` ERRO: ${err.message}\n`);
    return { cnj, status: 'erro', erro: err.message };
  }
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Buscar processos com payload de envelope (tem response_id mas não tem name diretamente)
  // Esses são os que foram salvos incorretamente pelo script anterior
  const [rows] = await conn.execute(`
    SELECT id, cnj, raw_payload FROM processos
    WHERE raw_payload IS NOT NULL
      AND JSON_EXTRACT(raw_payload, '$.response_id') IS NOT NULL
      AND JSON_EXTRACT(raw_payload, '$.name') IS NULL
    ORDER BY id
  `);

  console.log(`\n=== Reprocessando ${rows.length} processos com payload de envelope ===`);

  const resultados = [];
  const LOTE = 4;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    const res = await Promise.all(lote.map(row => processarCNJ(conn, row)));
    resultados.push(...res);
    console.log(`\n--- Lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(rows.length / LOTE)} (${i + lote.length}/${rows.length}) ---`);
    if (i + LOTE < rows.length) await sleep(1000);
  }

  await conn.end();

  const ok = resultados.filter(r => r.status === 'ok').length;
  const notFound = resultados.filter(r => r.status === 'not_found').length;
  const timeout = resultados.filter(r => r.status === 'timeout').length;
  const erro = resultados.filter(r => r.status === 'erro').length;

  console.log('\n=== RESUMO ===');
  console.log(`✓ Atualizados: ${ok}`);
  console.log(`○ Não encontrados na Judit: ${notFound}`);
  console.log(`⏱ Timeout: ${timeout}`);
  console.log(`✗ Erros: ${erro}`);
  console.log(`Total: ${resultados.length}`);

  if (notFound > 0) {
    console.log('\nProcessos não encontrados na Judit:');
    resultados.filter(r => r.status === 'not_found').forEach(r => console.log(`  ${r.cnj}`));
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
