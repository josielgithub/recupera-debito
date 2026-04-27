import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  mapearStatusJudit,
  obterResultadoJudit,
} from "../judit";
import {
  getProcessoByCnj,
  updateProcessoStatus,
  updateJuditRequestStatus,
  upsertProcessoFromJudit,
  upsertCliente,
  vincularClienteAoProcesso,
  extrairNomeClienteDoPayload,
  insertProcessoAuto,
  marcarAutosDisponiveis,
} from "../db";
import { storagePut } from "../storage";

// ─── Helpers de rede ──────────────────────────────────────────────────────────

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
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Processamento do payload Judit (reutilizado pelo webhook) ────────────────

/**
 * Seleciona o melhor resultado do array page_data.
 * Conforme orientação do suporte Judit, o array contém uma entrada por instância.
 * Entradas lawsuit_not_found são ignoradas se houver outra com dados reais.
 */
function selecionarMelhorResultado(
  pageData: Array<Record<string, unknown>>
): Record<string, unknown> | null {
  let melhorResultado: Record<string, unknown> | null = null;
  let melhorScore = -1;

  for (let i = 0; i < pageData.length; i++) {
    const entry = pageData[i];
    const rd = (entry.response_data ?? {}) as Record<string, unknown>;

    // Pular entradas de IA
    if (entry.response_type === "ia") continue;

    // Verificar lawsuit_not_found
    const isNotFound =
      rd.code === 2 ||
      (typeof rd.message === "string" && rd.message.includes("NOT_FOUND")) ||
      (typeof rd.status === "string" && rd.status.toLowerCase().includes("not_found"));

    if (isNotFound) {
      console.log(`[Judit Webhook] Entrada ${i}: lawsuit_not_found — ignorando`);
      continue;
    }

    // Score de completude: steps + parties + presença de status
    const steps = (rd.steps as unknown[]) ?? (entry.steps as unknown[]) ?? [];
    const parties = (rd.parties as unknown[]) ?? (entry.parties as unknown[]) ?? [];
    const hasStatus = typeof rd.status === "string" && rd.status.length > 0;
    const score = steps.length * 2 + parties.length + (hasStatus ? 10 : 0);

    console.log(
      `[Judit Webhook] Entrada ${i}: status=${rd.status ?? "N/A"}, ` +
      `steps=${steps.length}, parties=${parties.length}, score=${score}`
    );

    if (score > melhorScore) {
      melhorScore = score;
      melhorResultado = {
        ...rd,
        steps,
        parties,
        // Attachments ficam em page_data[i].response_data.attachments (rd = entry.response_data)
        // Fallback para page_data[i].attachments caso a Judit envie no nível raiz da entrada
        attachments: (rd.attachments as unknown[] | undefined) ?? (entry.attachments as unknown[] | undefined) ?? [],
      };
    }
  }

  return melhorResultado;
}

/**
 * Processa o resultado selecionado: atualiza banco, vincula cliente.
 * Executado de forma assíncrona após responder HTTP 200.
 */
async function processarResultadoJudit(
  requestId: string,
  resultado: Record<string, unknown>
): Promise<void> {
  return processarResultadoJuditExterno(requestId, resultado);
}

/**
 * Versão exportável de processarResultadoJudit para uso em rotas tRPC.
 */
export async function processarResultadoJuditExterno(
  requestId: string,
  resultado: Record<string, unknown>
): Promise<void> {
  // Extrair CNJ do resultado
  const cnj = (
    resultado.lawsuit_cnj ??
    resultado.cnj ??
    resultado.numero_processo ??
    resultado.number
  ) as string | undefined;

  if (!cnj) {
    console.warn(`[Judit Webhook] CNJ não encontrado no resultado para requestId=${requestId}`);
    await updateJuditRequestStatus(requestId, "completed");
    return;
  }

  const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);

  // Criar ou atualizar processo no banco
  const { criado } = await upsertProcessoFromJudit(
    cnj, statusResumido, statusOriginal, resultado, requestId
  );
  await updateJuditRequestStatus(requestId, "completed");

  // Vincular cliente pelo nome extraído do payload
  const nomeProcesso = resultado.name as string | undefined;
  const nomeCliente = extrairNomeClienteDoPayload(nomeProcesso);
  if (nomeCliente) {
    const clienteId = await upsertCliente({ nome: nomeCliente });
    await vincularClienteAoProcesso(cnj, clienteId);
  }

  console.log(
    `[Judit Webhook] ✅ Processo ${cnj} ${criado ? "CRIADO" : "ATUALIZADO"} ` +
    `via webhook → ${statusResumido} (${statusOriginal}) | requestId=${requestId}`
  );

  // ─── Processar attachments (autos processuais) se presentes ───────────────────────────────
  // NOTA: A Judit retorna apenas metadados dos attachments (id, nome, extensão, data).
  // Não há URL de download direta via API. Salvamos os metadados para exibição.
  const attachments = (resultado.attachments as unknown[]) ?? [];
  if (attachments.length > 0) {
    const processoDb = await getProcessoByCnj(cnj);
    if (processoDb) {
      console.log(`[Judit Webhook] 📎 ${attachments.length} attachment(s) encontrado(s) para CNJ ${cnj}`);
      let autosCount = 0;

      for (const att of attachments) {
        const attachment = att as Record<string, unknown>;
        const attachmentId = String(attachment.id ?? attachment.attachment_id ?? "");
        // Normalizar nome para UPPERCASE e sem espaços extras (garante cruzamento confiável)
        const nomeArquivo = String(attachment.name ?? attachment.attachment_name ?? attachment.filename ?? "documento").trim().toUpperCase();
        // A Judit retorna extensão como campo separado
        const extensao = String(
          attachment.extension ?? attachment.ext ??
          (nomeArquivo.includes(".") ? nomeArquivo.split(".").pop() : "pdf") ?? "pdf"
        ).toLowerCase();
        const tipo = String(attachment.type ?? attachment.attachment_type ?? "");
        const tamanhoBytes = typeof attachment.size === "number" ? attachment.size : undefined;
        const dataDocumento = attachment.attachment_date
          ? new Date(attachment.attachment_date as string)
          : undefined;
        const corrupted = attachment.corrupted === true;

        if (!attachmentId) {
          console.warn(`[Judit Webhook] Attachment sem id para CNJ ${cnj}:`, attachment);
          continue;
        }
        if (corrupted) {
          console.warn(`[Judit Webhook] Attachment ${attachmentId} corrompido para CNJ ${cnj} — ignorando`);
          continue;
        }

        try {
          // Salvar apenas metadados (sem download — Judit não fornece URL direta)
          await insertProcessoAuto({
            processoId: processoDb.id,
            attachmentId,
            nomeArquivo,
            extensao,
            tamanhoBytes,
            urlS3: "",
            fileKey: "",
            tipo: tipo || undefined,
            dataDocumento,
          });
          autosCount++;
          console.log(`[Judit Webhook] 📄 Metadado registrado: "${nomeArquivo}" (${attachmentId}) para CNJ ${cnj}`);
        } catch (attErr) {
          const errMsg = String(attErr);
          if (errMsg.includes("Duplicate") || errMsg.includes("ER_DUP")) {
            console.log(`[Judit Webhook] Attachment ${attachmentId} já registrado para CNJ ${cnj} — ignorando`);
          } else {
            console.error(`[Judit Webhook] Erro ao registrar attachment ${attachmentId} para CNJ ${cnj}:`, attErr);
          }
        }
      }

      // Marcar processo como tendo autos disponíveis
      if (autosCount > 0) {
        await marcarAutosDisponiveis(processoDb.id);
        console.log(`[Judit Webhook] ✅ ${autosCount} metadado(s) registrado(s) para CNJ ${cnj} — autosDisponiveis=true`);
      }
    }
  }
}

// ─── Servidor principal ───────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Body parser com limite maior para uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth
  registerOAuthRoutes(app);

  // ─── Webhook da Judit (fluxo principal — orientado a eventos) ─────────────
  /**
   * POST /api/judit/webhook
   *
   * Recebe notificações assíncronas da Judit quando uma requisição é concluída.
   * Responde HTTP 200 imediatamente (< 2s) e processa o payload em background.
   *
   * Formato esperado:
   *   { request_id, status, page_data: [{ response_data, response_type, ... }] }
   *
   * URL configurada na conta Judit:
   *   https://recuperadeb-futgbwve.manus.space/api/judit/webhook
   */
  app.post("/api/judit/webhook", (req, res) => {
    // ── Responder SEMPRE HTTP 200 imediatamente ──────────────────────────────
    res.status(200).json({ ok: true });

    // ── Processar em background (não bloqueia a resposta) ───────────────────
    setImmediate(async () => {
      try {
        const body = req.body as Record<string, unknown>;
        const origem = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "desconhecido";

        // Log completo do payload recebido
        console.log(
          `[Judit Webhook] Recebido de ${origem}: ` +
          JSON.stringify(body).slice(0, 500)
        );

        // ── Validação básica ────────────────────────────────────────────────
        const requestId = (body.request_id ?? body.requestId) as string | undefined;
        if (!requestId) {
          console.warn("[Judit Webhook] ⚠️  request_id ausente no payload — ignorando");
          return;
        }

        const status = ((body.status ?? body.state ?? "") as string).toLowerCase();

        // Apenas processar quando concluído
        if (status !== "done" && status !== "completed") {
          console.log(`[Judit Webhook] Status "${status}" para requestId=${requestId} — aguardando conclusão`);
          return;
        }

        // ── Tentar processar diretamente do payload (sem chamada extra à API) ─
        const pageData = body.page_data as Array<Record<string, unknown>> | undefined;

        if (pageData && Array.isArray(pageData) && pageData.length > 0) {
          console.log(
            `[Judit Webhook] page_data contém ${pageData.length} entrada(s) ` +
            `para requestId=${requestId}`
          );

          const resultado = selecionarMelhorResultado(pageData);

          if (resultado) {
            await processarResultadoJudit(requestId, resultado);
            return;
          }

          // Todos eram not_found
          console.log(
            `[Judit Webhook] Todas as entradas retornaram lawsuit_not_found ` +
            `para requestId=${requestId}`
          );
          await updateJuditRequestStatus(requestId, "completed");
          return;
        }

        // ── Fallback: buscar resultado via API (payload sem page_data) ───────
        console.log(
          `[Judit Webhook] page_data ausente no payload — buscando via API ` +
          `(requestId=${requestId})`
        );

        const resultado = await obterResultadoJudit(requestId);
        if (!resultado) {
          console.log(
            `[Judit Webhook] Nenhum resultado válido via API para requestId=${requestId}`
          );
          await updateJuditRequestStatus(requestId, "completed");
          return;
        }

        await processarResultadoJudit(requestId, resultado as Record<string, unknown>);
      } catch (err) {
        console.error("[Judit Webhook] ❌ Erro no processamento em background:", err);
      }
    });
  });

  // ── Rota legada /api/judit/callback (mantida por compatibilidade) ──────────
  app.post("/api/judit/callback", async (req, res) => {
    try {
      const payload = req.body as Record<string, unknown>;
      const cnj = (
        payload?.cnj ??
        payload?.numero_processo ??
        (payload?.lawsuit as Record<string, unknown>)?.cnj
      ) as string | undefined;

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

  // tRPC
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── Handler global de erro JSON (DEVE vir antes do Vite/static) ──────────
  // Garante que QUALQUER erro não capturado retorne JSON, nunca HTML
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((err: any, req: any, res: any, _next: any) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Erro interno do servidor";
    console.error(`[Global Error Handler] ${req.method} ${req.path} → HTTP ${status}:`, message);
    // Se a resposta já foi enviada parcialmente, não tentar enviar novamente
    if (res.headersSent) return;
    res.status(status).json({
      error: true,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  // Vite (dev) ou arquivos estáticos (prod)
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
