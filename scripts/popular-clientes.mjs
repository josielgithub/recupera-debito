/**
 * Script de migração retroativa: extrai o nome do cliente do campo `name`
 * do raw_payload de cada processo e cria/vincula o registro na tabela clientes.
 *
 * Uso: node scripts/popular-clientes.mjs
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}

function extrairNomeCliente(nomeProcesso) {
  if (!nomeProcesso) return null;
  const partes = nomeProcesso.split(/ X /i);
  const nome = partes[0]?.trim() ?? null;
  return nome && nome.length > 1 ? nome : null;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("Conectado ao banco de dados.");

  // Buscar todos os processos sem cliente vinculado que têm raw_payload com name
  const [rows] = await conn.execute(
    `SELECT id, cnj, JSON_UNQUOTE(raw_payload->>'$.name') AS nome_processo
     FROM processos
     WHERE cliente_id IS NULL
       AND raw_payload IS NOT NULL
       AND JSON_UNQUOTE(raw_payload->>'$.name') IS NOT NULL
       AND JSON_UNQUOTE(raw_payload->>'$.name') != 'null'`
  );

  console.log(`Encontrados ${rows.length} processos sem cliente vinculado.`);

  let criados = 0;
  let vinculados = 0;
  let ignorados = 0;

  for (const row of rows) {
    const nomeCliente = extrairNomeCliente(row.nome_processo);
    if (!nomeCliente) {
      ignorados++;
      continue;
    }

    try {
      // Verificar se cliente já existe pelo nome
      const [existentes] = await conn.execute(
        "SELECT id FROM clientes WHERE nome = ? LIMIT 1",
        [nomeCliente]
      );

      let clienteId;
      if (existentes.length > 0) {
        clienteId = existentes[0].id;
      } else {
        // Criar novo cliente
        const [result] = await conn.execute(
          "INSERT INTO clientes (nome) VALUES (?)",
          [nomeCliente]
        );
        clienteId = result.insertId;
        criados++;
      }

      // Vincular ao processo
      await conn.execute(
        "UPDATE processos SET cliente_id = ? WHERE id = ?",
        [clienteId, row.id]
      );
      vinculados++;

      if (vinculados % 10 === 0) {
        console.log(`  Progresso: ${vinculados} vinculados...`);
      }
    } catch (err) {
      console.error(`  Erro no processo ${row.cnj}:`, err.message);
      ignorados++;
    }
  }

  console.log(`\nMigração concluída:`);
  console.log(`  Clientes criados: ${criados}`);
  console.log(`  Processos vinculados: ${vinculados}`);
  console.log(`  Ignorados (sem nome válido): ${ignorados}`);

  await conn.end();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
