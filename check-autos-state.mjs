import { createConnection } from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
const cleanUrl = DB_URL.replace(/ssl=%7BrejectUnauthorized%3Atrue%7D/gi, '').replace(/ssl=\{rejectUnauthorized:true\}/gi, '');
const conn = await createConnection({ uri: cleanUrl, ssl: { rejectUnauthorized: false } });

const [rows] = await conn.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN url_s3 IS NOT NULL AND url_s3 != '' THEN 1 ELSE 0 END) as com_url_s3,
    SUM(CASE WHEN url_s3 IS NULL OR url_s3 = '' THEN 1 ELSE 0 END) as sem_url_s3
  FROM processo_autos 
  WHERE processo_id = (
    SELECT id FROM processos WHERE cnj = '0800238-58.2025.8.10.0065'
  )
`);

console.log("=== Estado atual do banco ===");
console.table(rows);

// Mostrar os primeiros 5 com URL
const [comUrl] = await conn.execute(`
  SELECT id, attachment_id, LEFT(nome_arquivo, 40) as nome, extensao, tamanho_bytes,
         LEFT(url_s3, 70) as url_s3_preview
  FROM processo_autos 
  WHERE processo_id = (SELECT id FROM processos WHERE cnj = '0800238-58.2025.8.10.0065')
    AND url_s3 IS NOT NULL AND url_s3 != ''
  LIMIT 5
`);

if (comUrl.length > 0) {
  console.log("\n=== Primeiros 5 com URL S3 ===");
  console.table(comUrl);
}

await conn.end();
