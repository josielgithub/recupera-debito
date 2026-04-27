import { createConnection } from "mysql2/promise";

const conn = await createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log("=== Processos com autos solicitados mas sem registros em processo_autos ===");
const [aguardando] = await conn.execute(`
  SELECT 
    p.id, p.cnj, p.autos_solicitado_em, p.autos_disponivel_em, p.autos_disponiveis,
    COUNT(pa.id) as total_autos,
    SUM(CASE WHEN pa.url_s3 IS NOT NULL AND pa.url_s3 != '' THEN 1 ELSE 0 END) as com_url_s3
  FROM processos p
  LEFT JOIN processo_autos pa ON pa.processo_id = p.id
  WHERE p.autos_solicitado_em IS NOT NULL
  GROUP BY p.id
  ORDER BY p.autos_solicitado_em DESC
  LIMIT 15
`);
console.table(aguardando);

console.log("\n=== judit_requests para esses processos (últimas 20 com tipo download_autos) ===");
const [requests] = await conn.execute(`
  SELECT 
    jr.id, jr.cnj, jr.request_id, jr.status, jr.created_at, jr.updated_at,
    jcl.tipo, jcl.custo
  FROM judit_requests jr
  LEFT JOIN judit_consulta_log jcl ON jcl.request_id = jr.request_id
  WHERE jcl.tipo = 'download_autos' OR jr.cnj IN (
    SELECT cnj FROM processos WHERE autos_solicitado_em IS NOT NULL
  )
  ORDER BY jr.created_at DESC
  LIMIT 20
`);
console.table(requests);

await conn.end();
