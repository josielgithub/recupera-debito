/**
 * Importa apenas os processos do advogado Marcos(RD) da planilha.
 * Planilha sem CPF/nome — campos: cnj, status_interno, advogado, nome_escritorio, whatsapp, email
 */
import { createConnection } from "mysql2/promise";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL não definida"); process.exit(1); }

const PLANILHA = "/home/ubuntu/upload/modelo_importacao_recupera_debito_marcos_recupera.xlsx";
const FILTRO_ADVOGADO = "Marcos(RD)";

function normalizarStatus(s) {
  if (!s) return "em_analise_inicial";
  const t = String(s).toLowerCase().trim();
  if (/protocolado|distribu/.test(t)) return "protocolado";
  if (/andamento|ativo|tramit/.test(t)) return "em_andamento";
  if (/audi[eê]ncia/.test(t)) return "aguardando_audiencia";
  if (/senten[çc]a|concluso/.test(t)) return "aguardando_sentenca";
  if (/recurso|apela/.test(t)) return "em_recurso";
  if (/execu[çc]|cumprimento/.test(t)) return "cumprimento_de_sentenca";
  if (/ganho|procedente/.test(t)) return "concluido_ganho";
  if (/improcedente|perdido/.test(t)) return "concluido_perdido";
  if (/arquivado|baixado|extinto/.test(t)) return "arquivado_encerrado";
  if (/acordo|negocia/.test(t)) return "acordo_negociacao";
  if (/documento|pend/.test(t)) return "aguardando_documentos";
  return "em_analise_inicial";
}

// ─── Ler planilha ─────────────────────────────────────────────────────────────
const wb = XLSX.readFile(PLANILHA);
const ws = wb.Sheets[wb.SheetNames[0]];
const todasLinhas = XLSX.utils.sheet_to_json(ws, { defval: null });

// Filtrar apenas Marcos(RD) com CNJ preenchido
const linhas = todasLinhas.filter(row => {
  const adv = String(row.advogado || "").trim();
  const cnj = String(row.cnj || "").trim();
  return adv === FILTRO_ADVOGADO && cnj.length > 5;
});

console.log(`📋 Total na planilha: ${todasLinhas.length} linhas`);
console.log(`✅ Filtrados (${FILTRO_ADVOGADO} com CNJ): ${linhas.length} processos`);

// ─── Conectar ao banco ────────────────────────────────────────────────────────
const conn = await createConnection(DB_URL);
console.log("✅ Conectado ao banco.\n");

let inseridos = 0, atualizados = 0, erros = 0, ignorados = 0;

for (const row of linhas) {
  try {
    const cnj = String(row.cnj || "").trim();
    const statusResumido = normalizarStatus(row.status_interno);
    const statusOriginal = row.status_interno ? String(row.status_interno).trim() : null;
    const advogado = row.advogado ? String(row.advogado).trim() : null;
    const nomeEscritorio = row.nome_escritorio ? String(row.nome_escritorio).trim() : null;
    const whatsapp = row.whatsapp_escritorio ? String(row.whatsapp_escritorio).trim() : null;
    const email = row.email_escritorio ? String(row.email_escritorio).trim() : null;

    if (!cnj) { ignorados++; continue; }

    // 1. Upsert parceiro
    let parceiroId = null;
    if (nomeEscritorio) {
      await conn.execute(
        `INSERT INTO parceiros (nome_escritorio, whatsapp, email, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE whatsapp=VALUES(whatsapp), email=VALUES(email), updated_at=NOW()`,
        [nomeEscritorio, whatsapp || null, email || null]
      );
      const [rows] = await conn.execute(
        `SELECT id FROM parceiros WHERE nome_escritorio = ? LIMIT 1`,
        [nomeEscritorio]
      );
      parceiroId = rows[0]?.id ?? null;
    }

    // 2. Upsert processo (sem cliente — planilha não tem CPF/nome)
    const [existing] = await conn.execute(
      `SELECT id FROM processos WHERE cnj = ? LIMIT 1`, [cnj]
    );

    if (existing.length > 0) {
      await conn.execute(
        `UPDATE processos SET parceiro_id=?, status_resumido=?, status_original=?,
         advogado=?, fonte_atualizacao='judit', updated_at=NOW() WHERE cnj=?`,
        [parceiroId, statusResumido, statusOriginal, advogado, cnj]
      );
      atualizados++;
    } else {
      await conn.execute(
        `INSERT INTO processos
           (cnj, cliente_id, parceiro_id, status_resumido, status_original, advogado,
            fonte_atualizacao, sem_atualizacao_7dias, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, 'judit', 0, NOW(), NOW())`,
        [cnj, parceiroId, statusResumido, statusOriginal, advogado]
      );
      inseridos++;
    }
  } catch (err) {
    erros++;
    console.error(`  ❌ Erro CNJ=${row.cnj}: ${err.message}`);
  }
}

await conn.end();

console.log("─── Resultado da Importação ───────────────────────────────");
console.log(`✅ Novos processos inseridos : ${inseridos}`);
console.log(`🔄 Processos atualizados     : ${atualizados}`);
console.log(`⏭  Ignorados (sem CNJ)       : ${ignorados}`);
console.log(`❌ Erros                      : ${erros}`);
console.log(`\nTotal importado: ${inseridos + atualizados} processos do ${FILTRO_ADVOGADO}`);
