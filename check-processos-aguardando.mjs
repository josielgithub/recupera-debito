import { createConnection } from "mysql2/promise";

const conn = await createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Processos com autos solicitados
const [rows] = await conn.execute(`
  SELECT 
    p.id, p.cnj, 
    p.autos_solicitado_em, 
    p.autos_disponivel_em, 
    p.autos_disponiveis,
    COUNT(pa.id) as total_autos,
    SUM(CASE WHEN pa.url_s3 IS NOT NULL AND pa.url_s3 != '' THEN 1 ELSE 0 END) as com_url_s3
  FROM processos p
  LEFT JOIN processo_autos pa ON pa.processo_id = p.id
  WHERE p.autos_solicitado_em IS NOT NULL
  GROUP BY p.id
  ORDER BY p.autos_solicitado_em DESC
  LIMIT 15
`);

console.log("=== Processos com autos solicitados ===");
for (const r of rows) {
  console.log(`CNJ: ${r.cnj} | solicitado: ${r.autos_solicitado_em?.toISOString().slice(0,16)} | disponivel: ${r.autos_disponivel_em ? r.autos_disponivel_em.toISOString().slice(0,16) : 'N/A'} | disponiveis: ${r.autos_disponiveis} | total_autos: ${r.total_autos} | com_s3: ${r.com_url_s3}`);
}

await conn.end();
