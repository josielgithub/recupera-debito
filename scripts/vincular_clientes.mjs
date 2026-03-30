/**
 * Script para vincular clientes a todos os processos que têm raw_payload
 * mas não têm cliente_id, extraindo o nome do campo `name` da Judit.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function extrairNomeCliente(name) {
  if (!name) return null;
  const partes = name.split(' X ');
  if (partes.length >= 2) return partes[0].trim();
  return name.trim();
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Buscar todos os processos sem cliente mas com raw_payload
  const [rows] = await conn.execute(
    "SELECT id, cnj, raw_payload FROM processos WHERE cliente_id IS NULL AND raw_payload IS NOT NULL"
  );

  console.log(`Processos sem cliente mas com payload: ${rows.length}`);

  let vinculados = 0;
  let semNome = 0;

  for (const row of rows) {
    let payload;
    try {
      payload = typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : row.raw_payload;
    } catch {
      continue;
    }

    const nomeCompleto = payload.name || '';
    const nomeCliente = nomeCompleto ? extrairNomeCliente(nomeCompleto) : null;

    if (!nomeCliente) {
      semNome++;
      console.log(`  [${row.cnj}] Sem nome no payload`);
      continue;
    }

    // Buscar ou criar cliente
    const [clienteRows] = await conn.execute('SELECT id FROM clientes WHERE nome = ?', [nomeCliente]);
    let clienteId;
    if (clienteRows.length > 0) {
      clienteId = clienteRows[0].id;
    } else {
      const [res] = await conn.execute('INSERT INTO clientes (nome) VALUES (?)', [nomeCliente]);
      clienteId = res.insertId;
      console.log(`  [${row.cnj}] Novo cliente criado: ${nomeCliente} (id=${clienteId})`);
    }

    await conn.execute('UPDATE processos SET cliente_id = ? WHERE id = ?', [clienteId, row.id]);
    vinculados++;
  }

  console.log(`\nVinculados: ${vinculados}`);
  console.log(`Sem nome no payload: ${semNome}`);

  // Verificar resultado final
  const [total] = await conn.execute("SELECT COUNT(*) as t FROM processos");
  const [comCliente] = await conn.execute("SELECT COUNT(*) as t FROM processos WHERE cliente_id IS NOT NULL");
  const [semCliente] = await conn.execute("SELECT COUNT(*) as t FROM processos WHERE cliente_id IS NULL");
  console.log(`\nTotal processos: ${total[0].t}`);
  console.log(`Com cliente: ${comCliente[0].t}`);
  console.log(`Sem cliente: ${semCliente[0].t}`);

  // Contar clientes únicos
  const [totalClientes] = await conn.execute("SELECT COUNT(*) as t FROM clientes");
  console.log(`Total clientes: ${totalClientes[0].t}`);

  await conn.end();
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
