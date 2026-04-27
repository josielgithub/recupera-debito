import mysql2 from "mysql2/promise";
import https from "https";

const CNJ = "0800142-82.2025.8.12.0034";
const JUDIT_KEY = process.env.JUDIT_API_KEY;

const dbUrl = new URL(process.env.DATABASE_URL);
const conn = await mysql2.createConnection({
  host: dbUrl.hostname, port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username, password: dbUrl.password,
  database: dbUrl.pathname.replace("/", ""), ssl: { rejectUnauthorized: false },
});

// 1. Ver processo e judit_requests
const [rows] = await conn.execute(
  "SELECT id, cnj, autos_disponiveis, autos_solicitado_em FROM processos WHERE cnj = ?",
  [CNJ]
);
const proc = rows[0];
console.log("Processo:", proc.id, proc.cnj, "autosDisp:", proc.autos_disponiveis);

const [reqs] = await conn.execute(
  "SELECT request_id, status, created_at FROM judit_requests WHERE processo_id = ? ORDER BY created_at DESC LIMIT 5",
  [proc.id]
);
console.log("\nJudit requests:");
reqs.forEach(r => console.log("  -", r.request_id, "|", r.status, "|", r.created_at));

// 2. Consultar o request_id na API Judit para ver se tem attachments
if (reqs.length > 0) {
  const reqId = reqs[0].request_id;
  console.log(`\nConsultando request ${reqId} na API Judit...`);
  
  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: "requests.prod.judit.io",
      path: `/requests/${reqId}`,
      method: "GET",
      headers: { "api-key": JUDIT_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
  
  console.log("HTTP Status:", result.status);
  if (result.status === 200 && result.body) {
    const r = result.body;
    console.log("Status da requisição:", r.status || r.request_status);
    const atts = r.response?.attachments || r.data?.attachments || r.attachments || 
                 r.response?.page_data?.attachments || [];
    console.log("Attachments na resposta:", atts.length);
    if (atts.length > 0) {
      atts.slice(0, 5).forEach(a => {
        console.log(`  - ID: ${a.id} | ${a.name || a.attachment_name} | status: ${a.status}`);
      });
    }
    // Mostrar chaves do objeto para debug
    const topKeys = Object.keys(r).join(", ");
    console.log("Chaves top-level:", topKeys);
    if (r.response) console.log("Chaves response:", Object.keys(r.response).join(", "));
  } else {
    console.log("Resposta:", JSON.stringify(result.body).substring(0, 300));
  }
}

await conn.end();
