import mysql2 from "mysql2/promise";
import https from "https";
import fs from "fs";

const CNJ = "0800142-82.2025.8.12.0034";
const PROCESSO_ID = 30249;
const INSTANCIA = 1;
const LOTE_SIZE = 5;
const PAUSA_MS = 1000;

const JUDIT_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const dbUrl = new URL(process.env.DATABASE_URL);
const conn = await mysql2.createConnection({
  host: dbUrl.hostname, port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username, password: dbUrl.password,
  database: dbUrl.pathname.replace("/", ""), ssl: { rejectUnauthorized: false },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpsGet(hostname, path, headers, followRedirects = true) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: "GET", headers };
    const req = https.request(options, (res) => {
      if (followRedirects && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)) {
        const loc = res.headers.location;
        const u = new URL(loc);
        httpsGet(u.hostname, u.pathname + u.search, {}, false).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] || "" }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function downloadAttachment(attachmentId) {
  const result = await httpsGet(
    "lawsuits.prod.judit.io",
    `/lawsuits/${encodeURIComponent(CNJ)}/${INSTANCIA}/attachments/${attachmentId}`,
    { "api-key": JUDIT_KEY, "Content-Type": "application/json" }
  );
  if (result.status !== 200) return null;
  if (result.buffer.length < 100) return null;
  return result;
}

async function uploadToS3(buffer, fileKey, contentType) {
  const forgeHost = new URL(FORGE_URL).hostname;
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const filename = fileKey.split("/").pop();
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${fileKey}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
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
      res.on("data", c => (data += c));
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

// Carregar attachments do arquivo JSON já salvo
const respData = JSON.parse(fs.readFileSync("/tmp/resp_0800142.json", "utf8"));
const entry = respData.page_data.find(e => e.response_type === "lawsuit");
const attachments = entry?.response_data?.attachments || [];

console.log(`📋 Processo: ${CNJ}`);
console.log(`📁 Total de attachments: ${attachments.length}`);
console.log(`📦 Lote size: ${LOTE_SIZE} | Pausa: ${PAUSA_MS}ms\n`);

let sucesso = 0, erros = 0, ignorados = 0;
const resultados = [];

for (let i = 0; i < attachments.length; i += LOTE_SIZE) {
  const lote = attachments.slice(i, i + LOTE_SIZE);
  const loteNum = Math.floor(i / LOTE_SIZE) + 1;
  const totalLotes = Math.ceil(attachments.length / LOTE_SIZE);
  console.log(`\n📦 Lote ${loteNum}/${totalLotes}:`);

  for (const att of lote) {
    const attachmentId = att.attachment_id;
    const nome = (att.attachment_name || `doc_${attachmentId}`).trim().toUpperCase();
    const ext = (att.extension || "pdf").toLowerCase();
    const dataDoc = att.attachment_date ? new Date(att.attachment_date) : null;

    // Verificar se já existe no banco
    const [existente] = await conn.execute(
      "SELECT id, url_s3 FROM processo_autos WHERE processo_id = ? AND attachment_id = ?",
      [PROCESSO_ID, attachmentId]
    );
    if (existente.length > 0 && existente[0].url_s3) {
      console.log(`  ⏭️  ${nome} — já baixado`);
      ignorados++;
      continue;
    }

    process.stdout.write(`  ⬇️  ${nome} (${attachmentId})... `);
    
    try {
      const dlResult = await downloadAttachment(attachmentId);
      if (!dlResult) {
        console.log(`❌ Falha no download ou arquivo muito pequeno`);
        erros++;
        resultados.push({ id: attachmentId, nome, status: "erro_download" });
        continue;
      }

      const cnjSlug = CNJ.replace(/[^0-9]/g, "_");
      const fileKey = `autos/${cnjSlug}/${attachmentId}.${ext}`;
      const uploadResult = await uploadToS3(dlResult.buffer, fileKey, "application/pdf");

      if (uploadResult.status !== 200) {
        console.log(`❌ Erro upload S3 (HTTP ${uploadResult.status})`);
        erros++;
        resultados.push({ id: attachmentId, nome, status: "erro_upload" });
        continue;
      }

      const urlS3 = uploadResult.body?.url || "";
      console.log(`✅ ${dlResult.buffer.length} bytes`);

      if (existente.length > 0) {
        await conn.execute(
          "UPDATE processo_autos SET url_s3 = ?, file_key = ?, tamanho_bytes = ?, status_anexo = 'done' WHERE id = ?",
          [urlS3, fileKey, dlResult.buffer.length, existente[0].id]
        );
      } else {
        await conn.execute(
          `INSERT INTO processo_autos (processo_id, attachment_id, nome_arquivo, extensao, tamanho_bytes, data_documento, url_s3, file_key, instancia, status_anexo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', NOW())`,
          [PROCESSO_ID, attachmentId, nome, ext, dlResult.buffer.length, dataDoc, urlS3, fileKey, INSTANCIA]
        );
      }

      sucesso++;
      resultados.push({ id: attachmentId, nome, status: "ok", bytes: dlResult.buffer.length, url: urlS3.substring(0, 80) });
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);
      erros++;
      resultados.push({ id: attachmentId, nome, status: "erro_excecao", erro: err.message });
    }
  }

  if (i + LOTE_SIZE < attachments.length) {
    process.stdout.write(`  ⏳ Pausa ${PAUSA_MS}ms...\n`);
    await sleep(PAUSA_MS);
  }
}

// Atualizar autosDisponiveis
if (sucesso > 0) {
  await conn.execute("UPDATE processos SET autos_disponiveis = 1 WHERE id = ?", [PROCESSO_ID]);
  console.log(`\n✅ autosDisponiveis = true para processo ${PROCESSO_ID}`);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`📊 RESUMO FINAL`);
console.log(`   ✅ Sucesso: ${sucesso}/${attachments.length}`);
console.log(`   ❌ Erros: ${erros}`);
console.log(`   ⏭️  Ignorados: ${ignorados}`);

// Salvar resultado
fs.writeFileSync("/tmp/dl_0800142_final.json", JSON.stringify(resultados, null, 2));
console.log(`\n📄 Resultado salvo em /tmp/dl_0800142_final.json`);

await conn.end();
