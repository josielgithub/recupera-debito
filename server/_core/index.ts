import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { normalizarStatusCodilo, validarCallbackCodilo } from "../codilo";
import { getProcessoByCnj, updateProcessoStatus } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // ─── Endpoint de Callback da Codilo ─────────────────────────────────
  app.post("/api/codilo/callback", async (req, res) => {
    try {
      // Validar assinatura/segredo
      if (!validarCallbackCodilo(req.headers as Record<string, string | string[] | undefined>)) {
        console.warn("[Codilo Callback] Assinatura inválida");
        return res.status(401).json({ erro: "Não autorizado" });
      }

      const payload = req.body;
      const cnj = payload?.cnj ?? payload?.numero_processo ?? payload?.processo?.cnj;
      const statusRaw = payload?.status ?? payload?.situacao ?? payload?.processo?.status;

      if (!cnj) {
        console.warn("[Codilo Callback] CNJ ausente no payload:", payload);
        return res.status(400).json({ erro: "CNJ ausente" });
      }

      const processo = await getProcessoByCnj(cnj);
      if (!processo) {
        console.warn(`[Codilo Callback] Processo não encontrado: ${cnj}`);
        return res.status(404).json({ erro: "Processo não encontrado" });
      }

      const statusNormalizado = statusRaw ? normalizarStatusCodilo(statusRaw) : processo.statusResumido;
      await updateProcessoStatus(cnj, statusNormalizado, payload);

      console.log(`[Codilo Callback] Processo ${cnj} atualizado → ${statusNormalizado}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Codilo Callback] Erro:", err);
      return res.status(500).json({ erro: "Erro interno" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// Rotina de monitoramento: verificar processos sem atualização a cada 6 horas
setInterval(async () => {
  try {
    const { marcarProcessosSemAtualizacao } = await import("../db");
    const afetados = await marcarProcessosSemAtualizacao();
    if (afetados > 0) {
      console.log(`[Rotina] ${afetados} processo(s) marcado(s) como sem atualização há 7 dias`);
    }
  } catch (err) {
    console.error("[Rotina] Erro ao marcar processos:", err);
  }
}, 6 * 60 * 60 * 1000);
