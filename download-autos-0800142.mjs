import mysql2 from "mysql2/promise";
import https from "https";

const CNJ = "0800142-82.2025.8.12.0034";
const PROCESSO_ID = 30249;
const INSTANCIA = 1;
const LOTE_SIZE = 5;
const PAUSA_MS = 1000;

const DB_URL = process.env.DATABASE_URL;
const JUDIT_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const url = new URL(DB_URL);
const dbConfig = {
  host: url.hostname, port: parseInt(url.port || "3306"),
  user: url.username, password: url.password,
  database: url.pathname.replace("/", ""), ssl: { rejectUnauthorized: false },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchJudit(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "lawsuits.prod.judit.io", path, method: "GET",
      headers: { "api-key": JUDIT_KEY, "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode === 200 && res.headers["content-type"]?.includes("application/pdf")) {
          resolve({ status: res.statusCode, buffer: body, contentType: "application/pdf" });
        } else {
          try { resolve({ status: res.statusCode, body: JSON.parse(body.toString()), contentType: res.headers["content-type"] }); }
          catch { resolve({ status: res.statusCode, body: body.toString(), contentType: res.headers["content-type"] }); }
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function downloadAttachment(attachmentId) {
  const cnjEncoded = encodeURIComponent(CNJ);
  const result = await fetchJudit(`/lawsuits/${cnjEncoded}/${INSTANCIA}/attachments/${attachmentId}`);
  if (result.status !== 200) return null;
  if (result.buffer) return { buffer: result.buffer, contentType: "application/pdf" };
  return null;
}

async function uploadToS3(buffer, fileKey, contentType) {
  const forgeHost = new URL(FORGE_URL).hostname;
  const formData = new FormData();
  formData.set("file", new Blob([buffer], { type: contentType }), fileKey.split("/").pop());
  formData.set("path", fileKey);

  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${fileKey}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileKey.split("/").pop()}"\r\nContent-Type: ${contentType}\r\n\r\n`));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    const options = {
      hostname: forgeHost, path: "/v1/storage/upload", method: "POST",
      headers: {
        "Authorization": `Bearer ${FORGE_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ──────────────────────────────────────────────────────────────────────
const conn = await mysql2.createConnection(dbConfig);

// 1. Buscar attachments na Judit
console.log(`🔍 Buscando attachments para ${CNJ}...`);
const cnjEncoded = encodeURIComponent(CNJ);
const listResult = await fetchJudit(`/lawsuits/${cnjEncoded}/${INSTANCIA}/attachments`);

if (listResult.status !== 200) {
  console.error(`❌ Erro ao listar attachments: HTTP ${listResult.status}`);
  console.error(JSON.stringify(listResult.body).substring(0, 300));
  await conn.end();
  process.exit(1);
}

const attachments = Array.isArray(listResult.body) ? listResult.body : (listResult.body?.data || []);
console.log(`✅ ${attachments.length} attachments encontrados`);

if (attachments.length === 0) {
  console.log("Nenhum attachment disponível.");
  await conn.end();
  process.exit(0);
}

// Mostrar primeiros 5
console.log("\nPrimeiros 5 attachments:");
for (const a of attachments.slice(0, 5)) {
  const nome = a.name || a.attachment_name || "sem nome";
  const ext = a.extension || a.file_extension || "?";
  const status = a.status || "?";
  console.log(`  - ID: ${a.id} | ${nome}.${ext} | status: ${status}`);
}

// 2. Processar em lotes de 5
let sucesso = 0, erros = 0, ignorados = 0;
const resultados = [];

for (let i = 0; i < attachments.length; i += LOTE_SIZE) {
  const lote = attachments.slice(i, i + LOTE_SIZE);
  console.log(`\n📦 Lote ${Math.floor(i/LOTE_SIZE)+1}/${Math.ceil(attachments.length/LOTE_SIZE)} (${lote.length} arquivos)...`);

  for (const att of lote) {
    const attachmentId = att.id;
    const nome = (att.name || att.attachment_name || `doc_${attachmentId}`).trim().toUpperCase();
    const ext = (att.extension || att.file_extension || "pdf").toLowerCase();
    const tamanho = att.size || att.file_size || 0;
    const dataDoc = att.date || att.document_date || null;

    // Verificar se já existe
    const [existente] = await conn.execute(
      "SELECT id, url_s3 FROM processo_autos WHERE processo_id = ? AND attachment_id = ?",
      [PROCESSO_ID, attachmentId]
    );
    if (existente.length > 0 && existente[0].url_s3) {
      console.log(`  ⏭️  ${nome} (ID ${attachmentId}) — já baixado`);
      ignorados++;
      continue;
    }

    // Baixar da Judit
    process.stdout.write(`  ⬇️  ${nome} (ID ${attachmentId})... `);
    const dlResult = await downloadAttachment(attachmentId);

    if (!dlResult || !dlResult.buffer) {
      console.log(`❌ Falha no download`);
      erros++;
      resultados.push({ id: attachmentId, nome, status: "erro_download" });
      continue;
    }

    if (dlResult.buffer.length < 100) {
      console.log(`⚠️  Arquivo muito pequeno (${dlResult.buffer.length} bytes) — ignorado`);
      ignorados++;
      continue;
    }

    // Upload para S3
    const cnjSlug = CNJ.replace(/[^0-9]/g, "_");
    const fileKey = `autos/${cnjSlug}/${attachmentId}.${ext}`;
    const uploadResult = await uploadToS3(dlResult.buffer, fileKey, dlResult.contentType);

    if (uploadResult.status !== 200) {
      console.log(`❌ Erro no upload S3 (HTTP ${uploadResult.status})`);
      erros++;
      resultados.push({ id: attachmentId, nome, status: "erro_upload" });
      continue;
    }

    const urlS3 = uploadResult.body?.url || uploadResult.body?.data?.url || "";
    console.log(`✅ ${dlResult.buffer.length} bytes → ${urlS3.substring(0, 60)}...`);

    // Salvar/atualizar no banco
    if (existente.length > 0) {
      await conn.execute(
        "UPDATE processo_autos SET url_s3 = ?, file_key = ?, tamanho_bytes = ?, status_anexo = 'done' WHERE id = ?",
        [urlS3, fileKey, dlResult.buffer.length, existente[0].id]
      );
    } else {
      await conn.execute(
        `INSERT INTO processo_autos (processo_id, attachment_id, nome_arquivo, extensao, tamanho_bytes, data_documento, url_s3, file_key, instancia, status_anexo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', NOW(), NOW())`,
        [PROCESSO_ID, attachmentId, nome, ext, dlResult.buffer.length, dataDoc, urlS3, fileKey, INSTANCIA]
      );
    }

    sucesso++;
    resultados.push({ id: attachmentId, nome, status: "ok", url: urlS3 });
  }

  if (i + LOTE_SIZE < attachments.length) {
    process.stdout.write(`  ⏳ Aguardando ${PAUSA_MS}ms...\n`);
    await sleep(PAUSA_MS);
  }
}

// 3. Atualizar autosDisponiveis se houve sucesso
if (sucesso > 0) {
  await conn.execute(
    "UPDATE processos SET autos_disponiveis = 1 WHERE id = ?",
    [PROCESSO_ID]
  );
  console.log(`\n✅ autosDisponiveis marcado como true para o processo ${PROCESSO_ID}`);
}

console.log(`\n📊 Resumo:`);
console.log(`   ✅ Sucesso: ${sucesso}`);
console.log(`   ❌ Erros: ${erros}`);
console.log(`   ⏭️  Ignorados (já baixados ou muito pequenos): ${ignorados}`);
console.log(`   Total processado: ${attachments.length}`);

await conn.end();
