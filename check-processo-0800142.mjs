import mysql2 from "mysql2/promise";
import https from "https";

const CNJ = "0800142-82.2025.8.12.0034";

const DB_URL = process.env.DATABASE_URL;
const JUDIT_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DB_URL || !JUDIT_KEY) {
  console.error("Variáveis de ambiente não encontradas");
  process.exit(1);
}

// Parse DATABASE_URL
const url = new URL(DB_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
};

async function fetchJudit(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "lawsuits.prod.judit.io",
      path,
      method: "GET",
      headers: { "api-key": JUDIT_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const conn = await mysql2.createConnection(dbConfig);

// 1. Verificar o processo no banco
const [processos] = await conn.execute(
  "SELECT id, cnj, status_resumido, autos_disponiveis, autos_solicitado_em FROM processos WHERE cnj = ?",
  [CNJ]
);

if (processos.length === 0) {
  console.log(`❌ Processo ${CNJ} não encontrado no banco`);
  await conn.end();
  process.exit(1);
}

const processo = processos[0];
console.log("✅ Processo encontrado no banco:");
console.log(`   ID: ${processo.id}`);
console.log(`   CNJ: ${processo.cnj}`);
console.log(`   Status: ${processo.status_resumido}`);
console.log(`   Autos disponíveis: ${processo.autos_disponiveis}`);
console.log(`   Autos solicitados em: ${processo.autos_solicitado_em}`);

// 2. Verificar registros existentes em processo_autos
const [autosExistentes] = await conn.execute(
  "SELECT COUNT(*) as total, COUNT(url_s3) as com_url FROM processo_autos WHERE processo_id = ?",
  [processo.id]
);
console.log(`\n📁 Registros em processo_autos: ${autosExistentes[0].total} total, ${autosExistentes[0].com_url} com URL S3`);

// 3. Verificar request_id na tabela judit_requests
const [requests] = await conn.execute(
  "SELECT request_id, status, criado_em, atualizado_em FROM judit_requests WHERE processo_id = ? ORDER BY criado_em DESC LIMIT 5",
  [processo.id]
);
console.log(`\n📋 Últimas requisições Judit:`);
if (requests.length === 0) {
  console.log("   Nenhuma requisição encontrada");
} else {
  for (const r of requests) {
    console.log(`   ${r.request_id} | status: ${r.status} | criado: ${r.criado_em}`);
  }
}

// 4. Consultar attachments na API Judit
console.log(`\n🔍 Consultando attachments na Judit para ${CNJ}...`);
const cnjEncoded = encodeURIComponent(CNJ);
const result = await fetchJudit(`/lawsuits/${cnjEncoded}/1/attachments`);
console.log(`   HTTP Status: ${result.status}`);

if (result.status === 200) {
  const attachments = Array.isArray(result.body) ? result.body : result.body?.data || [];
  console.log(`   Total de attachments: ${attachments.length}`);
  if (attachments.length > 0) {
    console.log(`\n   Primeiros 5 attachments:`);
    for (const a of attachments.slice(0, 5)) {
      console.log(`   - ID: ${a.id} | Nome: ${a.name || a.attachment_name} | Status: ${a.status} | Tamanho: ${a.size || a.file_size || "?"}`);
    }
    // Salvar todos os attachments para uso no próximo script
    const fs = await import("fs");
    fs.writeFileSync("/tmp/attachments_0800142.json", JSON.stringify(attachments, null, 2));
    console.log(`\n   ✅ ${attachments.length} attachments salvos em /tmp/attachments_0800142.json`);
  }
} else {
  console.log(`   Resposta: ${JSON.stringify(result.body).substring(0, 200)}`);
}

await conn.end();
