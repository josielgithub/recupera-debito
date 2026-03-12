import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { STATUS_RESUMIDO, StatusResumido } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  checkRateLimit,
  countProcessosPorStatus,
  getClienteByCpf,
  getProcessosByCpf,
  getProcessoByCnj,
  listAllProcessos,
  listLogsConsulta,
  listLogsImportacao,
  listParceiros,
  listProcessosPorStatus,
  listProcessosSemAtualizacao7dias,
  marcarProcessosSemAtualizacao,
  registrarLogConsulta,
  registrarLogImportacao,
  updateProcessoStatus,
  upsertParceiro,
} from "./db";
import { processarPlanilha } from "./importacao";
import { createHash } from "crypto";
import * as XLSX from "xlsx";

// ─── Helpers ───────────────────────────────────────────────────────────────
function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip?.trim() ?? "unknown";
  }
  return req.socket?.remoteAddress ?? "unknown";
}

// ─── Router Principal ──────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Consulta Pública por CPF ────────────────────────────────────────
  consulta: router({
    porCpf: publicProcedure
      .input(
        z.object({
          cpf: z.string().min(11).max(18),
          telefone: z.string().min(10).max(20),
          captchaToken: z.string().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const ip = getClientIp(ctx.req as Parameters<typeof getClientIp>[0]);
        const cpfLimpo = input.cpf.replace(/\D/g, "");
        const cpfFormatado = `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`;
        const cpfMascarado = `***.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-**`;
        const telefoneLimpo = input.telefone.trim();

        // Rate limit por IP
        const ipOk = await checkRateLimit(`ip:${hashValue(ip)}`, true);
        if (!ipOk) {
          await registrarLogConsulta({ ipHash: hashValue(ip), cpfHash: hashValue(cpfLimpo), cpfMascarado, telefone: telefoneLimpo, resultado: "bloqueado" });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas realizadas. Tente novamente em alguns minutos." });
        }

        // Rate limit por CPF
        const cpfOk = await checkRateLimit(`cpf:${hashValue(cpfLimpo)}`, false);
        if (!cpfOk) {
          await registrarLogConsulta({ ipHash: hashValue(ip), cpfHash: hashValue(cpfLimpo), cpfMascarado, telefone: telefoneLimpo, resultado: "bloqueado" });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas consultas realizadas. Tente novamente em alguns minutos." });
        }

        const cliente = await getClienteByCpf(cpfFormatado);

        if (!cliente) {
          await registrarLogConsulta({ ipHash: hashValue(ip), cpfHash: hashValue(cpfLimpo), cpfMascarado, telefone: telefoneLimpo, resultado: "nao_encontrado" });
          throw new TRPCError({ code: "NOT_FOUND", message: "Não foi possível localizar informações para o CPF informado." });
        }

        const processosCliente = await getProcessosByCpf(cpfFormatado);

        await registrarLogConsulta({ ipHash: hashValue(ip), cpfHash: hashValue(cpfLimpo), cpfMascarado, telefone: telefoneLimpo, resultado: "encontrado" });

        return {
          nomeCliente: cliente.nome,
          processos: processosCliente.map((p, idx) => ({
            indice: idx + 1,
            statusResumido: p.statusResumido,
            ultimaAtualizacao: p.ultimaAtualizacaoApi ?? p.updatedAt,
            parceiro: p.parceiro
              ? { nome: p.parceiro.nomeEscritorio, whatsapp: p.parceiro.whatsapp, email: p.parceiro.email }
              : null,
          })),
        };
      }),
  }),

  // ─── Dashboard Admin ─────────────────────────────────────────────────
  admin: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito" });
      }

      const [contagens, ganhos, cumprimentos, perdidos, semAtualizacao] = await Promise.all([
        countProcessosPorStatus(),
        listProcessosPorStatus("concluido_ganho"),
        listProcessosPorStatus("cumprimento_de_sentenca"),
        listProcessosPorStatus("concluido_perdido"),
        listProcessosSemAtualizacao7dias(),
      ]);

      return { contagens, ganhos, cumprimentos, perdidos, semAtualizacao };
    }),

    processos: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        status: z.array(z.enum(STATUS_RESUMIDO)).optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        busca: z.string().optional(),
        orderBy: z.enum(["cnj", "statusResumido", "clienteNome", "parceiroNome", "updatedAt"]).optional(),
        orderDir: z.enum(["asc", "desc"]).optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listAllProcessos(input.page, 50, {
          status: input.status as StatusResumido[] | undefined,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          busca: input.busca,
          orderBy: input.orderBy,
          orderDir: input.orderDir,
        });
      }),

    processosPorStatus: protectedProcedure
      .input(z.object({ status: z.enum(STATUS_RESUMIDO) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listProcessosPorStatus(input.status as StatusResumido);
      }),

    importarPlanilha: protectedProcedure
      .input(
        z.object({
          fileBase64: z.string(),
          nomeArquivo: z.string(),
          callbackBaseUrl: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        const buffer = Buffer.from(input.fileBase64, "base64");
        const resultado = await processarPlanilha(buffer, input.callbackBaseUrl);

        await registrarLogImportacao({
          nomeArquivo: input.nomeArquivo,
          totalLinhas: resultado.totalLinhas,
          linhasOk: resultado.linhasOk,
          linhasErro: resultado.linhasErro,
          detalhes: resultado.detalhes as unknown as Record<string, unknown>[],
        });

        return resultado;
      }),

    historicoImportacoes: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listLogsImportacao(20);
    }),

    logsConsulta: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const result = await listLogsConsulta(1, input.limit);
        return result.logs;
      }),

    rodarRotina7dias: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const afetados = await marcarProcessosSemAtualizacao();
      return { afetados };
    }),

    // Atualizar status de processo manualmente
    atualizarStatusProcesso: protectedProcedure
      .input(z.object({
        cnj: z.string(),
        status: z.enum(STATUS_RESUMIDO),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
        await updateProcessoStatus(input.cnj, input.status as StatusResumido, processo.rawPayload);
        return { ok: true };
      }),

    // Listar parceiros
    parceiros: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listParceiros();
    }),

    // Criar/atualizar parceiro
    upsertParceiro: protectedProcedure
      .input(z.object({
        nomeEscritorio: z.string().min(2),
        whatsapp: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const id = await upsertParceiro({
          nomeEscritorio: input.nomeEscritorio,
          whatsapp: input.whatsapp ?? null,
          email: input.email ?? null,
        });
        return { id };
      }),

    // Histórico de consultas públicas
    historicoConsultas: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        resultado: z.enum(["encontrado", "nao_encontrado", "bloqueado"]).optional(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        telefone: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listLogsConsulta(input.page, 50, {
          resultado: input.resultado,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          telefone: input.telefone,
        });
      }),

    // Gerar planilha modelo para download (base64)
    gerarPlanilhaModelo: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const wb = XLSX.utils.book_new();
      const dados = [
        [
          "cpf", "nome", "cnj", "status_interno", "advogado",
          "nome_escritorio", "whatsapp_escritorio", "email_escritorio"
        ],
        [
          "529.982.247-25", "Maria da Silva", "0000001-02.2023.8.26.0001",
          "Em análise", "Dr. João Santos",
          "Escritório Exemplo", "(11) 99999-0000", "contato@escritorio.com"
        ],
        [
          "111.444.777-35", "Carlos Oliveira", "0000002-03.2023.8.26.0001",
          "", "Dra. Ana Lima",
          "Escritório Exemplo", "(11) 99999-0000", "contato@escritorio.com"
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet(dados);
      // Largura das colunas
      ws["!cols"] = [
        { wch: 18 }, { wch: 25 }, { wch: 28 }, { wch: 20 }, { wch: 20 },
        { wch: 25 }, { wch: 20 }, { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Processos");
      const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      return { base64: buf as string, filename: "modelo_importacao_recupera_debito.xlsx" };
    }),
  }),
});

export type AppRouter = typeof appRouter;
