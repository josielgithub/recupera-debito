/**
 * Script: buscar_cnj_individual.mjs
 * Busca um CNJ específico na API Judit com polling e salva no banco.
 */

import mysql from 'mysql2/promise';

const JUDIT_BASE_URL = process.env.JUDIT_BASE_URL || 'https://requests.prod.judit.io';
const JUDIT_API_KEY = process.env.JUDIT_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

const CNJ = process.argv[2] || '0800142-82.2025.8.12.0034';

console.log(`\n🔍 Buscando CNJ: ${CNJ}`);
console.log(`📡 Judit URL: ${JUDIT_BASE_URL}`);
console.log(`🔑 API Key: ${JUDIT_API_KEY ? '✓ configurada' : '✗ não encontrada'}\n`);

async function juditFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${JUDIT_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'api-key': JUDIT_API_KEY,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapearStatus(data) {
  const payload = data;
  const camposPrioridade = ['situation', 'status', 'phase', 'state'];
  const candidatos = [];
  for (const campo of camposPrioridade) {
    const val = payload[campo];
    if (typeof val === 'string' && val.trim() && val.trim().toLowerCase() !== 'null') {
      candidatos.push(val.trim());
    }
  }
  const statusOriginal = candidatos[0] ?? 'Não Informado';
  const texto = statusOriginal.toLowerCase();
  const phaseVal = (typeof payload.phase === 'string' ? payload.phase : '').toLowerCase();
  const statusVal = (typeof payload.status === 'string' ? payload.status : '').toLowerCase();
  const textoCompleto = `${texto} ${phaseVal} ${statusVal}`;

  let statusResumido = 'em_analise_inicial';
  if (/arquivado|extinto|encerrado|baixa definitiva|baixado/.test(textoCompleto) ||
      (statusVal === 'finalizado' && /arquivado|extinto|encerrado/.test(phaseVal)) ||
      texto === 'finalizado' || statusVal === 'finalizado') {
    statusResumido = 'arquivado_encerrado';
  } else if (/^ativo$|^ativa$|movimento|andamento|tramit|em curso|em andamento/.test(texto) ||
             /^ativo$|^ativa$/.test(statusVal)) {
    statusResumido = 'em_andamento';
  } else if (/sentença|concluso|julgado|aguarda.*despacho|aguarda.*senten/.test(textoCompleto)) {
    statusResumido = 'aguardando_sentenca';
  } else if (/audiência|pauta/.test(textoCompleto)) {
    statusResumido = 'aguardando_audiencia';
  } else if (/recurso|apelação|agravo|embargos|2ª.*inst|segunda.*inst/.test(textoCompleto)) {
    statusResumido = 'em_recurso';
  } else if (/execução|cumprimento/.test(textoCompleto)) {
    statusResumido = 'cumprimento_de_sentenca';
  } else if (/acordo|negociação|conciliação|trânsito.*julgado/.test(textoCompleto)) {
    statusResumido = 'acordo_negociacao';
  } else if (/procedente|ganho|favorav|provido/.test(textoCompleto)) {
    statusResumido = 'concluido_ganho';
  } else if (/improcedente|perdido|desfavorav|não provido/.test(textoCompleto)) {
    statusResumido = 'concluido_perdido';
  } else if (/documento|pendência/.test(textoCompleto)) {
    statusResumido = 'aguardando_documentos';
  } else if (/protocolado|distribuído|petici|inicial|citação/.test(textoCompleto)) {
    statusResumido = 'protocolado';
  }
  return { statusResumido, statusOriginal };
}

async function main() {
  // 1. Criar requisição na Judit
  console.log('📤 Etapa 1: Criando requisição na Judit...');
  let requestId;
  try {
    const data = await juditFetch('/requests', {
      method: 'POST',
      body: JSON.stringify({
        search: { search_type: 'lawsuit_cnj', search_key: CNJ },
        cache_ttl_in_days: 7,
      }),
    });
    requestId = data.request_id ?? data.id;
    if (!requestId) throw new Error(`Resposta sem requestId: ${JSON.stringify(data)}`);
    console.log(`   ✓ requestId: ${requestId}`);
  } catch (err) {
    console.error(`   ✗ Erro ao criar requisição: ${err.message}`);
    process.exit(1);
  }

  // 2. Polling
  console.log('\n⏳ Etapa 2: Aguardando processamento (polling)...');
  let resultado = null;
  const MAX_TENTATIVAS = 20;
  const INTERVALO = 5000;

  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    await sleep(INTERVALO);
    const statusData = await juditFetch(`/requests/${requestId}`);
    const status = (statusData.status ?? statusData.state ?? 'processing').toLowerCase();
    console.log(`   Tentativa ${i + 1}/${MAX_TENTATIVAS}: status = ${status}`);

    if (status === 'completed' || status === 'done' || status === 'success') {
      // Buscar resultado
      const respData = await juditFetch(`/responses?request_id=${requestId}`);
      if (respData.page_data && Array.isArray(respData.page_data) && respData.page_data.length > 0) {
        const entry = respData.page_data[0];
        const rd = entry.response_data ?? {};
        resultado = {
          ...rd,
          steps: rd.steps ?? entry.steps ?? [],
          parties: rd.parties ?? entry.parties ?? [],
          attachments: rd.attachments ?? entry.attachments ?? [],
        };
      }
      break;
    }
    if (status === 'error' || status === 'failed') {
      console.error('   ✗ Requisição retornou erro na Judit.');
      break;
    }
  }

  if (!resultado) {
    console.log('\n⚠️  Nenhum resultado obtido da Judit (timeout ou processo não encontrado).');
    process.exit(0);
  }

  // Verificar LAWSUIT_NOT_FOUND
  if (resultado.code === 2 || (typeof resultado.message === 'string' && resultado.message.includes('NOT_FOUND'))) {
    console.log('\n⚠️  Processo não encontrado na base da Judit (LAWSUIT_NOT_FOUND).');
    console.log('   Este CNJ pode pertencer a um tribunal não indexado pela Judit.');
    process.exit(0);
  }

  console.log('\n✅ Resultado obtido da Judit:');
  console.log(`   Nome: ${resultado.name ?? '—'}`);
  console.log(`   Status: ${resultado.status ?? resultado.situation ?? resultado.phase ?? '—'}`);
  console.log(`   Tribunal: ${resultado.court ?? resultado.tribunal ?? '—'}`);
  console.log(`   Vara: ${resultado.court_division ?? resultado.vara ?? '—'}`);
  console.log(`   Partes: ${(resultado.parties ?? []).length}`);
  console.log(`   Movimentações: ${(resultado.steps ?? []).length}`);

  // 3. Mapear status
  const { statusResumido, statusOriginal } = mapearStatus(resultado);
  console.log(`\n🏷️  Status mapeado: ${statusOriginal} → ${statusResumido}`);

  // 4. Salvar no banco
  console.log('\n💾 Etapa 3: Salvando no banco de dados...');
  let conn;
  try {
    conn = await mysql.createConnection(DATABASE_URL);

    // Verificar se já existe
    const [existing] = await conn.execute('SELECT id FROM processos WHERE cnj = ?', [CNJ]);

    let processoId;
    let criado = false;

    if (existing.length > 0) {
      processoId = existing[0].id;
      await conn.execute(
        `UPDATE processos SET status_resumido = ?, status_original = ?, ultima_atualizacao_api = NOW(),
         raw_payload = ?, sem_atualizacao_7dias = 0, judit_process_id = ? WHERE cnj = ?`,
        [statusResumido, statusOriginal, JSON.stringify(resultado), requestId, CNJ]
      );
      console.log(`   ✓ Processo existente atualizado (id=${processoId})`);
    } else {
      const [insertResult] = await conn.execute(
        `INSERT INTO processos (cnj, status_resumido, status_original, ultima_atualizacao_api,
         raw_payload, sem_atualizacao_7dias, fonte_atualizacao, judit_process_id)
         VALUES (?, ?, ?, NOW(), ?, 0, 'judit', ?)`,
        [CNJ, statusResumido, statusOriginal, JSON.stringify(resultado), requestId]
      );
      processoId = insertResult.insertId;
      criado = true;
      console.log(`   ✓ Novo processo criado (id=${processoId})`);
    }

    // Vincular cliente a partir do campo name
    const nomeProcesso = resultado.name;
    if (nomeProcesso) {
      const partes = nomeProcesso.split(/ X /i);
      const nomeCliente = partes[0]?.trim();
      if (nomeCliente && nomeCliente.length > 1) {
        // Verificar se cliente já existe
        const [clienteExist] = await conn.execute(
          'SELECT id FROM clientes WHERE nome = ? LIMIT 1', [nomeCliente]
        );
        let clienteId;
        if (clienteExist.length > 0) {
          clienteId = clienteExist[0].id;
          console.log(`   ✓ Cliente existente encontrado: "${nomeCliente}" (id=${clienteId})`);
        } else {
          const [clienteInsert] = await conn.execute(
            'INSERT INTO clientes (nome) VALUES (?)', [nomeCliente]
          );
          clienteId = clienteInsert.insertId;
          console.log(`   ✓ Novo cliente criado: "${nomeCliente}" (id=${clienteId})`);
        }
        await conn.execute('UPDATE processos SET cliente_id = ? WHERE cnj = ?', [clienteId, CNJ]);
        console.log(`   ✓ Cliente vinculado ao processo`);
      }
    }

    // Registrar requisição Judit
    const [reqExist] = await conn.execute(
      'SELECT id FROM judit_requests WHERE request_id = ? LIMIT 1', [requestId]
    );
    if (reqExist.length === 0) {
      await conn.execute(
        `INSERT INTO judit_requests (cnj, request_id, status, processo_id)
         VALUES (?, ?, 'completed', ?)
         ON DUPLICATE KEY UPDATE status = 'completed'`,
        [CNJ, requestId, processoId]
      );
    } else {
      await conn.execute(
        "UPDATE judit_requests SET status = 'completed' WHERE request_id = ?", [requestId]
      );
    }

    console.log('\n🎉 RESUMO FINAL:');
    console.log(`   CNJ: ${CNJ}`);
    console.log(`   Ação: ${criado ? 'CRIADO' : 'ATUALIZADO'}`);
    console.log(`   Status: ${statusOriginal} → ${statusResumido}`);
    console.log(`   Cliente: ${resultado.name ? resultado.name.split(/ X /i)[0]?.trim() : '—'}`);
    console.log(`   Partes: ${(resultado.parties ?? []).length}`);
    console.log(`   Movimentações: ${(resultado.steps ?? []).length}`);

  } catch (err) {
    console.error(`   ✗ Erro ao salvar no banco: ${err.message}`);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(console.error);
