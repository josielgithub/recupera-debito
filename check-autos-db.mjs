import { createConnection } from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

// Corrigir SSL profile inválido na URL
const cleanUrl = DB_URL.replace(/ssl=%7BrejectUnauthorized%3Atrue%7D/gi, 'ssl=true').replace(/ssl=\{rejectUnauthorized:true\}/gi, '');
const conn = await createConnection({ uri: cleanUrl, ssl: { rejectUnauthorized: false } });

// 1. Verificar primeiros 5 registros do processo 90015
const [rows] = await conn.execute(
  `SELECT id, attachment_id, LEFT(nome_arquivo, 50) as nome, 
   extensao, instancia, status_anexo,
   CASE WHEN url_s3 IS NOT NULL AND url_s3 != '' THEN 'SIM' ELSE 'NAO' END as tem_url
   FROM processo_autos WHERE processo_id = 90015 ORDER BY id LIMIT 10`
);
console.log("\n=== Registros processo_autos (processo 90015) ===");
console.table(rows);

// 2. Verificar quantos têm attachment_id vazio
const [stats] = await conn.execute(
  `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN attachment_id IS NULL OR attachment_id = '' THEN 1 ELSE 0 END) as sem_attachment_id,
    SUM(CASE WHEN url_s3 IS NOT NULL AND url_s3 != '' THEN 1 ELSE 0 END) as com_url_s3
   FROM processo_autos`
);
console.log("\n=== Estatísticas gerais ===");
console.table(stats);

await conn.end();
