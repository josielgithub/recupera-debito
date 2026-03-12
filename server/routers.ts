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
  listAllProcessos,
  listLogsConsulta,
  listLogsImportacao,
  listProcessosPorStatus,
  listProcessosSemAtualizacao7dias,
  marcarProcessosSemAtualizacao,
  registrarLogConsulta,
  registrarLogImportacao,
} from "./db";
import { processarPlanilha } from "./importacao";
import { createHash } from "crypto";

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
          captchaToken: z.string().optional(), // validado no frontend via Cloudflare Turnstile
        })
      )
      .query(async ({ input, ctx }) => {
        const ip = getClientIp(ctx.req as Parameters<typeof getClientIp>[0]);
        const cpfLimpo = input.cpf.replace(/\D/g, "");
        const cpfFormatado = `${cpfLimpo.slice(0, 3)}.${cpfLimpo.slice(3, 6)}.${cpfLimpo.slice(6, 9)}-${cpfLimpo.slice(9)}`;

        // Rate limit por IP
        const ipOk = await checkRateLimit(`ip:${hashValue(ip)}`, true);
        if (!ipOk) {
          await registrarLogConsulta({
            ipHash: hashValue(ip),
            cpfHash: hashValue(cpfLimpo),
            resultado: "bloqueado",
          });
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Muitas consultas realizadas. Tente novamente em alguns minutos.",
          });
        }

        // Rate limit por CPF
        const cpfOk = await checkRateLimit(`cpf:${hashValue(cpfLimpo)}`, false);
        if (!cpfOk) {
          await registrarLogConsulta({
            ipHash: hashValue(ip),
            cpfHash: hashValue(cpfLimpo),
            resultado: "bloqueado",
          });
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Muitas consultas realizadas. Tente novamente em alguns minutos.",
          });
        }

        const cliente = await getClienteByCpf(cpfFormatado);

        if (!cliente) {
          await registrarLogConsulta({
            ipHash: hashValue(ip),
            cpfHash: hashValue(cpfLimpo),
            resultado: "nao_encontrado",
          });
          // Mensagem genérica para não expor se CPF existe
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Não foi possível localizar informações para o CPF informado.",
          });
        }

        const processosCliente = await getProcessosByCpf(cpfFormatado);

        await registrarLogConsulta({
          ipHash: hashValue(ip),
          cpfHash: hashValue(cpfLimpo),
          resultado: "encontrado",
        });

        return {
          nomeCliente: cliente.nome,
          processos: processosCliente.map((p, idx) => ({
            indice: idx + 1,
            statusResumido: p.statusResumido,
            ultimaAtualizacao: p.ultimaAtualizacaoApi ?? p.updatedAt,
            parceiro: p.parceiro
              ? {
                  nome: p.parceiro.nomeEscritorio,
                  whatsapp: p.parceiro.whatsapp,
                  email: p.parceiro.email,
                }
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
      .input(z.object({ page: z.number().min(1).default(1) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listAllProcessos(input.page, 50);
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
        return listLogsConsulta(input.limit);
      }),

    rodarRotina7dias: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const afetados = await marcarProcessosSemAtualizacao();
      return { afetados };
    }),
  }),
});

export type AppRouter = typeof appRouter;
