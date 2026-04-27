import { createConnection } from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
const JUDIT_KEY = process.env.JUDIT_API_KEY;
const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
if (!JUDIT_KEY) { console.error("JUDIT_API_KEY not set"); process.exit(1); }

const cleanUrl = DB_URL.replace(/ssl=%7BrejectUnauthorized%3Atrue%7D/gi, '').replace(/ssl=\{rejectUnauthorized:true\}/gi, '');
const conn = await createConnection({ uri: cleanUrl, ssl: { rejectUnauthorized: false } });

const CNJ = "0800238-58.2025.8.10.0065";

// 1. Buscar o processo no banco
const [processos] = await conn.execute(
  `SELECT id, cnj, autos_disponiveis, autos_solicitado_em FROM processos WHERE cnj = ?`,
  [CNJ]
);
console.log("\n=== Processo no banco ===");
console.table(processos);

if (!processos.length) {
  console.error("Processo não encontrado no banco!");
  await conn.end();
  process.exit(1);
}

const processo = processos[0];
const processoId = processo.id;

// 2. Listar attachments na tabela processo_autos
const [autos] = await conn.execute(
  `SELECT id, attachment_id, LEFT(nome_arquivo, 50) as nome, extensao, status_anexo,
   CASE WHEN url_s3 IS NOT NULL AND url_s3 != '' THEN 'SIM' ELSE 'NAO' END as tem_url
   FROM processo_autos WHERE processo_id = ? ORDER BY id`,
  [processoId]
);
console.log(`\n=== Attachments na tabela processo_autos (processo_id=${processoId}) ===`);
console.table(autos);

if (!autos.length) {
  console.log("\nNenhum attachment registrado. Consultando API Judit diretamente...");
  
  // Consultar a Judit para ver os attachments disponíveis
  const cnjEncoded = encodeURIComponent(CNJ);
  const url = `https://lawsuits.prod.judit.io/lawsuits/${CNJ}/1/attachments`;
  console.log(`\nGET ${url}`);
  
  const resp = await fetch(url, {
    headers: { 'api-key': JUDIT_KEY, 'Content-Type': 'application/json' }
  });
  console.log(`HTTP Status: ${resp.status}`);
  
  if (resp.ok) {
    const data = await resp.json();
    console.log("\nResposta da Judit:");
    console.log(JSON.stringify(data, null, 2).substring(0, 2000));
  } else {
    const text = await resp.text();
    console.log("Erro:", text.substring(0, 500));
  }
  await conn.end();
  process.exit(0);
}

// 3. Tentar baixar os attachments sem URL
const semUrl = autos.filter(a => a.tem_url === 'NAO');
console.log(`\n${semUrl.length} attachments sem URL para baixar.`);

for (const auto of semUrl.slice(0, 5)) { // Baixar os primeiros 5 para teste
  const attachmentId = auto.attachment_id;
  const nome = auto.nome;
  
  console.log(`\n--- Baixando: ${nome} (attachment_id=${attachmentId}) ---`);
  
  // Endpoint da Judit
  const juditUrl = `https://lawsuits.prod.judit.io/lawsuits/${CNJ}/1/attachments/${attachmentId}`;
  console.log(`GET ${juditUrl}`);
  
  try {
    const resp = await fetch(juditUrl, {
      redirect: 'follow',
      headers: { 'api-key': JUDIT_KEY, 'Content-Type': 'application/json' }
    });
    console.log(`HTTP Status: ${resp.status}`);
    console.log(`Content-Type: ${resp.headers.get('content-type')}`);
    
    if (!resp.ok) {
      const text = await resp.text();
      console.log(`Erro: ${text.substring(0, 300)}`);
      continue;
    }
    
    const buffer = Buffer.from(await resp.arrayBuffer());
    const tamanho = buffer.length;
    const primeiros = buffer.slice(0, 4).toString('ascii');
    console.log(`Tamanho: ${tamanho} bytes | Primeiros bytes: ${primeiros}`);
    
    if (tamanho < 100) {
      console.log("Arquivo muito pequeno — provavelmente erro");
      continue;
    }
    
    // Upload para o S3
    const cnjSafe = CNJ.replace(/[^0-9]/g, '_');
    const fileKey = `autos/${cnjSafe}/${attachmentId}.${auto.extensao || 'pdf'}`;
    const uploadUrl = `${FORGE_URL}/v1/storage/upload?path=${encodeURIComponent(fileKey)}`;
    console.log(`Upload para S3: ${fileKey}`);
    
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${FORGE_KEY}`,
        'Content-Type': resp.headers.get('content-type') || 'application/pdf',
      },
      body: buffer,
    });
    console.log(`Upload HTTP Status: ${uploadResp.status}`);
    
    if (uploadResp.ok) {
      const uploadData = await uploadResp.json();
      const urlS3 = uploadData.url || uploadData.publicUrl || uploadData.cdnUrl || '';
      console.log(`URL S3: ${urlS3}`);
      
      if (urlS3) {
        // Atualizar o banco
        await conn.execute(
          `UPDATE processo_autos SET url_s3 = ?, file_key = ?, tamanho_bytes = ? WHERE id = ?`,
          [urlS3, fileKey, tamanho, auto.id]
        );
        console.log(`✅ Banco atualizado para id=${auto.id}`);
      }
    } else {
      const errText = await uploadResp.text();
      console.log(`Erro no upload: ${errText.substring(0, 300)}`);
    }
    
  } catch (err) {
    console.error(`Erro ao baixar ${attachmentId}:`, err.message);
  }
}

await conn.end();
console.log("\n=== Concluído ===");
