import mysql from './node_modules/mysql2/promise.js';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== JUDIT_REQUESTS (últimos 5) ===');
const [rows1] = await conn.execute(
  'SELECT id, request_id, cnj, status, created_at FROM judit_requests ORDER BY created_at DESC LIMIT 5'
);
rows1.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== JUDIT_REQUESTS nos últimos 10 minutos ===');
const [rows3] = await conn.execute(
  "SELECT id, request_id, cnj, status, created_at FROM judit_requests WHERE created_at >= NOW() - INTERVAL 10 MINUTE ORDER BY created_at DESC"
);
console.log('Total encontrados:', rows3.length);
rows3.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== JUDIT_CONSULTA_LOG (últimos 5) ===');
const [rows2] = await conn.execute(
  'SELECT id, tipo, descricao, created_at FROM judit_consulta_log ORDER BY created_at DESC LIMIT 5'
);
rows2.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== JUDIT_CONSULTA_LOG nos últimos 10 minutos ===');
const [rows4] = await conn.execute(
  "SELECT id, tipo, descricao, created_at FROM judit_consulta_log WHERE created_at >= NOW() - INTERVAL 10 MINUTE ORDER BY created_at DESC"
);
console.log('Total encontrados:', rows4.length);
rows4.forEach(r => console.log(JSON.stringify(r)));

await conn.end();
