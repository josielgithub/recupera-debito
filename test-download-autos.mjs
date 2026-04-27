/**
 * Teste manual do fluxo completo de download de autos processuais.
 * Replica a lógica da rota admin.downloadAnexo para o attachment 196220645
 * do processo 1014401-24.2025.8.11.0003 (autoId=739, processoId=90015)
 */
import mysql from "mysql2/promise";

const AUTO_ID = 739;
const CNJ = "1014401-24.2025.8.11.0003";
const ATTACHMENT_ID = "196220645";
const INSTANCIA = 1;

const JUDIT_API_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = (process.env.BUILT_IN_FORGE_API_URL ?? "").replace(/\/+$/, "");
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JUDIT_API_KEY) { console.error("JUDIT_API_KEY não encontrada"); process.exit(1); }
if (!FORGE_URL) { console.error("BUILT_IN_FORGE_API_URL não encontrada"); process.exit(1); }
if (!FORGE_KEY) { console.error("BUILT_IN_FORGE_API_KEY não encontrada"); process.exit(1); }

// ── 1. Baixar da Judit ──────────────────────────────────────────────────────
console.log(`\n[1] Baixando attachment ${ATTACHMENT_ID} da Judit...`);
const juditUrl = `https://lawsuits.prod.judit.io/lawsuits/${encodeURIComponent(CNJ)}/${INSTANCIA}/attachments/${ATTACHMENT_ID}`;
console.log(`    URL: ${juditUrl}`);

const juditRes = await fetch(juditUrl, {
  headers: { "api-key": JUDIT_API_KEY, "Content-Type": "application/json" },
  redirect: "follow",
});

console.log(`    HTTP Status: ${juditRes.status} ${juditRes.statusText}`);
console.log(`    Content-Type: ${juditRes.headers.get("content-type")}`);

if (!juditRes.ok) {
  const body = await juditRes.text();
  console.error(`    ERRO: ${body.slice(0, 300)}`);
  process.exit(1);
}

const buffer = Buffer.from(await juditRes.arrayBuffer());
const contentType = juditRes.headers.get("content-type") ?? "application/pdf";
console.log(`    Tamanho: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)} KB)`);
console.log(`    Primeiros bytes: ${buffer.slice(0, 8).toString("ascii")}`);
const isPdf = buffer.slice(0, 4).toString("ascii") === "%PDF";
console.log(`    É PDF válido: ${isPdf ? "✅ SIM" : "❌ NÃO"}`);

// ── 2. Salvar no S3 via Forge API (mesmo padrão do storagePut) ──────────────
console.log(`\n[2] Salvando no S3 via Forge API (v1/storage/upload)...`);
const fileKey = `autos/${CNJ.replace(/[^\w]/g, "_")}/${ATTACHMENT_ID}.pdf`;
console.log(`    File key: ${fileKey}`);

const uploadUrl = new URL(`${FORGE_URL}/v1/storage/upload`);
uploadUrl.searchParams.set("path", fileKey);
console.log(`    Upload URL: ${uploadUrl.toString()}`);

const blob = new Blob([buffer], { type: contentType });
const formData = new FormData();
formData.append("file", blob, `${ATTACHMENT_ID}.pdf`);

const storageRes = await fetch(uploadUrl.toString(), {
  method: "POST",
  headers: { "Authorization": `Bearer ${FORGE_KEY}` },
  body: formData,
});

console.log(`    Storage HTTP Status: ${storageRes.status} ${storageRes.statusText}`);
const storageText = await storageRes.text();
console.log(`    Storage Response: ${storageText.slice(0, 500)}`);

let s3Url = null;
try {
  const storageJson = JSON.parse(storageText);
  s3Url = storageJson?.url ?? storageJson?.data?.url ?? null;
} catch {
  console.log("    (resposta não é JSON)");
}

if (!s3Url) {
  console.error("\n❌ ERRO: Não foi possível obter URL do S3.");
  process.exit(1);
}

console.log(`\n    ✅ URL S3: ${s3Url}`);

// ── 3. Atualizar banco de dados ─────────────────────────────────────────────
console.log(`\n[3] Atualizando banco de dados (processo_autos id=${AUTO_ID})...`);
const conn = await mysql.createConnection(DATABASE_URL);

const [result] = await conn.execute(
  "UPDATE processo_autos SET url_s3 = ?, file_key = ?, tamanho_bytes = ? WHERE id = ?",
  [s3Url, fileKey, buffer.length, AUTO_ID]
);
console.log(`    Rows afetadas: ${result.affectedRows}`);

const [rows] = await conn.execute(
  "SELECT id, attachment_id, nome_arquivo, url_s3, file_key, status_anexo, tamanho_bytes FROM processo_autos WHERE id = ?",
  [AUTO_ID]
);
console.log(`    Registro atualizado:`);
console.log(JSON.stringify(rows[0], null, 4));

// Marcar autosDisponiveis = true no processo
await conn.execute(
  "UPDATE processos SET autos_disponiveis = 1 WHERE cnj = ?",
  [CNJ]
);
console.log(`    autosDisponiveis marcado como true no processo.`);

await conn.end();

console.log(`\n✅ FLUXO COMPLETO COM SUCESSO!`);
console.log(`   PDF disponível em:\n   ${s3Url}`);
