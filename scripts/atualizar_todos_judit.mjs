/**
 * Atualiza todos os processos do banco via API Judit.
 * Fluxo: POST /requests → polling GET /requests/{id} → GET /responses
 * Itera todos os objetos do array page_data conforme orientação do suporte Judit.
 */

import mysql from 'mysql2/promise';

const JUDIT_BASE_URL = process.env.JUDIT_BASE_URL ?? 'https://requests.prod.judit.io';
const JUDIT_API_KEY  = process.env.JUDIT_API_KEY ?? '';
const DATABASE_URL   = process.env.DATABASE_URL ?? '';

const MAX_POLL = 24;        // 24 × 5s = 120s por processo
const POLL_MS  = 5_000;
const REQ_DELAY = 300;      // ms entre requisições para evitar rate limit

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function juditFetch(path, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${JUDIT_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'api-key': JUDIT_API_KEY, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status}: ${b}`); }
    return await res.json();
  } finally { clearTimeout(t); }
}

async function criarRequisicao(cnj) {
  const data = await juditFetch('/requests', {
    method: 'POST',
    body: JSON.stringify({ search: { search_type: 'lawsuit_cnj', search_key: cnj } }),
  });
  return data.request_id ?? data.id;
}

async function verificarStatus(requestId) {
  const data = await juditFetch(`/requests/${requestId}`);
  const s = (data.status ?? data.state ?? 'processing').toLowerCase();
  if (s === 'completed' || s === 'done' || s === 'success') return 'completed';
  if (s === 'error' || s === 'failed' || s === 'canceled') return 'error';
  return 'processing';
}

async function obterResultado(requestId) {
  const data = await juditFetch(`/responses?request_id=${requestId}`);
  const pageData = data.page_data ?? [];
  if (!Array.isArray(pageData) || pageData.length === 0) return null;

  let melhor = null;
  let melhorScore = -1;

  for (let i = 0; i < pageData.length; i++) {
    const entry = pageData[i];
    if (entry.response_type === 'ia') continue;
    const rd = (entry.response_data ?? {});

    const isNotFound =
      rd.code === 2 ||
      (typeof rd.message === 'string' && rd.message.includes('NOT_FOUND')) ||
      (typeof rd.status === 'string' && rd.status.toLowerCase().includes('not_found'));

    if (isNotFound) continue;

    const steps    = rd.steps    ?? entry.steps    ?? [];
    const parties  = rd.parties  ?? entry.parties  ?? [];
    const hasStatus = typeof rd.status === 'string' && rd.status.length > 0;
    const score = steps.length * 2 + parties.length + (hasStatus ? 10 : 0);

    if (score > melhorScore) {
      melhorScore = score;
      melhor = { ...rd, steps, parties, attachments: rd.attachments ?? entry.attachments ?? [] };
    }
  }
  return melhor;
}

function mapearStatus(data) {
  const p = data ?? {};
  const candidatos = ['situation','status','phase','state'].map(c => p[c]).filter(v => typeof v === 'string' && v.trim());
  const statusOriginal = candidatos[0] ?? 'Não Informado';
  const texto = statusOriginal.toLowerCase();
  const phaseVal = (typeof p.phase === 'string' ? p.phase : '').toLowerCase();
  const statusVal = (typeof p.status === 'string' ? p.status : '').toLowerCase();
  const t = `${texto} ${phaseVal} ${statusVal}`;

  let statusResumido = 'em_analise_inicial';
  if (/arquivado|extinto|encerrado|baixa definitiva|baixado/.test(t) || texto === 'finalizado' || statusVal === 'finalizado') statusResumido = 'arquivado_encerrado';
  else if (/^ativo$|^ativa$|movimento|andamento|tramit|em curso/.test(texto) || /^ativo$|^ativa$/.test(statusVal)) statusResumido = 'em_andamento';
  else if (/sentença|concluso|julgado|aguarda.*despacho|aguarda.*senten/.test(t)) statusResumido = 'aguardando_sentenca';
  else if (/audiência|pauta/.test(t)) statusResumido = 'aguardando_audiencia';
  else if (/recurso|apelação|agravo|embargos|2ª.*inst|segunda.*inst/.test(t)) statusResumido = 'em_recurso';
  else if (/execução|cumprimento/.test(t)) statusResumido = 'cumprimento_de_sentenca';
  else if (/acordo|negociação|conciliação|trânsito.*julgado/.test(t)) statusResumido = 'acordo_negociacao';
  else if (/procedente|ganho|favorav|provido/.test(t)) statusResumido = 'concluido_ganho';
  else if (/improcedente|perdido|desfavorav|não provido/.test(t)) statusResumido = 'concluido_perdido';
  else if (/documento|pendência/.test(t)) statusResumido = 'aguardando_documentos';
  else if (/protocolado|distribuído|petici|inicial|citação/.test(t)) statusResumido = 'protocolado';

  return { statusResumido, statusOriginal };
}

async function main() {
  if (!JUDIT_API_KEY) { console.error('JUDIT_API_KEY não configurada'); process.exit(1); }

  const conn = await mysql.createConnection(DATABASE_URL);
  const [processos] = await conn.execute('SELECT id, cnj FROM processos ORDER BY id');
  console.log(`\n🔍 Total de processos: ${processos.length}\n`);

  const resultados = { atualizados: 0, notFound: 0, erros: 0, timeout: 0 };
  const detalhes = [];

  for (let i = 0; i < processos.length; i++) {
    const { id, cnj } = processos[i];
    const progresso = `[${i+1}/${processos.length}]`;
    process.stdout.write(`${progresso} CNJ: ${cnj} → `);

    try {
      // Criar requisição
      const requestId = await criarRequisicao(cnj);
      process.stdout.write(`requestId=${requestId} → `);

      // Polling
      let status = 'processing';
      let resultado = null;
      for (let p = 0; p < MAX_POLL; p++) {
        await sleep(POLL_MS);
        status = await verificarStatus(requestId);
        if (status === 'completed') {
          resultado = await obterResultado(requestId);
          break;
        }
        if (status === 'error') break;
        process.stdout.write('.');
      }

      if (status === 'processing') {
        console.log('⏱ TIMEOUT');
        resultados.timeout++;
        detalhes.push({ cnj, resultado: 'timeout' });
        continue;
      }

      if (status === 'error') {
        console.log('❌ ERRO');
        resultados.erros++;
        detalhes.push({ cnj, resultado: 'erro' });
        continue;
      }

      if (!resultado) {
        console.log('🔴 NOT_FOUND');
        resultados.notFound++;
        detalhes.push({ cnj, resultado: 'not_found' });
        // Marcar no banco como not_found
        await conn.execute(
          'UPDATE processos SET ultima_atualizacao_api = NOW() WHERE id = ?',
          [id]
        );
        continue;
      }

      // Atualizar banco
      const { statusResumido, statusOriginal } = mapearStatus(resultado);
      const rawPayload = JSON.stringify(resultado);
      await conn.execute(
        `UPDATE processos SET 
          status_resumido = ?, 
          status_original = ?, 
          raw_payload = ?,
          ultima_atualizacao_api = NOW()
         WHERE id = ?`,
        [statusResumido, statusOriginal, rawPayload, id]
      );

      console.log(`✅ ${statusResumido} (${statusOriginal})`);
      resultados.atualizados++;
      detalhes.push({ cnj, resultado: 'ok', statusResumido, statusOriginal });

    } catch (err) {
      console.log(`❌ ERRO: ${err.message}`);
      resultados.erros++;
      detalhes.push({ cnj, resultado: 'erro', erro: err.message });
    }

    // Pausa entre requisições
    await sleep(REQ_DELAY);
  }

  await conn.end();

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESULTADO FINAL:');
  console.log(`   ✅ Atualizados:  ${resultados.atualizados}`);
  console.log(`   🔴 Not Found:    ${resultados.notFound}`);
  console.log(`   ⏱  Timeout:      ${resultados.timeout}`);
  console.log(`   ❌ Erros:        ${resultados.erros}`);
  console.log('═'.repeat(60));

  // Salvar relatório
  const relatorio = { timestamp: new Date().toISOString(), total: processos.length, ...resultados, detalhes };
  const fs = await import('fs');
  fs.writeFileSync('/home/ubuntu/relatorio_atualizacao_judit.json', JSON.stringify(relatorio, null, 2));
  console.log('\n📄 Relatório salvo em: /home/ubuntu/relatorio_atualizacao_judit.json');
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
