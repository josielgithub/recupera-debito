import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { STATUS_RESUMIDO, StatusResumido } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, protectedProcedureWithImpersonationGuard, publicProcedure, router } from "./_core/trpc";
import {
  checkRateLimit,
  countJuditRequests,
  listJuditProcessos,
  countProcessosPorStatus,
  getClienteByCpf,
  getProcessosByCpf,
  getProcessoByCnj,
  graficoConsultasDiarias,
  graficoStatusProcessos,
  resumoMensal,
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
  listAllJuditRequestsByCnj,
  // Convites
  criarConvite,
  getConviteByToken,
  usarConvite,
  revogarConvite,
  listConvites,
  // Users
  getUserById,
  listUsers,
  updateUserAtivo,
  updateUsuarioDados,
  setUserExtraRoles,
  // Lotes (funções simples legadas)
  criarLoteSimples,
  getLoteById,
  listLotes,
  editarLoteSimples,
  adicionarInvestidorLote,
  listInvestidoresDoLote,
  vincularProcessoAoLote,
  // Lotes (funções completas com validação de percentuais)
  listarLotes,
  criarLoteCompleto,
  editarLoteCompleto,
  importarProcessosLote,
  listarProcessosLote,
  desvincularProcessoLote,
  listarErrosLote,
  resolverErroLote,
  // Advogado
  listProcessosDoAdvogado,
  metricsAdvogado,
  registrarResultadoProcesso,
  declinarProcesso,
  // Fila Judit
  listFilaJudit,
  aprovarProcessoJudit,
  marcarProcessoNaoEncontradoJudit,
  // Investidor
  listProcessosDoInvestidor,
  metricsInvestidor,
  // Judit Consultas
  getConsultaRecenteJudit,
} from "./db";
import { processarPlanilha } from "./importacao";
import { importarPlanilhaSimples, conciliarComJuditBackground } from "./importacaoSimples";
import {
  sleep,
  buscarESalvarProcessoJudit,
  atualizarProcesso,
  buscarMovimentacoesJudit,
  coletarResultadosPendentes,
  criarRequisicaoJudit,
  iniciarAnaliseIA,
  verificarAnaliseIA,
} from "./judit";
import { updateAiSummary, updateValorObtido, getImportJob, listImportJobs,
  listInvestidores, upsertInvestidor, vincularInvestidorAoProcesso,
  vincularInvestidorEmLote, getDashboardInvestidores, getProcessosSemInvestidor,
  upsertProcesso, upsertCliente,
  listAdvogadosUsuarios, listInvestidoresUsuarios,
  insertJuditConsultaLog, listJuditConsultaLog, countJuditConsultaLog,
  insertLogImportacaoUnificado, listLogsImportacaoUnificado,
  metricsJudit, listFilaJuditFiltrada, listHistoricoJudit, buscarProcessosPorCpfLocal,
  insertManusLlmLog, metricsAnalisesIA, listAnalisesIA,
  getConfiguracoes, salvarConfiguracoes,
  criarImpersonacao, buscarImpersonacaoPorToken, encerrarImpersonacao,
  detectarERegistrarTimeouts, listarProblemasJudit, marcarProblemaResolvido,
  atualizarObservacaoProblema, incrementarTentativasProblema, countProblemasJudit,
  resetStatusJuditParaFila,
  getOperacaoIdempotente,
  salvarOperacaoIdempotente,
  limparOperacoesExpiradas,
  getConsultaRecentePorCnj,
  getCustoConsultasMes,
} from "./db";
import { invokeLLM } from "./_core/llm";
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
    validarTokenImpersonacao: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const imp = await buscarImpersonacaoPorToken(input.token);
        if (!imp) throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
        if (!imp.ativo) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão de visualização encerrada" });
        const agora = new Date();
        if (imp.expiradoEm < agora) {
          await encerrarImpersonacao(input.token);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Token expirado" });
        }
        const usuario = await getUserById(imp.usuarioVisualizadoId);
        if (!usuario) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        return {
          isImpersonating: true as const,
          adminId: imp.adminId,
          token: imp.token,
          expiradoEm: imp.expiradoEm,
          usuario: {
            id: usuario.id,
            name: usuario.name,
            email: usuario.email,
            role: usuario.role,
            extraRoles: usuario.extraRoles,
            foto: usuario.foto,
          },
        };
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
            // Dados do advogado vinculado ao processo (prioridade) ou parceiro legado
            advogado: p.advogadoInfo ?? null,
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
        investidorId: z.number().optional(),
        semInvestidor: z.boolean().optional(),
        advogado: z.string().optional(),
        advogadoId: z.number().nullable().optional(),
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
          investidorId: input.investidorId,
          semInvestidor: input.semInvestidor,
          advogado: input.advogado,
          advogadoId: input.advogadoId,
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
        await updateProcessoStatus(
          input.cnj,
          input.status as StatusResumido,
          processo.statusOriginal ?? "",
          processo.rawPayload
        );
        return { ok: true };
      }),

    // Atualizar status de múltiplos processos em lote
    atualizarStatusEmLote: protectedProcedure
      .input(z.object({
        cnjs: z.array(z.string()).min(1).max(500),
        status: z.enum(STATUS_RESUMIDO),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        let atualizados = 0;
        let erros = 0;
        for (const cnj of input.cnjs) {
          try {
            const processo = await getProcessoByCnj(cnj);
            if (!processo) { erros++; continue; }
            await updateProcessoStatus(
              cnj,
              input.status as StatusResumido,
              processo.statusOriginal ?? "",
              processo.rawPayload
            );
            atualizados++;
          } catch {
            erros++;
          }
        }
        return { atualizados, erros };
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

    // Resumo mensal
    resumoMensal: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return resumoMensal();
    }),

    // Gráfico de distribuição de status de processos por mês
    graficoStatusProcessos: protectedProcedure
      .input(z.object({ meses: z.number().min(3).max(24).default(6) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return graficoStatusProcessos(input.meses);
      }),

    // Gráfico de consultas diárias
    graficoConsultasDiarias: protectedProcedure
      .input(z.object({ dias: z.number().min(7).max(90).default(30) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return graficoConsultasDiarias(input.dias);
      }),

    // ─── Integração Judit ──────────────────────────────────────────────────

    // Status geral das requisições Judit
    juditStatus: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const counts = await countJuditRequests();
      return { ok: true, counts };
    }),

    // Busca processos no banco local por CPF e opcionalmente dispara atualização via Judit
    juditConsultarCpf: protectedProcedure
      .input(z.object({
        cpf: z.string().min(1),
        atualizarViaJudit: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          const docLimpo = input.cpf.replace(/\D/g, "");
          const cpfFormatado = docLimpo.length === 11
            ? `${docLimpo.slice(0,3)}.${docLimpo.slice(3,6)}.${docLimpo.slice(6,9)}-${docLimpo.slice(9)}`
            : docLimpo;

          const cliente = await getClienteByCpf(cpfFormatado);
          if (!cliente) {
            return { ok: true, resultado: { processos: [], total: 0, cliente: null } };
          }

          const processosCliente = await getProcessosByCpf(cpfFormatado);

          // Se solicitado, dispara atualização via Judit para cada processo
          let atualizacaoInfo: string | null = null;
          if (input.atualizarViaJudit && processosCliente.length > 0) {
            atualizacaoInfo = `Atualização via Judit desativada nesta versão.`;
          }

          return {
            ok: true,
            resultado: {
              processos: processosCliente.map(p => ({
                cnj: p.cnj,
                statusResumido: p.statusResumido,
                statusOriginal: p.statusOriginal,
                advogado: p.advogado,
                ultimaAtualizacaoApi: p.ultimaAtualizacaoApi,
                semAtualizacao7dias: p.semAtualizacao7dias,
                parceiro: p.parceiro ? { nome: p.parceiro.nomeEscritorio, whatsapp: p.parceiro.whatsapp, email: p.parceiro.email } : null,
              })),
              total: processosCliente.length,
              cliente: { nome: cliente.nome, cpf: cliente.cpf },
              atualizacaoInfo,
            },
          };
        } catch (err) {
          return { ok: false, erro: String(err), resultado: null };
        }
      }),

    // Consulta e atualiza um processo específico pelo CNJ via Judit (síncrono com polling)
    juditConsultarCnj: protectedProcedure
      .input(z.object({ cnj: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          const atualizado = await atualizarProcesso(input.cnj);
          const processo = await getProcessoByCnj(input.cnj);
          return { ok: true, atualizado, processo };
        } catch (err) {
          return { ok: false, erro: String(err), atualizado: false, processo: null };
        }
      }),

    // Busca CNJ na Judit e salva no banco (cria processo se não existir)
    juditBuscarESalvarCnj: protectedProcedure
      .input(z.object({ cnj: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          const resultado = await buscarESalvarProcessoJudit(input.cnj);
          return {
            ok: true,
            atualizado: resultado.atualizado,
            criado: resultado.criado,
            notFound: resultado.notFound,
            processo: resultado.processo,
          };
        } catch (err) {
          return { ok: false, erro: String(err), atualizado: false, criado: false, notFound: false, processo: null };
        }
      }),

    // Cria requisições Judit para todos os processos desatualizados (background)
    juditDispararBackground: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const { processos: todosProcessos } = await listAllProcessos(1, 10000);
      const ids = todosProcessos.map((p: { id: number }) => p.id);

      // Executa em background (desativado nesta versao)

      return {
        total: ids.length,
        mensagem: `Criando requisições Judit para ${ids.length} processos em background. Acompanhe os logs do servidor.`,
      };
    }),

    // Coleta resultados de requisições Judit pendentes
    juditColetarResultados: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      // Executa em background
      ;(async () => {
        try {
          const resultado = await coletarResultadosPendentes();
          console.log(`[Judit] Coleta: ${resultado.atualizados} atualizados, ${resultado.semAlteracao} sem alteração, ${resultado.erros} erros.`);
        } catch (err) {
          console.error("[Judit] Erro na coleta:", err);
        }
      })();

      return {
        mensagem: "Coletando resultados Judit em background. Os status serão atualizados em breve.",
      };
    }),

    // Listar processos com status de requisição Judit (para painel de filtros)
    juditListarProcessos: protectedProcedure
      .input(z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        statusRequisicao: z.enum(["processing", "completed", "error", "sem_requisicao", "todos"]).optional(),
        statusResumido: z.string().optional(),
        busca: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { statusRequisicao, ...rest } = input;
        const filtroReq = statusRequisicao === "todos" ? undefined : statusRequisicao;
        const resultado = await listJuditProcessos({ ...rest, statusRequisicao: filtroReq });
        return resultado;
      }),

    // Detalhes completos de um processo (incluindo raw_payload da Judit)
    processoDetalhe: protectedProcedure
      .input(z.object({ cnj: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
        const requisicoes = await listAllJuditRequestsByCnj(input.cnj);
        return { ...processo, requisicoes };
      }),

    // Buscar movimentações completas de um processo (steps[] da Judit)
    processoMovimentacoes: protectedProcedure
      .input(z.object({ cnj: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { steps, fromCache, requestId } = await buscarMovimentacoesJudit(input.cnj, true); // true = apenas cache
        return { steps, fromCache, requestId, total: steps.length };
      }),

    // Atualizar processo na Judit sob demanda (com cooldown 24h)
    atualizarProcessoJudit: protectedProcedureWithImpersonationGuard
      .input(z.object({ cnj: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

        // Verificar cooldown 24h
        const consultaRecente = await getConsultaRecenteJudit(input.cnj);
        if (consultaRecente) {
          const horasDesde = (Date.now() - new Date(consultaRecente.createdAt).getTime()) / (1000 * 60 * 60);
          if (horasDesde < 24) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Este processo foi consultado há ${Math.round(horasDesde)}h. Aguarde ${Math.round(24 - horasDesde)}h para consultar novamente.`,
            });
          }
        }

        // Chamar Judit para atualizar
        const { atualizado, criado, processo: processoAtualizado } = await buscarESalvarProcessoJudit(input.cnj);
        if (!processoAtualizado) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado na Judit" });

        return { atualizado, criado, processo: processoAtualizado };
      }),

    // Gera resumo IA do processo usando LLM interno (síncrono, sem polling)
    processoAnaliseIAIniciar: protectedProcedure
      .input(z.object({ cnj: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

        // Cache válido por 7 dias
        if (processo.aiSummary && processo.aiSummaryUpdatedAt) {
          const diasDesde = (Date.now() - new Date(processo.aiSummaryUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
          if (diasDesde < 7) {
            return { requestId: null as string | null, fromCache: true, summary: processo.aiSummary };
          }
        }

        // Extrair dados do payload Judit
        const payload = processo.rawPayload as Record<string, unknown> | null;
        const rd = (payload as Record<string, unknown> | null);
        const partes: string[] = [];
        if (rd && Array.isArray(rd.parties)) {
          for (const p of rd.parties as Record<string, unknown>[]) {
            const nome = (p.name as string) ?? "";
            const polo = (p.polarity as string) ?? "";
            if (nome) partes.push(`${nome} (${polo === "active" ? "Polo Ativo" : polo === "passive" ? "Polo Passivo" : polo})`);
          }
        }
        const steps: string[] = [];
        if (rd && Array.isArray(rd.steps)) {
          const allSteps = rd.steps as Record<string, unknown>[];
          // Pegar as últimas 20 movimentações
          const recentes = allSteps.slice(-20);
          for (const s of recentes) {
            const data = s.step_date ? new Date(s.step_date as string).toLocaleDateString("pt-BR") : "";
            const conteudo = (s.content as string) ?? "";
            if (conteudo) steps.push(`${data}: ${conteudo}`);
          }
        }
        const lastStep = rd && typeof rd.last_step === "object" && rd.last_step
          ? ((rd.last_step as Record<string, unknown>).content as string) ?? ""
          : "";
        const tribunal = (rd?.tribunal_acronym as string) ?? "";
        const fase = (rd?.phase as string) ?? "";
        const classe = (rd?.main_subject as string) ?? (rd?.class_code as string) ?? "";
        const valor = (rd?.value as number) ?? null;
        const statusLabel: Record<string, string> = {
          concluido_ganho: "Ganho (Procedente)",
          concluido_perdido: "Perdido (Improcedente)",
          acordo_negociacao: "Acordo/Conciliação",
          arquivado_encerrado: "Arquivado/Encerrado",
          em_andamento: "Em Andamento",
          cumprimento_de_sentenca: "Cumprimento de Sentença",
          recurso: "Recurso",
          em_analise_inicial: "Em Análise Inicial",
          protocolado: "Protocolado",
          suspenso: "Suspenso",
          sem_atualizacao: "Sem Atualização",
          outros: "Outros",
        };
        const statusTexto = statusLabel[processo.statusResumido ?? ""] ?? processo.statusResumido ?? "Desconhecido";

        const prompt = `Você é um assistente jurídico especializado em direito do consumidor e processos cíveis.
Gere um resumo executivo claro e objetivo do processo judicial abaixo, em português brasileiro.

**Dados do Processo:**
- CNJ: ${processo.cnj}
- Tribunal: ${tribunal || "Não informado"}
- Fase atual: ${fase || "Não informada"}
- Classe/Assunto: ${classe || "Não informado"}
- Valor da causa: ${valor ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Não informado"}
- Status no sistema: ${statusTexto}
- Cliente: ${processo.clienteNome ?? "Não vinculado"}
- Advogado: ${processo.advogado ?? "Não informado"}

**Partes:**
${partes.length > 0 ? partes.join("\n") : "Não disponível"}

**Últimas movimentações (cronológica):**
${steps.length > 0 ? steps.join("\n") : "Não disponível"}

**Última movimentação registrada:** ${lastStep || "Não disponível"}

Gere o resumo com as seguintes seções em Markdown:
1. **Situação Atual** — status atual e fase do processo
2. **Partes Envolvidas** — quem é o autor e o réu
3. **Cronologia Resumida** — principais eventos em ordem cronológica (máximo 5 pontos)
4. **Perspectiva** — análise objetiva das chances ou desfecho já ocorrido

Seja conciso, direto e use linguagem acessível (não excessivamente técnica).`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um assistente jurídico especializado em análise de processos judiciais brasileiros. Responda sempre em português brasileiro com linguagem clara e objetiva." },
            { role: "user", content: prompt },
          ],
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const summary = typeof rawContent === "string" ? rawContent : "Não foi possível gerar o resumo.";

        await updateAiSummary(input.cnj, summary);
        return { requestId: null as string | null, fromCache: false, summary };
      }),

    // Mantido por compatibilidade (não é mais usado com LLM interno)
    processoAnaliseIAStatus: protectedProcedure
      .input(z.object({ cnj: z.string(), requestId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return { status: "completed" as const, summary: null as string | null };
      }),

    // Extrair valor obtido via IA a partir das movimentações do processo
    extrairValorObtidoIA: protectedProcedure
      .input(z.object({ cnj: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

        const payload = processo.rawPayload as Record<string, unknown> | null;
        const steps: Array<{ step_date?: string; content?: string }> = Array.isArray(payload?.steps)
          ? (payload.steps as Array<{ step_date?: string; content?: string }>)
          : [];
        const lastStep = payload?.last_step as { content?: string } | null;
        const valorCausa = payload?.value ?? payload?.amount;
        const statusResumido = processo.statusResumido;
        const nome = (payload?.name as string) ?? "";

        // Montar contexto das últimas 20 movimentações
        const movimentacoesTexto = steps
          .slice(-20)
          .map((s) => `[${s.step_date?.slice(0, 10) ?? "?"}] ${s.content ?? ""}`)
          .join("\n");

        const prompt = `Você é um assistente jurídico especializado. Analise as movimentações abaixo de um processo judicial brasileiro e extraia o VALOR MONETÁRIO OBTIDO (valor da sentença, valor do acordo, valor da condenação ou valor a ser pago ao autor).

Processo: ${input.cnj}
Partes: ${nome}
Status: ${statusResumido}
Valor da causa (pedido inicial): ${valorCausa ? `R$ ${Number(valorCausa).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "não informado"}
Última movimentação: ${lastStep?.content ?? ""}

Movimentações recentes:
${movimentacoesTexto}

Responda APENAS com um JSON no formato: { "valor": 12345.67, "fonte": "descrição de onde extraiu o valor", "confianca": "alta|media|baixa" }
Se não for possível identificar um valor específico, responda: { "valor": null, "fonte": "não identificado", "confianca": "baixa" }`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você extrai valores monetários de textos jurídicos. Responda sempre com JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "valor_obtido",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  valor: { type: ["number", "null"], description: "Valor monetário extraído em reais" },
                  fonte: { type: "string", description: "Descrição de onde o valor foi extraído" },
                  confianca: { type: "string", description: "Nível de confiança: alta, media ou baixa" },
                },
                required: ["valor", "fonte", "confianca"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices?.[0]?.message?.content;
        let resultado = { valor: null as number | null, fonte: "não identificado", confianca: "baixa" };
        try {
          const parsed = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
          resultado = { valor: parsed.valor ?? null, fonte: parsed.fonte ?? "", confianca: parsed.confianca ?? "baixa" };
        } catch { /* mantém default */ }

        if (resultado.valor !== null) {
          await updateValorObtido(input.cnj, resultado.valor);
        }
        return resultado;
      }),

    // Atualizar valor obtido manualmente
    atualizarValorObtido: protectedProcedure
      .input(z.object({ cnj: z.string(), valorObtido: z.number().nullable() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await updateValorObtido(input.cnj, input.valorObtido);
        return { ok: true };
      }),

    // Importar planilha simplificada (CNJ, nome_cliente, advogado, escritorio) + conciliar Judit
    importarPlanilhaSimples: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        nomeArquivo: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const buffer = Buffer.from(input.fileBase64, "base64");
        const resultado = await importarPlanilhaSimples(buffer, input.nomeArquivo);

        // Disparar conciliação Judit em background (não bloqueia a resposta)
        const cnjsOk = resultado.detalhes
          .filter((d) => d.status === "importado")
          .map((d) => d.cnj);

        if (cnjsOk.length > 0) {
          // Executar em background sem await
          conciliarComJuditBackground(resultado.jobId, cnjsOk).catch((err) =>
            console.error("[ImportJob] Erro na conciliação background:", err)
          );
        }

        return {
          jobId: resultado.jobId,
          totalLinhas: resultado.totalLinhas,
          linhasOk: resultado.linhasOk,
          linhasErro: resultado.linhasErro,
          detalhes: resultado.detalhes,
        };
      }),

    // Consultar progresso de um job de importação
    importJobStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const job = await getImportJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job não encontrado" });
        return job;
      }),

    // Listar histórico de jobs de importação simplificada
    listarImportJobs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listImportJobs(30);
    }),

    // Gerar planilha modelo simplificada para download
    gerarPlanilhaModeloSimples: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const wb = XLSX.utils.book_new();
      const dados = [
        ["cnj", "nome_cliente", "advogado", "escritorio"],
        ["0000001-02.2023.8.26.0001", "Maria da Silva", "Dr. João Santos", "Escritório Exemplo"],
        ["0000002-03.2023.8.26.0001", "Carlos Oliveira", "Dra. Ana Lima", "Escritório Exemplo"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(dados);
      ws["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "Processos");
      const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      return { base64: buf as string, filename: "modelo_importacao_simples.xlsx" };
    }),
    // ─── Investidores ──────────────────────────────────────────────────────────────────────────────────────
    // Lista investidores da tabela usuarios (com extra_roles)
    listarInvestidoresUsuarios: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listInvestidoresUsuarios();
    }),
    // Lista advogados da tabela usuarios (com extra_roles)
    listarAdvogadosUsuarios: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listAdvogadosUsuarios();
    }),
    listInvestidores: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listInvestidores();
    }),

    upsertInvestidor: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        percentualParticipacao: z.number().min(0).max(100).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const id = await upsertInvestidor(input.nome, input.percentualParticipacao);
        return { id };
      }),

    vincularInvestidor: protectedProcedure
      .input(z.object({ cnj: z.string(), investidorId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await vincularInvestidorAoProcesso(input.cnj, input.investidorId);
        return { ok: true };
      }),

    vincularInvestidorEmLote: protectedProcedure
      .input(z.object({
        cnjs: z.array(z.string()),
        investidorId: z.number(),
        percentual: z.number().min(1).max(49).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const count = await vincularInvestidorEmLote(input.cnjs, input.investidorId, input.percentual);
        return { count };
      }),

    dashboardInvestidores: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getDashboardInvestidores();
    }),

    processosSemInvestidor: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getProcessosSemInvestidor(200);
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
      ws["!cols"] = [
        { wch: 18 }, { wch: 25 }, { wch: 28 }, { wch: 20 }, { wch: 20 },
        { wch: 25 }, { wch: 20 }, { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Processos");
      const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      return { base64: buf as string, filename: "modelo_importacao_recupera_debito.xlsx" };
    }),

    // ─── Convites ────────────────────────────────────────────────────────────
    gerarConvite: protectedProcedure
      .input(z.object({
        roleConvite: z.enum(["advogado", "investidor", "advogado_investidor"]),
        expiradoEm: z.string().optional(), // ISO date string
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const token = randomUUID().replace(/-/g, "").slice(0, 16);
        const id = await criarConvite({
          token,
          roleConvite: input.roleConvite,
          geradoPor: ctx.user.id,
          expiradoEm: input.expiradoEm ? new Date(input.expiradoEm) : null,
        });
        const link = `${process.env.VITE_FRONTEND_FORGE_API_URL ? "" : ""}/convite/${token}`;
        return { id, token, link };
      }),

    listarConvites: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listConvites();
    }),

    revogarConvite: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await revogarConvite(input.id);
        return { ok: true };
      }),

    // ─── Gestão de Usuários ────────────────────────────────────────────────────
    listarUsuarios: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listUsers();
    }),

     desativarUsuario: protectedProcedure
      .input(z.object({ id: z.number(), ativo: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await updateUserAtivo(input.id, input.ativo);
        return { ok: true };
      }),
    editarUsuario: protectedProcedure
      .input(z.object({
        usuarioId: z.number(),
        nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
        telefone: z.string().nullable().optional().refine(
          (v) => !v || (v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 11),
          { message: "Telefone deve ter 10 ou 11 dígitos" }
        ),
        oab: z.string().max(30).nullable().optional(),
        whatsappSuporte: z.string().nullable().optional().refine(
          (v) => !v || (v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 11),
          { message: "WhatsApp deve ter 10 ou 11 dígitos" }
        ),
        bio: z.string().max(500).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const telefoneLimpo = input.telefone ? input.telefone.replace(/\D/g, "") || null : null;
        const whatsappLimpo = input.whatsappSuporte ? input.whatsappSuporte.replace(/\D/g, "") || null : null;
        await updateUsuarioDados(
          input.usuarioId,
          input.nome,
          telefoneLimpo,
          input.oab !== undefined ? (input.oab ?? null) : undefined,
          whatsappLimpo !== undefined ? whatsappLimpo : undefined,
          input.bio !== undefined ? (input.bio ?? null) : undefined,
        );
        return { ok: true };
      }),
    // ─── Configurações do Sistema ─────────────────────────────────────────────
    getConfiguracoes: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getConfiguracoes();
    }),

    salvarConfiguracoes: protectedProcedure
      .input(z.object({
        nome_sistema: z.string().min(1).max(128).optional(),
        email_contato: z.string().email().or(z.literal("")).optional(),
        whatsapp_contato: z.string().max(20).optional(),
        limite_orcamento_judit: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        alerta_orcamento_pct: z.string().regex(/^\d+$/).optional(),
        alerta_critico_pct: z.string().regex(/^\d+$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const dados: Record<string, string> = {};
        for (const [k, v] of Object.entries(input)) {
          if (v !== undefined) dados[k] = v;
        }
        await salvarConfiguracoes(dados, ctx.user.id);
        return { ok: true };
      }),

    // ─── Gestão de Admins ─────────────────────────────────────────────────────
    promoverAdmin: protectedProcedure
      .input(z.object({ usuarioId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, input.usuarioId));
        return { ok: true };
      }),

    removerAdmin: protectedProcedure
      .input(z.object({ usuarioId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (input.usuarioId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover seu próprio acesso de admin." });
        }
        // Garantir que sempre exista pelo menos 1 admin
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq, sql: sqlFn } = await import("drizzle-orm");
        const [countRow] = await db.select({ total: sqlFn<number>`count(*)` }).from(usersTable).where(eq(usersTable.role, "admin"));
        if (Number(countRow?.total ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Deve existir pelo menos 1 administrador no sistema." });
        }
        await db.update(usersTable).set({ role: "user" }).where(eq(usersTable.id, input.usuarioId));
        return { ok: true };
      }),

    // ─── Impersonação ──────────────────────────────────────────────────────────
    iniciarImpersonacao: protectedProcedure
      .input(z.object({
        usuarioId: z.number(),
        origin: z.string().url(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        // Não permitir impersonar outro admin
        const alvo = await getUserById(input.usuarioId);
        if (!alvo) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
        if (alvo.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Não é possível impersonar outro administrador" });
        const token = randomUUID();
        await criarImpersonacao(ctx.user.id, input.usuarioId, token);
        const url = `${input.origin}/impersonar?token=${token}`;
        return { token, url, nomeUsuario: alvo.name };
      }),

    encerrarImpersonacao: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await encerrarImpersonacao(input.token);
        return { ok: true };
      }),

    // ─── Lotes ────────────────────────────────────────────────────────────────
    criarLote: protectedProcedure
      .input(z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        advogadoId: z.number().optional(),
        percentualEmpresa: z.number().min(0).max(100).default(0),
        investidores: z.array(z.object({ usuarioId: z.number(), percentual: z.number() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const id = await criarLoteSimples({
          nome: input.nome,
          descricao: input.descricao,
          advogadoId: input.advogadoId,
          percentualEmpresa: input.percentualEmpresa,
        });
        if (input.investidores) {
          for (const inv of input.investidores) {
            await adicionarInvestidorLote(id, inv.usuarioId, inv.percentual);
          }
        }
        return { id };
      }),

    editarLote: protectedProcedure
      .input(z.object({
        loteId: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional(),
        advogadoId: z.number().optional(),
        percentualEmpresa: z.number().optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { loteId, ...data } = input;
        await editarLoteSimples(loteId, data);
        return { ok: true };
      }),

    vincularProcessoLote: protectedProcedure
      .input(z.object({ processoId: z.number(), loteId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await vincularProcessoAoLote(input.processoId, input.loteId);
        return { ok: true };
      }),

    // ─── Lotes completos (com validação de percentuais) ─────────────────────────
    listarLotes: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listarLotes();
    }),

    novoLote: protectedProcedure
      .input(z.object({
        nome: z.string().min(1, "Nome obrigatório"),
        descricao: z.string().optional().nullable(),
        advogadoId: z.number().optional().nullable(),
        percentualEmpresa: z.number().min(0).max(49),
        percentualAdvogado: z.number().min(0).max(49),
        investidores: z.array(z.object({
          usuarioId: z.number(),
          percentual: z.number().min(0).max(49),
        })).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          const id = await criarLoteCompleto({
            nome: input.nome,
            descricao: input.descricao,
            advogadoId: input.advogadoId,
            percentualEmpresa: input.percentualEmpresa,
            percentualAdvogado: input.percentualAdvogado,
            criadoPor: ctx.user.id,
            investidores: input.investidores,
          });
          return { id };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro ao criar lote";
          throw new TRPCError({ code: "BAD_REQUEST", message: msg });
        }
      }),

    atualizarLote: protectedProcedure
      .input(z.object({
        loteId: z.number(),
        nome: z.string().optional(),
        descricao: z.string().optional().nullable(),
        advogadoId: z.number().optional().nullable(),
        percentualEmpresa: z.number().min(0).max(49).optional(),
        percentualAdvogado: z.number().min(0).max(49).optional(),
        investidores: z.array(z.object({
          usuarioId: z.number(),
          percentual: z.number().min(0).max(49),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          await editarLoteCompleto(input);
          return { ok: true };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Erro ao editar lote";
          throw new TRPCError({ code: "BAD_REQUEST", message: msg });
        }
      }),

    importarProcessosLote: protectedProcedure
      .input(z.object({
        loteId: z.number(),
        cnjs: z.array(z.string()).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return importarProcessosLote(input.loteId, input.cnjs);
      }),

    processosDoLote: protectedProcedure
      .input(z.object({
        loteId: z.number(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listarProcessosLote(input.loteId, input.page, input.pageSize);
      }),

    desvincularProcessoLote: protectedProcedure
      .input(z.object({ processoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await desvincularProcessoLote(input.processoId);
        return { ok: true };
      }),

    errosDoLote: protectedProcedure
      .input(z.object({ loteId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listarErrosLote(input.loteId);
      }),

    resolverErroLote: protectedProcedure
      .input(z.object({
        erroId: z.number(),
        observacao: z.string().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await resolverErroLote(input.erroId, input.observacao ?? null);
        return { ok: true };
      }),

    // ─── Fila Judit (admin) ────────────────────────────────────────────────────
    metricsJudit: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return metricsJudit();
    }),
    filaJuditFiltrada: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
        busca: z.string().optional(),
        advogadoId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listFilaJuditFiltrada(input);
      }),
    historicoJudit: protectedProcedure
      .input(z.object({
        periodo: z.enum(["7d", "30d", "custom"]).default("30d"),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listHistoricoJudit({
          periodo: input.periodo,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : undefined,
          dataFim: input.dataFim ? new Date(input.dataFim) : undefined,
          page: input.page,
          pageSize: input.pageSize,
        });
      }),
    buscarProcessosPorCpf: protectedProcedure
      .input(z.object({ cpf: z.string().min(11).max(18) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return buscarProcessosPorCpfLocal(input.cpf);
      }),
    filaJudit: protectedProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listFilaJudit(input.page, input.pageSize);
      }),

    aprovarFilaJudit: protectedProcedure
      .input(z.object({
        processoIds: z.array(z.number()),
        requestKey: z.string().uuid().optional(), // C5: idempotência
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        // C5: Idempotência — verificar se requestKey já foi processado
        if (input.requestKey) {
          const resultadoExistente = await getOperacaoIdempotente(input.requestKey);
          if (resultadoExistente) {
            console.log(`[aprovarFilaJudit] requestKey ${input.requestKey} já processado — retornando resultado anterior`);
            return JSON.parse(resultadoExistente);
          }
        }

        // Limpar operações expiradas em background (sem await)
        limparOperacoesExpiradas().catch(() => {});

        const resultados: Array<{
          processoId: number;
          ok: boolean;
          notFound?: boolean;
          pulado?: boolean;
          motivo?: string;
          erro?: string;
        }> = [];
        let pulados = 0;

        // Buscar todos os processos da fila de uma vez (mais eficiente)
        const filaCompleta = await listFilaJudit(1, 10000);

        // C2+C4: Processamento em lotes de 5 com pausa de 500ms entre lotes
        // Evita sobrecarregar a API Judit e disparar rate limit
        const BATCH_SIZE = 5;
        const DELAY_MS = 500;
        const total = input.processoIds.length;
        console.log(`[aprovarFilaJudit] Iniciando processamento de ${total} processo(s) em lotes de ${BATCH_SIZE} (requestKey=${input.requestKey ?? 'N/A'})`);

        for (let i = 0; i < total; i += BATCH_SIZE) {
          const loteParcial = input.processoIds.slice(i, i + BATCH_SIZE);
          const loteNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalLotes = Math.ceil(total / BATCH_SIZE);
          console.log(`[aprovarFilaJudit] Lote ${loteNum}/${totalLotes}: processando IDs [${loteParcial.join(", ")}]`);

          // Processar cada item do lote sequencialmente (não em paralelo)
          // para evitar condições de corrida e sobrecarga do banco
          for (const processoId of loteParcial) {
            try {
              const proc = filaCompleta.processos.find(p => p.id === processoId);
              if (!proc) {
                console.warn(`[aprovarFilaJudit] Processo ID ${processoId} não encontrado na fila`);
                resultados.push({ processoId, ok: false, erro: "Não encontrado" });
                continue;
              }

              // C2: Verificar se statusJudit ainda é aguardando_aprovacao_judit
              if (proc.statusJudit !== "aguardando_aprovacao_judit") {
                console.log(`[aprovarFilaJudit] CNJ ${proc.cnj} já foi consultado (statusJudit=${proc.statusJudit}) — pulando`);
                pulados++;
                resultados.push({ processoId, ok: true, pulado: true, motivo: `statusJudit=${proc.statusJudit}` });
                continue;
              }

              console.log(`[aprovarFilaJudit] Consultando CNJ ${proc.cnj} (processoId=${processoId})...`);
              const tInicio = Date.now();

              // Disparar consulta Judit
              const resultado = await buscarESalvarProcessoJudit(proc.cnj);
              const durMs = Date.now() - tInicio;

              if (resultado.notFound) {
                console.log(`[aprovarFilaJudit] CNJ ${proc.cnj} — não encontrado na Judit (${durMs}ms)`);
                await marcarProcessoNaoEncontradoJudit(processoId);
                await insertJuditConsultaLog({
                  processoCnj: proc.cnj,
                  requestId: resultado.requestId ?? null,
                  tipo: "consulta_lote",
                  custo: "0.25",
                  status: "nao_encontrado",
                  aprovadoPorId: ctx.user.id,
                  isDuplicata: false,
                });
                resultados.push({ processoId, ok: true, notFound: true });
              } else {
                console.log(`[aprovarFilaJudit] CNJ ${proc.cnj} — sucesso requestId=${resultado.requestId ?? 'N/A'} (${durMs}ms)`);
                await aprovarProcessoJudit(processoId, ctx.user.id);
                await insertJuditConsultaLog({
                  processoCnj: proc.cnj,
                  requestId: resultado.requestId ?? null,
                  tipo: "consulta_lote",
                  custo: "0.25",
                  status: "sucesso",
                  aprovadoPorId: ctx.user.id,
                  isDuplicata: false,
                });
                resultados.push({ processoId, ok: true, notFound: false });
              }
            } catch (err) {
              const proc2 = filaCompleta.processos.find((p) => p.id === processoId);
              const errMsg = String(err);
              console.error(`[aprovarFilaJudit] Erro ao processar ID ${processoId} (CNJ=${proc2?.cnj ?? 'N/A'}): ${errMsg}`);
              if (proc2) {
                await insertJuditConsultaLog({
                  processoCnj: proc2.cnj,
                  requestId: null,
                  tipo: "consulta_lote",
                  custo: "0.25",
                  status: "erro",
                  aprovadoPorId: ctx.user.id,
                  isDuplicata: false,
                }).catch(() => {});
              }
              resultados.push({ processoId, ok: false, erro: errMsg });
            }
          }

          // Pausa entre lotes (exceto no último)
          if (i + BATCH_SIZE < total) {
            console.log(`[aprovarFilaJudit] Pausa de ${DELAY_MS}ms antes do próximo lote...`);
            await sleep(DELAY_MS);
          }
        }

        const ok = resultados.filter(r => r.ok && !r.pulado).length;
        const erros = resultados.filter(r => !r.ok).length;
        console.log(`[aprovarFilaJudit] Concluído: ${ok} sucesso(s), ${pulados} pulado(s), ${erros} erro(s) de ${total} total`);

        const resposta = { resultados, pulados };

        // C5: Salvar resultado para idempotência
        if (input.requestKey) {
          await salvarOperacaoIdempotente(input.requestKey, resposta).catch(() => {});
        }

        return resposta;
      }),

    // ─── Importação Unificada (sem Judit) ──────────────────────────────
    importarProcessos: protectedProcedure
      .input(z.object({
        fileBase64: z.string(),
        nomeArquivo: z.string(),
        advogadoId: z.number().int().positive().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const buffer = Buffer.from(input.fileBase64, "base64");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new TRPCError({ code: "BAD_REQUEST", message: "Planilha vazia" });
        const sheet = wb.Sheets[sheetName]!;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
        let importadas = 0, atualizadas = 0, erros = 0;
        const detalhes: { linha: number; cnj: string; status: string; erro?: string }[] = [];
        // advogadoId vem do frontend (selecionado pelo admin antes do upload)
        const advogadoIdImportacao: number | undefined = input.advogadoId ?? undefined;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          const cnj = String(row["cnj"] ?? row["CNJ"] ?? "").trim();
          const cpf = String(row["cpf"] ?? row["CPF"] ?? "").trim();
          const nomeCliente = String(row["nome_cliente"] ?? row["Nome Cliente"] ?? row["nome"] ?? "").trim();
          if (!cnj) { erros++; detalhes.push({ linha: i + 2, cnj: cnj || "(vazio)", status: "erro", erro: "CNJ ausente" }); continue; }
          try {
            // Buscar ou criar cliente
            let clienteId: number;
            if (cpf) {
              const cpfLimpo = cpf.replace(/\D/g, "");
              const cpfFormatado = cpfLimpo.length === 11
                ? `${cpfLimpo.slice(0,3)}.${cpfLimpo.slice(3,6)}.${cpfLimpo.slice(6,9)}-${cpfLimpo.slice(9)}`
                : cpfLimpo;
              clienteId = await upsertCliente({ nome: nomeCliente || "A identificar", cpf: cpfFormatado });
            } else if (nomeCliente) {
              clienteId = await upsertCliente({ nome: nomeCliente });
            } else {
              erros++; detalhes.push({ linha: i + 2, cnj, status: "erro", erro: "CPF e nome ausentes" }); continue;
            }
            // Verificar se processo já existe
            const existente = await getProcessoByCnj(cnj);
            if (existente) {
              atualizadas++;
              detalhes.push({ linha: i + 2, cnj, status: "atualizado" });
            } else {
              await upsertProcesso({
                cnj,
                clienteId,
                advogadoId: advogadoIdImportacao,
                statusResumido: "em_analise_inicial",
                statusJudit: "aguardando_aprovacao_judit",
                fonteAtualizacao: "judit",
              } as Parameters<typeof upsertProcesso>[0]);
              importadas++;
              detalhes.push({ linha: i + 2, cnj, status: "importado" });
            }
          } catch (err) {
            erros++;
            detalhes.push({ linha: i + 2, cnj, status: "erro", erro: String(err) });
          }
        }
        await insertLogImportacaoUnificado({
          nomeArquivo: input.nomeArquivo,
          totalLinhas: rows.length,
          linhasImportadas: importadas,
          linhasAtualizadas: atualizadas,
          linhasErro: erros,
          detalhes: detalhes as unknown as Record<string, unknown>[],
          importadoPorId: ctx.user.id,
        });
        return { totalLinhas: rows.length, importadas, atualizadas, erros, detalhes };
      }),

    gerarModeloImportacao: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Apenas aba Processos — sem coluna advogado_email e sem aba Advogados
      const wsProcessos = XLSX.utils.aoa_to_sheet([
        ["cnj", "cpf", "nome_cliente"],
        ["0000000-00.0000.0.00.0000", "000.000.000-00", "Nome do Cliente"],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsProcessos, "Processos");
      const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      return { fileBase64: buf, nomeArquivo: "modelo_importacao.xlsx" };
    }),

    historicoImportacoesUnificado: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listLogsImportacaoUnificado(20);
    }),

    logJuditConsultas: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const [logs, stats] = await Promise.all([
          listJuditConsultaLog(input.limit),
          countJuditConsultaLog(),
        ]);
        return { logs, stats };
      }),

    metricsAnalisesIA: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return metricsAnalisesIA();
    }),

    listAnalisesIA: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listAnalisesIA({ page: input.page, pageSize: input.pageSize });
      }),

    // Análise IA com LLM Manus
    analisarProcessoIA: protectedProcedure
      .input(z.object({ cnj: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        const processo = await getProcessoByCnj(input.cnj);
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

        const prompt = `Você é um assistente jurídico especializado. Analise os dados do processo abaixo e responda EXCLUSIVAMENTE em JSON com as chaves: situacaoAtual, ultimaMovimentacao, proximoPasso, perspectiva. Linguagem simples, sem juridiqês, máximo 2 frases por campo.

DADOS DO PROCESSO:
${JSON.stringify(processo, null, 2)}`;

        let sucesso = false;
        let tokensEntrada: number | undefined;
        let tokensSaida: number | undefined;
        let modelo: string | undefined;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "Você é um assistente jurídico especializado. Responda sempre em JSON válido." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "analise_processo",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    situacaoAtual: { type: "string", description: "Situação atual do processo em linguagem simples" },
                    ultimaMovimentacao: { type: "string", description: "Descrição da última movimentação" },
                    proximoPasso: { type: "string", description: "Próximo passo esperado no processo" },
                    perspectiva: { type: "string", description: "Perspectiva geral do processo" },
                  },
                  required: ["situacaoAtual", "ultimaMovimentacao", "proximoPasso", "perspectiva"],
                  additionalProperties: false,
                },
              },
            },
          });

          // Extrair tokens e modelo se disponível
          tokensEntrada = response.usage?.prompt_tokens;
          tokensSaida = response.usage?.completion_tokens;
          modelo = response.model;

          const texto = response.choices[0]?.message?.content;
          if (!texto || typeof texto !== "string") {
            throw new Error("Resposta vazia da LLM");
          }
          const analise = JSON.parse(texto);
          sucesso = true;

          // Registrar log
          await insertManusLlmLog({
            processoCnj: input.cnj,
            solicitadoPor: ctx.user.id,
            tokensEntrada: tokensEntrada ?? null,
            tokensSaida: tokensSaida ?? null,
            custoEstimado: null, // API Manus não retorna custo diretamente
            modelo: modelo ?? null,
            sucesso: true,
          });

          return { analise, custoEstimado: null, modelo: modelo ?? null };
        } catch (error) {
          console.error("[LLM Manus] Erro na análise:", error);
          // Registrar falha no log
          await insertManusLlmLog({
            processoCnj: input.cnj,
            solicitadoPor: ctx.user.id,
            tokensEntrada: tokensEntrada ?? null,
            tokensSaida: tokensSaida ?? null,
            custoEstimado: null,
            modelo: modelo ?? null,
            sucesso: false,
          }).catch(() => {}); // Não deixar erro de log quebrar o fluxo
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao analisar processo com IA" });
        }
      }),
  }),

  // ─── Convite Público ────────────────────────────────────────────────────────────────
  convite: router({
    verificar: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const convite = await getConviteByToken(input.token);
        if (!convite) return { valido: false, motivo: "Link de convite inválido ou expirado. Solicite um novo ao administrador." };
        if (!convite.ativo) return { valido: false, motivo: "Este convite já foi utilizado ou foi revogado." };
        if (convite.usadoPor) return { valido: false, motivo: "Este convite já foi utilizado." };
        if (convite.expiradoEm && new Date() > new Date(convite.expiradoEm)) return { valido: false, motivo: "Link de convite inválido ou expirado. Solicite um novo ao administrador." };
        return { valido: true, roleConvite: convite.roleConvite, token: convite.token };
      }),

    // Após OAuth: vincular convite ao usuário logado
    vincularAoUsuario: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const convite = await getConviteByToken(input.token);
        if (!convite) throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado" });
        if (!convite.ativo || convite.usadoPor) throw new TRPCError({ code: "BAD_REQUEST", message: "Convite já utilizado" });
        if (convite.expiradoEm && new Date() > new Date(convite.expiradoEm)) throw new TRPCError({ code: "BAD_REQUEST", message: "Convite expirado" });

        // Definir extra_roles baseado no roleConvite
        const extraRoles = convite.roleConvite === "advogado_investidor"
          ? ["advogado", "investidor"]
          : [convite.roleConvite];

        await setUserExtraRoles(ctx.user.id, extraRoles, convite.id);
        await usarConvite(input.token, ctx.user.id);

        return { ok: true, extraRoles };
      }),
  }),

  // ─── Advogado ─────────────────────────────────────────────────────────────────────────────
  advogado: router({
    meusDados: protectedProcedure.query(async ({ ctx }) => {
      const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
      if (!roles.includes("advogado") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const metrics = await metricsAdvogado(ctx.user.id);
      return { user: ctx.user, metrics };
    }),

    meusProcessos: protectedProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }))
      .query(async ({ input, ctx }) => {
        const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
        if (!roles.includes("advogado") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return listProcessosDoAdvogado(ctx.user.id, input.page, input.pageSize);
      }),

    cadastrarProcesso: protectedProcedureWithImpersonationGuard
      .input(z.object({
        cnj: z.string().min(1),
        cpfCliente: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
        if (!roles.includes("advogado") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Normalizar CPF
        const cpfLimpo = input.cpfCliente.replace(/\D/g, "");
        const cpfFormatado = cpfLimpo.length === 11
          ? `${cpfLimpo.slice(0,3)}.${cpfLimpo.slice(3,6)}.${cpfLimpo.slice(6,9)}-${cpfLimpo.slice(9)}`
          : cpfLimpo;

        // Buscar ou criar cliente
        let cliente = await getClienteByCpf(cpfFormatado);
        let clienteId: number;
        if (!cliente) {
          clienteId = await upsertCliente({ nome: "A identificar", cpf: cpfFormatado });
        } else {
          clienteId = cliente.id;
        }

        // Criar processo localmente — NUNCA aciona Judit
        await upsertProcesso({
          cnj: input.cnj,
          clienteId,
          advogadoId: ctx.user.id,
          statusResumido: "em_analise_inicial",
          statusJudit: "aguardando_aprovacao_judit",
          fonteAtualizacao: "judit",
        } as Parameters<typeof upsertProcesso>[0]);

        return { ok: true, mensagem: "Processo cadastrado com sucesso. O administrador será notificado para consultar na Judit." };
      }),

    registrarResultado: protectedProcedureWithImpersonationGuard
      .input(z.object({
        processoId: z.number(),
        valorObtido: z.number().nullable(),
        clientePago: z.boolean(),
        dataPagamento: z.string().nullable(), // ISO date
        valorPagoCliente: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
        if (!roles.includes("advogado") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await registrarResultadoProcesso(input.processoId, {
          valorObtido: input.valorObtido,
          clientePago: input.clientePago,
          dataPagamentoCliente: input.dataPagamento ? new Date(input.dataPagamento) : null,
          valorPagoCliente: input.valorPagoCliente,
        });
        return { ok: true };
      }),

    declinarProcesso: protectedProcedureWithImpersonationGuard
      .input(z.object({ processoId: z.number(), motivo: z.string().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
        if (!roles.includes("advogado") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await declinarProcesso(input.processoId, input.motivo);
        return { ok: true };
      }),
  }),

  // ─── Judit: Problemas ──────────────────────────────────────────────────────────────────────
  juditProblemas: router({
    detectarTimeouts: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return detectarERegistrarTimeouts();
    }),
    listar: protectedProcedure
      .input(z.object({ apenasNaoResolvidos: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listarProblemasJudit({ apenasNaoResolvidos: input.apenasNaoResolvidos });
      }),
    contagem: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return countProblemasJudit();
    }),
    marcarResolvido: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await marcarProblemaResolvido(input.id);
        return { ok: true };
      }),
    atualizarObservacao: protectedProcedure
      .input(z.object({ id: z.number(), observacao: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await atualizarObservacaoProblema(input.id, input.observacao);
        return { ok: true };
      }),
    tentarNovamente: protectedProcedure
      .input(z.object({ id: z.number(), processoCnj: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        // Incrementar tentativas no problema
        await incrementarTentativasProblema(input.id);
        // Resetar statusJudit para aguardando_aprovacao_judit (volta para a fila)
        await resetStatusJuditParaFila(input.processoCnj);
        return { ok: true };
      }),
  }),

  // ─── Investidor ───────────────────────────────────────────────────────────────────────────
  investidor: router({
    meusDados: protectedProcedure.query(async ({ ctx }) => {
      const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
      if (!roles.includes("investidor") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const metrics = await metricsInvestidor(ctx.user.id);
      return { user: ctx.user, metrics };
    }),

    meusProcessos: protectedProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        const roles: string[] = (ctx.user.extraRoles as string[] | null) ?? [];
        if (!roles.includes("investidor") && !roles.includes("advogado_investidor") && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return listProcessosDoInvestidor(ctx.user.id, input.page, input.pageSize);
      }),
  }),
});

export type AppRouter = typeof appRouter;
