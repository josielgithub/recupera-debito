/**
 * Extrai dados completos dos processos sem cliente vinculado
 * e gera um JSON estruturado para o relatório.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function extrairTribunal(cnj) {
  // CNJ formato: NNNNNNN-DD.AAAA.J.TT.OOOO
  // J = segmento de justiça, TT = tribunal
  const match = cnj.match(/^\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}$/);
  if (!match) return { segmento: 'Desconhecido', tribunal: 'Desconhecido', sigla: 'N/A' };

  const segCod = match[1];
  const tribCod = match[2];

  const segmentos = {
    '1': 'STF', '2': 'CNJ', '3': 'STJ', '4': 'Justiça Federal',
    '5': 'Justiça do Trabalho', '6': 'Justiça Eleitoral',
    '7': 'Justiça Militar da União', '8': 'Justiça Estadual', '9': 'Justiça Militar Estadual'
  };

  const tribunaisEstaduais = {
    '01': 'TJAC', '02': 'TJAL', '03': 'TJAP', '04': 'TJAM', '05': 'TJBA',
    '06': 'TJCE', '07': 'TJDF', '08': 'TJES', '09': 'TJGO', '10': 'TJMA',
    '11': 'TJMT', '12': 'TJMS', '13': 'TJMG', '14': 'TJPA', '15': 'TJPB',
    '16': 'TJPR', '17': 'TJPE', '18': 'TJPI', '19': 'TJRJ', '20': 'TJRN',
    '21': 'TJRS', '22': 'TJRO', '23': 'TJRR', '24': 'TJSC', '25': 'TJSP',
    '26': 'TJSE', '27': 'TJTO',
  };

  const tribunaisFederais = {
    '01': 'TRF1', '02': 'TRF2', '03': 'TRF3', '04': 'TRF4', '05': 'TRF5', '06': 'TRF6',
  };

  const tribunaisTrabalho = {
    '00': 'TST', '01': 'TRT1', '02': 'TRT2', '03': 'TRT3', '04': 'TRT4',
    '05': 'TRT5', '06': 'TRT6', '07': 'TRT7', '08': 'TRT8', '09': 'TRT9',
    '10': 'TRT10', '11': 'TRT11', '12': 'TRT12', '13': 'TRT13', '14': 'TRT14',
    '15': 'TRT15', '16': 'TRT16', '17': 'TRT17', '18': 'TRT18', '19': 'TRT19',
    '20': 'TRT20', '21': 'TRT21', '22': 'TRT22', '23': 'TRT23', '24': 'TRT24',
  };

  const nomesTribunais = {
    'TJAC': 'Tribunal de Justiça do Acre', 'TJAL': 'Tribunal de Justiça de Alagoas',
    'TJAP': 'Tribunal de Justiça do Amapá', 'TJAM': 'Tribunal de Justiça do Amazonas',
    'TJBA': 'Tribunal de Justiça da Bahia', 'TJCE': 'Tribunal de Justiça do Ceará',
    'TJDF': 'Tribunal de Justiça do Distrito Federal', 'TJES': 'Tribunal de Justiça do Espírito Santo',
    'TJGO': 'Tribunal de Justiça de Goiás', 'TJMA': 'Tribunal de Justiça do Maranhão',
    'TJMT': 'Tribunal de Justiça do Mato Grosso', 'TJMS': 'Tribunal de Justiça do Mato Grosso do Sul',
    'TJMG': 'Tribunal de Justiça de Minas Gerais', 'TJPA': 'Tribunal de Justiça do Pará',
    'TJPB': 'Tribunal de Justiça da Paraíba', 'TJPR': 'Tribunal de Justiça do Paraná',
    'TJPE': 'Tribunal de Justiça de Pernambuco', 'TJPI': 'Tribunal de Justiça do Piauí',
    'TJRJ': 'Tribunal de Justiça do Rio de Janeiro', 'TJRN': 'Tribunal de Justiça do Rio Grande do Norte',
    'TJRS': 'Tribunal de Justiça do Rio Grande do Sul', 'TJRO': 'Tribunal de Justiça de Rondônia',
    'TJRR': 'Tribunal de Justiça de Roraima', 'TJSC': 'Tribunal de Justiça de Santa Catarina',
    'TJSP': 'Tribunal de Justiça de São Paulo', 'TJSE': 'Tribunal de Justiça de Sergipe',
    'TJTO': 'Tribunal de Justiça do Tocantins',
    'TRF1': 'Tribunal Regional Federal da 1ª Região', 'TRF2': 'Tribunal Regional Federal da 2ª Região',
    'TRF3': 'Tribunal Regional Federal da 3ª Região', 'TRF4': 'Tribunal Regional Federal da 4ª Região',
    'TRF5': 'Tribunal Regional Federal da 5ª Região', 'TRF6': 'Tribunal Regional Federal da 6ª Região',
    'TRT1': 'TRT da 1ª Região (RJ)', 'TRT2': 'TRT da 2ª Região (SP)',
    'TRT3': 'TRT da 3ª Região (MG)', 'TRT4': 'TRT da 4ª Região (RS)',
    'TRT5': 'TRT da 5ª Região (BA)', 'TRT15': 'TRT da 15ª Região (Campinas)',
    'TRT16': 'TRT da 16ª Região (MA)',
  };

  let sigla = 'N/A';
  if (segCod === '8') sigla = tribunaisEstaduais[tribCod] || `TJ-${tribCod}`;
  else if (segCod === '4') sigla = tribunaisFederais[tribCod] || `TRF${tribCod}`;
  else if (segCod === '5') sigla = tribunaisTrabalho[tribCod] || `TRT${tribCod}`;

  return {
    segmento: segmentos[segCod] || `Segmento ${segCod}`,
    sigla,
    nome: nomesTribunais[sigla] || sigla,
  };
}

function formatarStatus(status) {
  const mapa = {
    'em_analise_inicial': 'Em Análise Inicial',
    'em_andamento': 'Em Andamento',
    'arquivado_encerrado': 'Arquivado/Encerrado',
    'protocolado': 'Protocolado',
    'aguardando_sentenca': 'Aguardando Sentença',
    'aguardando_audiencia': 'Aguardando Audiência',
    'em_recurso': 'Em Recurso',
    'cumprimento_de_sentenca': 'Cumprimento de Sentença',
  };
  return mapa[status] || status || 'Não Informado';
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [rows] = await conn.execute(`
    SELECT 
      p.id,
      p.cnj,
      p.status_resumido,
      p.status_original,
      p.raw_payload,
      p.created_at,
      p.ultima_atualizacao_api,
      p.cliente_id
    FROM processos p
    WHERE p.cliente_id IS NULL
    ORDER BY p.cnj
  `);

  console.log(`Total de processos sem cliente: ${rows.length}`);

  const processos = rows.map(row => {
    let payload = null;
    try {
      payload = row.raw_payload ? (typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : row.raw_payload) : null;
    } catch {}

    const tribunal = extrairTribunal(row.cnj);
    const rd = payload?.response_data || payload || {};
    const temDadosValidos = rd.name && !rd.message; // Não é erro LAWSUIT_NOT_FOUND

    return {
      id: row.id,
      cnj: row.cnj,
      status_resumido: formatarStatus(row.status_resumido),
      status_original: row.status_original || 'N/A',
      tribunal_sigla: tribunal.sigla,
      tribunal_nome: tribunal.nome,
      segmento: tribunal.segmento,
      nome_processo: rd.name || 'Não encontrado na Judit',
      comarca: rd.county || rd.city || 'N/A',
      estado: rd.state || 'N/A',
      juiz: rd.judge || 'N/A',
      data_distribuicao: rd.distribution_date ? new Date(rd.distribution_date).toLocaleDateString('pt-BR') : 'N/A',
      valor: rd.amount ? `R$ ${Number(rd.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/A',
      fase: rd.phase || 'N/A',
      area: rd.area || 'N/A',
      tem_dados_judit: temDadosValidos,
      criado_em: row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : 'N/A',
      ultima_atualizacao: row.ultima_atualizacao_api ? new Date(row.ultima_atualizacao_api).toLocaleDateString('pt-BR') : 'N/A',
    };
  });

  await conn.end();

  // Salvar JSON para uso no relatório
  fs.writeFileSync('/tmp/processos_sem_cliente.json', JSON.stringify(processos, null, 2));
  console.log('JSON salvo em /tmp/processos_sem_cliente.json');

  // Estatísticas por tribunal
  const porTribunal = {};
  processos.forEach(p => {
    const k = p.tribunal_sigla;
    if (!porTribunal[k]) porTribunal[k] = { sigla: k, nome: p.tribunal_nome, total: 0, processos: [] };
    porTribunal[k].total++;
    porTribunal[k].processos.push(p.cnj);
  });

  const tribunaisOrdenados = Object.values(porTribunal).sort((a, b) => b.total - a.total);
  console.log('\n=== Por Tribunal ===');
  tribunaisOrdenados.forEach(t => console.log(`  ${t.sigla}: ${t.total} processo(s)`));

  // Estatísticas por status
  const porStatus = {};
  processos.forEach(p => {
    porStatus[p.status_resumido] = (porStatus[p.status_resumido] || 0) + 1;
  });
  console.log('\n=== Por Status ===');
  Object.entries(porStatus).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  return { processos, porTribunal: tribunaisOrdenados, porStatus };
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
