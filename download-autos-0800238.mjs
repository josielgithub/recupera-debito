import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const DB_URL = process.env.DATABASE_URL;
const JUDIT_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DB_URL || !JUDIT_KEY || !FORGE_URL || !FORGE_KEY) {
  console.error("Variáveis de ambiente faltando:", { DB_URL: !!DB_URL, JUDIT_KEY: !!JUDIT_KEY, FORGE_URL: !!FORGE_URL, FORGE_KEY: !!FORGE_KEY });
  process.exit(1);
}

const cleanUrl = DB_URL.replace(/ssl=%7BrejectUnauthorized%3Atrue%7D/gi, '').replace(/ssl=\{rejectUnauthorized:true\}/gi, '');
const conn = await createConnection({ uri: cleanUrl, ssl: { rejectUnauthorized: false } });

const CNJ = "0800238-58.2025.8.10.0065";
const CNJ_SAFE = CNJ.replace(/[^0-9]/g, '_');
const PROCESSO_ID = 30204;

// Ler os attachments do arquivo já baixado
const data = JSON.parse(readFileSync("/tmp/processo_0800238.json", "utf8"));
const attachments = data.attachments || [];

console.log(`\nProcesso: ${CNJ} (id=${PROCESSO_ID})`);
console.log(`Total de attachments: ${attachments.length}`);

let baixados = 0;
let erros = 0;
let jaExistentes = 0;

for (const att of attachments) {
  const attachmentId = String(att.attachment_id || att.id || "");
  const nomeArquivo = String(att.attachment_name || att.name || "documento").trim().toUpperCase();
  const extensao = String(att.extension || att.ext || "pdf").toLowerCase();
  const tipo = att.attachment_name || att.name || "";
  const statusAnexo = att.status || "done";
  const corrupted = att.corrupted === true;
  const dataDocumento = att.attachment_date ? new Date(att.attachment_date) : null;

  if (!attachmentId) {
    console.log(`⚠️  Attachment sem ID: ${nomeArquivo}`);
    continue;
  }

  if (corrupted) {
    console.log(`⚠️  Corrompido: ${nomeArquivo} (${attachmentId})`);
    continue;
  }

  // Verificar se já existe no banco
  const [existing] = await conn.execute(
    `SELECT id, url_s3 FROM processo_autos WHERE processo_id = ? AND attachment_id = ?`,
    [PROCESSO_ID, attachmentId]
  );

  if (existing.length > 0 && existing[0].url_s3) {
    console.log(`✅ Já existe: ${nomeArquivo} (${attachmentId})`);
    jaExistentes++;
    continue;
  }

  // Baixar da Judit
  const juditUrl = `https://lawsuits.prod.judit.io/lawsuits/${CNJ}/1/attachments/${attachmentId}`;
  
  let buffer = null;
  let contentType = "application/pdf";
  
  try {
    const resp = await fetch(juditUrl, {
      redirect: "follow",
      headers: { "api-key": JUDIT_KEY, "Content-Type": "application/json" }
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.log(`❌ HTTP ${resp.status} para ${nomeArquivo} (${attachmentId}): ${text.substring(0, 100)}`);
      erros++;
      continue;
    }

    contentType = resp.headers.get("content-type") || "application/pdf";
    buffer = Buffer.from(await resp.arrayBuffer());
    
    if (buffer.length < 50) {
      console.log(`❌ Arquivo muito pequeno (${buffer.length}B): ${nomeArquivo}`);
      erros++;
      continue;
    }
  } catch (err) {
    console.log(`❌ Erro ao baixar ${nomeArquivo}: ${err.message}`);
    erros++;
    continue;
  }

  // Upload para o S3 via POST multipart/form-data (padrão do storagePut)
  const fileKey = `autos/${CNJ_SAFE}/${attachmentId}.${extensao}`;
  const baseUrl = FORGE_URL.replace(/\/+$/, "");
  const uploadUrl = `${baseUrl}/v1/storage/upload?path=${encodeURIComponent(fileKey)}`;

  try {
    const fileName = `${attachmentId}.${extensao}`;
    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append("file", blob, fileName);

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${FORGE_KEY}` },
      body: formData,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.log(`❌ Upload falhou para ${nomeArquivo}: HTTP ${uploadResp.status} - ${errText.substring(0, 100)}`);
      erros++;
      continue;
    }

    const uploadData = await uploadResp.json();
    const urlS3 = uploadData.url || uploadData.publicUrl || uploadData.cdnUrl || "";

    if (!urlS3) {
      console.log(`❌ URL S3 vazia para ${nomeArquivo}`);
      erros++;
      continue;
    }

    // Inserir ou atualizar no banco
    if (existing.length > 0) {
      await conn.execute(
        `UPDATE processo_autos SET url_s3 = ?, file_key = ?, tamanho_bytes = ?, status_anexo = ? WHERE id = ?`,
        [urlS3, fileKey, buffer.length, statusAnexo, existing[0].id]
      );
    } else {
      await conn.execute(
        `INSERT INTO processo_autos (processo_id, attachment_id, nome_arquivo, extensao, tamanho_bytes, url_s3, file_key, tipo, data_documento, instancia, status_anexo, corrompido, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, NOW())`,
        [PROCESSO_ID, attachmentId, nomeArquivo, extensao, buffer.length, urlS3, fileKey, tipo, dataDocumento, statusAnexo]
      );
    }

    console.log(`✅ ${nomeArquivo} (${attachmentId}) → ${buffer.length}B → ${urlS3.substring(0, 60)}...`);
    baixados++;

  } catch (err) {
    console.log(`❌ Erro no upload de ${nomeArquivo}: ${err.message}`);
    erros++;
  }
}

// Marcar processo como tendo autos disponíveis
if (baixados > 0) {
  await conn.execute(
    `UPDATE processos SET autos_disponiveis = 1, autos_disponivel_em = NOW() WHERE id = ?`,
    [PROCESSO_ID]
  );
  console.log(`\n✅ Processo marcado como autosDisponiveis=true`);
}

await conn.end();

console.log(`\n=== Resumo ===`);
console.log(`✅ Baixados: ${baixados}`);
console.log(`⏭️  Já existentes: ${jaExistentes}`);
console.log(`❌ Erros: ${erros}`);
console.log(`📊 Total: ${attachments.length}`);
