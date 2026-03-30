/**
 * Script para buscar na API Judit todos os processos sem dados válidos
 * e atualizar seus dados no banco de dados.
 *
 * Fluxo correto:
 * 1. POST /requests com o CNJ → obtém requestId
 * 2. Polling GET /requests/:requestId até request_status = "done"
 * 3. GET /responses?request_id=:requestId → obtém payload completo (response_data)
 * 4. Atualiza banco: raw_payload, status_resumido, status_original, cliente vinculado
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
  console.error('JUDIT_API_KEY não encontrada no .env');
  process.exit(1);
}

const headers = {
  'api-key': JUDIT_API_KEY,
  'Content-Type': 'application/json',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapearStatus(status, phase) {
  if (!status) return 'em_analise_inicial';
  const s = status.toLowerCase();
  const p = (phase || '').toLowerCase();

  if (/arquivado|extinto|encerrado|baixa definitiva|baixado/.test(`${s} ${p}`) ||
      (s === 'finalizado' && /arquivado|extinto|encerrado/.test(p)) ||
      s === 'finalizado') {
    return 'arquivado_encerrado';
  }
  if (/^ativo$|^ativa$|movimento|andamento|tramit|em curso/.test(s)) return 'em_andamento';
  if (/sentença|concluso|julgado|aguarda.*despacho/.test(`${s} ${p}`)) return 'aguardando_sentenca';
  if (/audiência|pauta/.test(`${s} ${p}`)) return 'aguardando_audiencia';
  if (/recurso|apelação|agravo|embargos/.test(`${s} ${p}`)) return 'em_recurso';
  if (/execução|cumprimento/.test(`${s} ${p}`)) return 'cumprimento_de_sentenca';
  if (/protocolado|distribuído|petici|inicial|citação/.test(`${s} ${p}`)) return 'protocolado';
  return 'em_andamento';
}

function extrairNomeCliente(name) {
  if (!name) return null;
  const partes = name.split(' X ');
  if (partes.length >= 2) return partes[0].trim();
  return name.trim();
}

// ─── Judit API ───────────────────────────────────────────────────────────────

async function criarRequest(cnj) {
  const resp = await fetch(`${JUDIT_BASE}/requests`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      search: {
        search_type: 'lawsuit_cnj',
        search_key: cnj,
      },
      cache_ttl_in_days: 0, // Forçar nova busca
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`POST /requests falhou (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  return data.request_id || data.id;
}

async function verificarStatus(requestId) {
  const resp = await fetch(`${JUDIT_BASE}/requests/${requestId}`, { headers });
  if (!resp.ok) return 'processing';
  const data = await resp.json();
  const status = (data.request_status || data.status || 'processing').toLowerCase();
  if (status === 'done' || status === 'completed' || status === 'success') return 'done';
  if (status === 'failed' || status === 'error') return 'error';
  return 'processing';
}

async function aguardarRequest(requestId, maxTentativas = 30) {
  for (let i = 0; i < maxTentativas; i++) {
    const waitMs = 3000 + i * 1000;
    await sleep(waitMs);
    const status = await verificarStatus(requestId);
    if (status === 'done') return true;
    if (status === 'error') return false;
    if (i % 5 === 0) process.stdout.write('.');
  }
  return false;
}

async function obterResponse(requestId) {
  const resp = await fetch(`${JUDIT_BASE}/responses?request_id=${requestId}`, { headers });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`GET /responses falhou (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  // Formato Judit: { page_data: [{ response_data: {...} }] }
  if (data.page_data && Array.isArray(data.page_data) && data.page_data.length > 0) {
    const entry = data.page_data[0];
    const rd = entry.response_data || {};
    // Verificar se é erro (LAWSUIT_NOT_FOUND)
    if (rd.code && rd.message) {
      console.warn(`  Response com erro: ${JSON.stringify(rd)}`);
      return null;
    }
    return {
      ...rd,
      steps: rd.steps || entry.steps || [],
      parties: rd.parties || entry.parties || [],
      attachments: rd.attachments || entry.attachments || [],
    };
  }
  if (Array.isArray(data)) return data[0] || null;
  return null;
}

// ─── Banco ───────────────────────────────────────────────────────────────────

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

// ─── Processar um CNJ ────────────────────────────────────────────────────────

async function processarCNJ(conn, row) {
  const { id, cnj } = row;
  try {
    process.stdout.write(`\n[${cnj}] Criando request...`);
    const requestId = await criarRequest(cnj);
    process.stdout.write(` requestId=${requestId.substring(0,8)}... Aguardando`);

    const ok = await aguardarRequest(requestId);
    if (!ok) {
      console.log(` TIMEOUT`);
      return { cnj, status: 'timeout' };
    }

    process.stdout.write(` OK. Obtendo response...`);
    const payload = await obterResponse(requestId);
    if (!payload) {
      console.log(` VAZIO`);
      return { cnj, status: 'vazio' };
    }

    const statusOriginal = payload.status || 'Não Informado';
    const phase = payload.phase || '';
    const statusResumido = mapearStatus(statusOriginal, phase);
    const nomeCompleto = payload.name || '';
    const nomeCliente = nomeCompleto ? extrairNomeCliente(nomeCompleto) : null;

    await conn.execute(
      `UPDATE processos SET 
         raw_payload = ?,
         status_original = ?,
         status_resumido = ?,
         ultima_atualizacao_api = NOW()
       WHERE id = ?`,
      [JSON.stringify(payload), statusOriginal, statusResumido, id]
    );

    let clienteId = null;
    if (nomeCliente) {
      clienteId = await vincularCliente(conn, id, nomeCliente);
    }

    console.log(` ✓ ${statusResumido} | ${nomeCliente || 'sem cliente'}`);
    return { cnj, status: 'ok', statusResumido, nomeCliente };
  } catch (err) {
    console.log(` ERRO: ${err.message}`);
    return { cnj, status: 'erro', erro: err.message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Buscar processos sem dados válidos: raw_payload nulo, vazio, ou com erro LAWSUIT_NOT_FOUND
  // Também inclui os em_analise_inicial que ainda não foram atualizados
  const [rows] = await conn.execute(`
    SELECT id, cnj FROM processos 
    WHERE status_resumido = 'em_analise_inicial'
       OR raw_payload IS NULL
       OR JSON_EXTRACT(raw_payload, '$.code') = 2
    ORDER BY id
  `);

  console.log(`\n=== Processando ${rows.length} processos ===\n`);

  const resultados = [];
  // Processar sequencialmente para não sobrecarregar a API
  // (cada processo demora ~5-15s, 76 processos = ~10-20min)
  const LOTE = 3;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    // Processar em paralelo dentro do lote
    const res = await Promise.all(lote.map(row => processarCNJ(conn, row)));
    resultados.push(...res);
    console.log(`\n--- Lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(rows.length / LOTE)} concluído (${i + lote.length}/${rows.length}) ---`);
    if (i + LOTE < rows.length) await sleep(2000);
  }

  await conn.end();

  // Resumo
  const ok = resultados.filter(r => r.status === 'ok').length;
  const timeout = resultados.filter(r => r.status === 'timeout').length;
  const erro = resultados.filter(r => r.status === 'erro').length;
  const vazio = resultados.filter(r => r.status === 'vazio').length;

  console.log('\n=== RESUMO FINAL ===');
  console.log(`✓ Atualizados com sucesso: ${ok}`);
  console.log(`⏱ Timeout/sem resposta:    ${timeout}`);
  console.log(`✗ Erros:                   ${erro}`);
  console.log(`○ Response vazio/erro API: ${vazio}`);
  console.log(`Total:                     ${resultados.length}`);

  if (timeout > 0 || erro > 0 || vazio > 0) {
    console.log('\nProcessos com problema:');
    resultados.filter(r => r.status !== 'ok').forEach(r => {
      console.log(`  ${r.cnj}: ${r.status}${r.erro ? ' - ' + r.erro : ''}`);
    });
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
