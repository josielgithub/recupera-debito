/**
 * Chama admin.juditColetarResultados via HTTP interno ao servidor Express.
 * Usa a mesma lógica que o servidor usa para acessar a Judit (com proxy/credenciais corretas).
 */

// Importar diretamente a função do servidor (sem rede externa)
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { config } from "dotenv";
config();

const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Verificar estado inicial
  const [antes] = await conn.execute(
    "SELECT status, COUNT(*) as total FROM judit_requests GROUP BY status"
  );
  console.log("=== ESTADO INICIAL ===");
  antes.forEach(r => console.log(`   ${r.status}: ${r.total}`));

  // Buscar os 7 pendentes com detalhes
  const [pendentes] = await conn.execute(
    "SELECT request_id, cnj, created_at FROM judit_requests WHERE status = 'processing' ORDER BY created_at ASC"
  );

  console.log(`\n=== ${pendentes.length} requisições pendentes ===`);
  pendentes.forEach(r => console.log(`   CNJ: ${r.cnj} | request_id: ${r.request_id} | criado: ${r.created_at}`));

  // Chamar o servidor Express interno via HTTP (que tem acesso à Judit)
  const TRPC_URL = "http://localhost:3000/api/trpc/admin.juditColetarResultados";
  
  // Precisamos de um cookie de sessão de admin para chamar a procedure protegida
  // Vamos usar a função diretamente via import do módulo do servidor
  console.log("\n=== Chamando coletarResultadosPendentes via módulo do servidor ===");
  
  // Importar a função diretamente
  const { coletarResultadosPendentes } = await import("../server/judit.ts").catch(async () => {
    // Tentar com extensão .js compilada
    return await import("../dist/server/judit.js").catch(() => null);
  });

  if (!coletarResultadosPendentes) {
    console.log("Não foi possível importar o módulo. Usando abordagem via banco direto.");
    
    // Abordagem alternativa: chamar a API HTTP do servidor com curl interno
    const { execSync } = require("child_process");
    
    // Verificar se o servidor está rodando
    try {
      const healthCheck = execSync("curl -s http://localhost:3000/api/trpc/auth.me", { encoding: "utf8" });
      console.log("Servidor respondendo:", healthCheck.substring(0, 100));
    } catch (e) {
      console.log("Servidor não acessível:", e.message);
    }
    
    await conn.end();
    return;
  }

  try {
    const resultado = await coletarResultadosPendentes();
    console.log(`\nResultado: ${resultado.atualizados} atualizados, ${resultado.semAlteracao} sem alteração, ${resultado.erros} erros`);
  } catch (err) {
    console.error("Erro:", err.message);
  }

  // Verificar estado final
  const [depois] = await conn.execute(
    "SELECT status, COUNT(*) as total FROM judit_requests GROUP BY status"
  );
  console.log("\n=== ESTADO FINAL ===");
  depois.forEach(r => console.log(`   ${r.status}: ${r.total}`));

  await conn.end();
}

main().catch(console.error);
