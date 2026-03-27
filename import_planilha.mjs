/**
 * Script de importação da planilha Excel diretamente no banco MySQL.
 * Uso: node import_planilha.mjs <caminho_planilha>
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const planilhaPath = process.argv[2] || "/home/ubuntu/upload/modelo_importacao_recupera_debito_marcos_recupera.xlsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizarCpf(cpf) {
  if (!cpf) return null;
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function normalizarCnj(cnj) {
  if (!cnj) return null;
  return String(cnj).trim().replace(/\s+/g, "");
}

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
const wb = XLSX.readFile(planilhaPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`📋 ${rows.length} linhas lidas da planilha.`);

// ─── Conectar ao banco ────────────────────────────────────────────────────────
const conn = await createConnection(DB_URL);
console.log("✅ Conectado ao banco.");

let importados = 0, atualizados = 0, erros = 0, ignorados = 0;
const errosDetalhe = [];

for (const row of rows) {
  try {
    const cpf = normalizarCpf(row.cpf);
    const nome = String(row.nome || "").trim();
    const cnj = normalizarCnj(row.cnj);
    const statusResumido = normalizarStatus(row.status_interno);
    const statusOriginal = row.status_interno ? String(row.status_interno).trim() : null;
    const advogado = row.advogado ? String(row.advogado).trim() : null;
    const nomeEscritorio = row.nome_escritorio ? String(row.nome_escritorio).trim() : null;
    const whatsapp = row.whatsapp_escritorio ? String(row.whatsapp_escritorio).trim() : null;
    const email = row.email_escritorio ? String(row.email_escritorio).trim() : null;

    if (!cpf || !nome || !cnj) {
      ignorados++;
      errosDetalhe.push(`Linha ignorada (dados incompletos): CPF=${row.cpf}, CNJ=${row.cnj}`);
      continue;
    }

    // 1. Upsert parceiro
    let parceiroId = null;
    if (nomeEscritorio) {
      await conn.execute(
        `INSERT INTO parceiros (nome_escritorio, whatsapp, email, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE whatsapp=VALUES(whatsapp), email=VALUES(email), updated_at=NOW()`,
        [nomeEscritorio, whatsapp || null, email || null]
      );
      const [rows2] = await conn.execute(
        `SELECT id FROM parceiros WHERE nome_escritorio = ? LIMIT 1`,
        [nomeEscritorio]
      );
      parceiroId = rows2[0]?.id ?? null;
    }

    // 2. Upsert cliente
    await conn.execute(
      `INSERT INTO clientes (cpf, nome, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nome=VALUES(nome), updated_at=NOW()`,
      [cpf, nome]
    );
    const [clienteRows] = await conn.execute(
      `SELECT id FROM clientes WHERE cpf = ? LIMIT 1`,
      [cpf]
    );
    const clienteId = clienteRows[0]?.id;
    if (!clienteId) { erros++; continue; }

    // 3. Upsert processo
    const [existing] = await conn.execute(
      `SELECT id FROM processos WHERE cnj = ? LIMIT 1`,
      [cnj]
    );

    if (existing.length > 0) {
      await conn.execute(
        `UPDATE processos SET
           cliente_id=?, parceiro_id=?, status_resumido=?, status_original=?,
           advogado=?, fonte_atualizacao='judit', updated_at=NOW()
         WHERE cnj=?`,
        [clienteId, parceiroId, statusResumido, statusOriginal, advogado, cnj]
      );
      atualizados++;
    } else {
      await conn.execute(
        `INSERT INTO processos
           (cnj, cliente_id, parceiro_id, status_resumido, status_original, advogado,
            fonte_atualizacao, sem_atualizacao_7dias, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'judit', 0, NOW(), NOW())`,
        [cnj, clienteId, parceiroId, statusResumido, statusOriginal, advogado]
      );
      importados++;
    }
  } catch (err) {
    erros++;
    errosDetalhe.push(`Erro na linha CNJ=${row.cnj}: ${err.message}`);
  }
}

await conn.end();

console.log("\n─── Resultado da Importação ───────────────────────────────");
console.log(`✅ Novos processos inseridos : ${importados}`);
console.log(`🔄 Processos atualizados     : ${atualizados}`);
console.log(`⏭  Linhas ignoradas          : ${ignorados}`);
console.log(`❌ Erros                      : ${erros}`);
if (errosDetalhe.length > 0) {
  console.log("\nDetalhes dos erros/ignorados (primeiros 10):");
  errosDetalhe.slice(0, 10).forEach(e => console.log(" -", e));
}
