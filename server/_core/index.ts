import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { mapearStatusJudit, obterResultadoJudit } from "../judit";
import { getProcessoByCnj, updateProcessoStatus, updateJuditRequestStatus, upsertProcessoFromJudit, upsertCliente, vincularClienteAoProcesso } from "../db";
import { extrairNomeClienteDoPayload } from "../db";

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

  // ─── Webhook da Judit ──────────────────────────────────────────────────────────────────────────────
  /**
   * POST /api/judit/webhook
   * Recebe notificações assíncronas da Judit quando uma requisição é concluída.
   * Formato esperado: { request_id, status, page_data: [...] }
   * URL a configurar na Judit: https://<dominio>/api/judit/webhook
   */
  app.post("/api/judit/webhook", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      console.log("[Judit Webhook] Recebido:", JSON.stringify(body).slice(0, 300));

      // Responder imediatamente para não deixar a Judit aguardando
      res.status(200).json({ ok: true });

      const requestId = (body.request_id ?? body.requestId) as string | undefined;
      const status = ((body.status ?? body.state ?? "") as string).toLowerCase();

      if (!requestId) {
        console.warn("[Judit Webhook] request_id ausente no payload");
        return;
      }

      // Apenas processar quando status for done/completed
      if (status !== "done" && status !== "completed") {
        console.log(`[Judit Webhook] Status ${status} para requestId=${requestId} — aguardando conclusão`);
        return;
      }

      // Buscar o resultado via API (garante que iteramos todos os objetos do array)
      const resultado = await obterResultadoJudit(requestId);

      if (!resultado) {
        console.log(`[Judit Webhook] Nenhum resultado válido para requestId=${requestId} (todos lawsuit_not_found)`);
        await updateJuditRequestStatus(requestId, "completed");
        return;
      }

      // Extrair CNJ do resultado
      const r = resultado as Record<string, unknown>;
      const cnj = (r.lawsuit_cnj ?? r.cnj ?? r.numero_processo) as string | undefined;

      if (!cnj) {
        console.warn(`[Judit Webhook] CNJ não encontrado no resultado para requestId=${requestId}`);
        await updateJuditRequestStatus(requestId, "completed");
        return;
      }

      const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);
      const { criado } = await upsertProcessoFromJudit(cnj, statusResumido, statusOriginal, resultado, requestId);
      await updateJuditRequestStatus(requestId, "completed");

      // Vincular cliente
      const nomeProcesso = r.name as string | undefined;
      const nomeCliente = extrairNomeClienteDoPayload(nomeProcesso);
      if (nomeCliente) {
        const clienteId = await upsertCliente({ nome: nomeCliente });
        await vincularClienteAoProcesso(cnj, clienteId);
      }

      console.log(`[Judit Webhook] Processo ${cnj} ${criado ? "criado" : "atualizado"} via webhook → ${statusResumido} (${statusOriginal})`);
    } catch (err) {
      console.error("[Judit Webhook] Erro:", err);
    }
  });

  // Manter rota legada /api/judit/callback por compatibilidade
  app.post("/api/judit/callback", async (req, res) => {
    try {
      const payload = req.body as Record<string, unknown>;
      const cnj = (payload?.cnj ?? payload?.numero_processo ?? (payload?.lawsuit as Record<string, unknown>)?.cnj) as string | undefined;

      if (!cnj) {
        console.warn("[Judit Callback] CNJ ausente no payload:", payload);
        return res.status(400).json({ erro: "CNJ ausente" });
      }

      const processo = await getProcessoByCnj(cnj);
      if (!processo) {
        console.warn(`[Judit Callback] Processo não encontrado: ${cnj}`);
        return res.status(404).json({ erro: "Processo não encontrado" });
      }

      const { statusResumido, statusOriginal } = mapearStatusJudit(payload);
      await updateProcessoStatus(cnj, statusResumido, statusOriginal, payload);

      console.log(`[Judit Callback] Processo ${cnj} atualizado → ${statusResumido} (${statusOriginal})`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Judit Callback] Erro:", err);
      return res.status(500).json({ erro: "Erro interno" });
    }
  });
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

