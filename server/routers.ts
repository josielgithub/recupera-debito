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
  // Pré-cadastro de usuário pelo admin
  criarUsuarioPreCadastrado,
  gerarLinkAcessoUsuario,
} from "./db";
import { processarPlanilha } from "./importacao";
import { importarPlanilhaSimples, conciliarComJuditBackground } from "./importacaoSimples";
import { metricsQualidadeJudit, listRegistrosProblemáticos, creditoRestanteEsteMs } from "./judit-qualidade";
import {
  sleep,
  buscarESalvarProcessoJudit,
  atualizarProcesso,
  buscarMovimentacoesJudit,
  coletarResultadosPendentes,
  criarRequisicaoJudit,
  iniciarAnaliseIA,
  verificarAnaliseIA,
  buscarProcessosPorCpfJudit,
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
  marcarAutosSolicitado,
  listProcessoAutos,
  insertProcessoAuto,
  marcarAutosDisponiveis,
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

        // Buscar documentos para processos com autos disponíveis
        const processosComDocs = await Promise.all(
          processosCliente.map(async (p, idx) => {
            const documentos = p.autosDisponiveis ? await listProcessoAutos(p.id) : [];
            return {
              indice: idx + 1,
              statusResumido: p.statusResumido,
              ultimaAtualizacao: p.ultimaAtualizacaoApi ?? p.updatedAt,
              autosDisponiveis: p.autosDisponiveis ?? false,
              documentos: documentos.map(d => ({
                nome: d.nomeArquivo,
                extensao: d.extensao,
                dataDocumento: d.dataDocumento,
              })),
              advogado: p.advogadoInfo ?? null,
              parceiro: p.parceiro
                ? { nome: p.parceiro.nomeEscritorio, whatsapp: p.parceiro.whatsapp, email: p.parceiro.email }
                : null,
            };
          })
        );

        return {
          nomeCliente: cliente.nome,
          processos: processosComDocs,
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

        // Campos para o novo user prompt
        const rdName = (rd?.name as string) ?? "Não informado";
        const rdTribunal = (rd?.tribunal_acronym as string) ?? "Não informado";
        const rdCounty = (rd?.county as string) ?? "Não informado";
        const rdState = (rd?.state as string) ?? "Não informado";
        const rdArea = (rd?.area as string) ?? "Não informado";
        const rdPhase = (rd?.phase as string) ?? "Não informado";
        const rdAmount = rd?.value ?? rd?.amount ?? null;
        const rdAmountFmt = rdAmount ? `R$ ${Number(rdAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Não informado";
        const rdDistDate = rd?.distribution_date
          ? new Date(rd.distribution_date as string).toLocaleDateString("pt-BR")
          : "Não informado";
        const rdLastStepObj = (rd?.last_step ?? null) as Record<string, unknown> | null;
        const rdLastStepContent = (rdLastStepObj?.content as string) ?? "Não informado";
        const rdLastStepDate = rdLastStepObj?.step_date
          ? new Date(rdLastStepObj.step_date as string).toLocaleDateString("pt-BR")
          : "Não informado";
        const rdSteps = Array.isArray(rd?.steps) ? (rd!.steps as unknown[]) : [];
        const rdStepsCount = rdSteps.length;
        const rdSubjects = Array.isArray(rd?.subjects)
          ? (rd!.subjects as Record<string, unknown>[]).map((s) => s.name ?? s.code ?? "").filter(Boolean).join(", ")
          : "Não informado";
        const rdAttachments = Array.isArray(rd?.attachments) ? (rd!.attachments as unknown[]) : [];
        const rdAttachmentsCount = rdAttachments.length;
        const rdAttachmentNames = rdAttachments.length > 0
          ? (rdAttachments as Record<string, unknown>[]).map((a) => a.attachment_name ?? a.name ?? "").filter(Boolean).join(", ")
          : "Nenhum";
        const rdRelated = Array.isArray(rd?.related_lawsuits) ? (rd!.related_lawsuits as unknown[]) : [];
        const rdRelatedCount = rdRelated.length;

        const statusLabel: Record<string, string> = {
          concluido_ganho: "Ganho (Procedente)",
          concluido_perdido: "Perdido (Improcedente)",
          acordo_negociacao: "Acordo/Conciliação",
          arquivado_encerrado: "Arquivado/Encerrado (Revisão Manual)",
          em_andamento: "Em Andamento",
          em_recurso: "Em Recurso (Instância Superior)",
          cumprimento_de_sentenca: "Cumprimento de Sentença",
          em_analise_inicial: "Em Análise Inicial",
          protocolado: "Protocolado",
          suspenso: "Suspenso",
          sem_atualizacao: "Sem Atualização",
          outros: "Outros",
        };
        const statusTexto = statusLabel[processo.statusResumido ?? ""] ?? processo.statusResumido ?? "Desconhecido";

        const prompt = `Analise este processo judicial:

CNJ: ${processo.cnj}
Partes: ${rdName}
Tribunal: ${rdTribunal} — ${rdCounty} — ${rdState}
Área: ${rdArea}
Status atual: ${statusTexto}
Fase: ${rdPhase}
Valor em disputa: ${rdAmountFmt}
Data de distribuição: ${rdDistDate}
Última movimentação em ${rdLastStepDate}: ${rdLastStepContent}
Total de movimentações: ${rdStepsCount}
Assuntos: ${rdSubjects}
Documentos anexados: ${rdAttachmentsCount}
Nomes dos documentos: ${rdAttachmentNames}
Processos relacionados em outras instâncias: ${rdRelatedCount}`;

        const systemPrompt = `Você é um assistente jurídico especializado em processos de recuperação de débito no Brasil.

CONTEXTO DO ESCRITÓRIO:
- Atua exclusivamente em recuperação de crédito para pessoas físicas (consumidores)
- Processos movidos contra bancos, financeiras e empresas de cobrança
- Casos mais comuns: cobranças indevidas, negativação indevida, juros abusivos, tarifas bancárias ilegais e danos morais
- Áreas: Direito do Consumidor e Direito Bancário
- Tribunais: majoritariamente Juizados Especiais Cíveis em todo o Brasil

MODELO FINANCEIRO:
- 51% do valor ganho sempre vai para o cliente
- 49% dividido entre escritório, advogado e investidores
- O valor da causa é o valor em disputa, não necessariamente o que será recebido

INTERPRETAÇÃO DE STATUS:
- Alvará expedido = processo GANHO, cliente tem direito a receber
- Baixa definitiva ou arquivado definitivamente sem alvará = processo provavelmente PERDIDO
- Transitado em julgado com baixa = encerrado definitivamente, sem alvará provavelmente perdido
- Trânsito em julgado sozinho = decisão final mas ainda pode ter execução pendente
- Cumprimento de sentença = cliente ganhou e está na fase de receber
- Remetidos os autos em grau de recurso = foi para instância superior, ainda em andamento
- Conclusos para despacho = aguardando decisão do juiz
- Decorrido prazo = prazo processual expirou, aguarda próximo passo
- Juntada de certidão ou petição = movimentação administrativa, processo ativo
- Related_lawsuits = processo relacionado em outra instância
- Em andamento no JEC = prazo médio de 6 a 18 meses

FORMATO DA RESPOSTA:
Responda sempre em português brasileiro, linguagem clara e direta, sem jargão jurídico.
Escreva como se estivesse explicando para o próprio cliente leigo.
Estruture em exatamente 4 parágrafos curtos com esses títulos em negrito:

**Situação atual:** O que está acontecendo agora com o processo em 1 ou 2 frases.
**Última movimentação:** O que significou a última movimentação em linguagem simples.
**Próximo passo:** O que provavelmente vai acontecer a seguir.
**Valor:** Se houver valor em disputa, mencionar o valor total e quanto o cliente pode receber (51%).

Máximo 150 palavras no total. Seja objetivo e direto.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
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

    // ─── Pré-cadastro de Usuário pelo Admin ───────────────────────────────────────────────
    criarUsuario: protectedProcedure
      .input(z.object({
        nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
        roleConvite: z.enum(["advogado", "investidor", "advogado_investidor"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const extraRoles = input.roleConvite === "advogado_investidor"
          ? ["advogado", "investidor"]
          : [input.roleConvite];
        const { userId, conviteToken } = await criarUsuarioPreCadastrado({
          nome: input.nome,
          extraRoles,
          adminId: ctx.user.id,
        });
        return { userId, conviteToken };
      }),

    gerarLinkAcesso: protectedProcedure
      .input(z.object({
        usuarioId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { token } = await gerarLinkAcessoUsuario({
          usuarioId: input.usuarioId,
          adminId: ctx.user.id,
        });
        return { token };
      }),

    // ─── Download de Autos Processuais ──────────────────────────────────────────────
    baixarAutosProcessos: protectedProcedure
      .input(z.object({
        processoIds: z.array(z.number()).min(1).max(50),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        const { getDb } = await import("./db");
        const { processos: processosTable } = await import("../drizzle/schema");
        const { inArray } = await import("drizzle-orm");

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Buscar processos selecionados
        const processosSelecionados = await db
          .select()
          .from(processosTable)
          .where(inArray(processosTable.id, input.processoIds));

        const resultado = {
          iniciados: 0,
          jaTemAutos: 0,
          erros: 0,
          detalhes: [] as { cnj: string; status: "iniciado" | "ja_tem_autos" | "erro"; erro?: string }[],
        };

        // Processar em lotes de 3 com pausa de 1s entre lotes
        const LOTE_SIZE = 3;
        for (let i = 0; i < processosSelecionados.length; i += LOTE_SIZE) {
          const lote = processosSelecionados.slice(i, i + LOTE_SIZE);

          await Promise.all(lote.map(async (processo) => {
            try {
              // Verificar se já tem autos
              if (processo.autosDisponiveis) {
                resultado.jaTemAutos++;
                resultado.detalhes.push({ cnj: processo.cnj, status: "ja_tem_autos" });
                return;
              }

              // Criar requisição Judit com with_attachments=true
              const requestId = await criarRequisicaoJudit(processo.cnj, processo.id, true);

              // Registrar no log de consulta com custo R$3,50
              await insertJuditConsultaLog({
                processoCnj: processo.cnj,
                requestId,
                tipo: "download_autos",
                custo: "3.50",
                status: "sucesso",
                aprovadoPorId: ctx.user.id,
                isDuplicata: false,
              });

              // Marcar como solicitado
              await marcarAutosSolicitado(processo.id);

              resultado.iniciados++;
              resultado.detalhes.push({ cnj: processo.cnj, status: "iniciado" });
              console.log(`[Autos] Download solicitado para CNJ ${processo.cnj} — requestId: ${requestId}`);
            } catch (err) {
              resultado.erros++;
              resultado.detalhes.push({ cnj: processo.cnj, status: "erro", erro: String(err) });
              console.error(`[Autos] Erro ao solicitar download para CNJ ${processo.cnj}:`, err);
            }
          }));

          // Pausa de 1s entre lotes (exceto no último)
          if (i + LOTE_SIZE < processosSelecionados.length) {
            await sleep(1000);
          }
        }

        return resultado;
      }),

    getAutosProcesso: protectedProcedure
      .input(z.object({ processoId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { listProcessoAutos } = await import("./db");
        return listProcessoAutos(input.processoId);
      }),


    // ─── Download físico de anexo individual ─────────────────────────────────────
    downloadAnexo: protectedProcedure
      .input(z.object({
        processoId: z.number(),
        autoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const { processoAutos, processos: processosTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { storagePut } = await import("./storage");
        const { downloadAnexoJudit } = await import("./judit");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Buscar o auto e o processo
        const [auto] = await db.select().from(processoAutos).where(eq(processoAutos.id, input.autoId));
        if (!auto) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado" });
        if (auto.processoId !== input.processoId) throw new TRPCError({ code: "FORBIDDEN" });

        // Se já tem URL no S3, retornar direto
        if (auto.urlS3 && auto.urlS3.trim().length > 0) {
          return { url: auto.urlS3, cached: true };
        }

        // Buscar o processo para obter CNJ e instância
        const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, input.processoId));
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });

        const instancia = auto.instancia ?? 1;

        // Baixar o arquivo da Judit
        const result = await downloadAnexoJudit(processo.cnj, instancia, auto.attachmentId);
        if (!result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Não foi possível baixar o anexo ${auto.attachmentId}. O arquivo pode estar com status 'pending' (ainda sendo processado pela Judit).`,
          });
        }

        // Salvar no S3
        const ext = auto.extensao ?? result.fileName.split(".").pop() ?? "bin";
        const fileKey = `autos/${processo.cnj.replace(/[^\w]/g, "_")}/${auto.attachmentId}.${ext}`;
        const { url } = await storagePut(fileKey, result.buffer, result.contentType);

        // Atualizar o registro com a URL do S3
        await db.update(processoAutos)
          .set({ urlS3: url, fileKey, tamanhoBytes: result.buffer.length })
          .where(eq(processoAutos.id, input.autoId));

        // Marcar autosDisponiveis = true no processo se ainda não estiver
        if (!processo.autosDisponiveis) {
          await db.update(processosTable)
            .set({ autosDisponiveis: true })
            .where(eq(processosTable.id, input.processoId));
        }

        console.log(`[Autos] Anexo ${auto.attachmentId} salvo no S3: ${url}`);
        return { url, cached: false };
      }),

    // ─── Listar processos com autos ─────────────────────────────────────────────
    listarProcessosComAutos: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { processos: processosTable, processoAutos: processoAutosTable, clientes: clientesTable, users: usersTable } = await import("../drizzle/schema");
      const { isNotNull, count, eq, sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Buscar processos com autos solicitados + join com clientes
      const processosComAutos = await db
        .select({
          id: processosTable.id,
          cnj: processosTable.cnj,
          clienteNome: clientesTable.nome,
          advogadoId: processosTable.advogadoId,
          autosDisponiveis: processosTable.autosDisponiveis,
          autosSolicitadoEm: processosTable.autosSolicitadoEm,
          autosDisponivelEm: processosTable.autosDisponivelEm,
        })
        .from(processosTable)
        .leftJoin(clientesTable, eq(processosTable.clienteId, clientesTable.id))
        .where(isNotNull(processosTable.autosSolicitadoEm))
        .orderBy(sql`${processosTable.autosSolicitadoEm} DESC`);
      // Contar documentos e pendentes por processo (2 counts por processo em paralelo)
      const resultado = await Promise.all(
        processosComAutos.map(async (p) => {
          const { isNull, or } = await import("drizzle-orm");
          const [countResult] = await db
            .select({ total: count() })
            .from(processoAutosTable)
            .where(eq(processoAutosTable.processoId, p.id));
          const { and: andOp, or: orOp, isNull: isNullOp } = await import("drizzle-orm");
          const [pendentesResult] = await db
            .select({ total: count() })
            .from(processoAutosTable)
            .where(andOp(
              eq(processoAutosTable.processoId, p.id),
              orOp(
                eq(processoAutosTable.statusAnexo, "pending"),
                andOp(
                  eq(processoAutosTable.statusAnexo, "done"),
                  isNullOp(processoAutosTable.urlS3),
                  isNullOp(processoAutosTable.downloadErro)
                )
              )
            ));
          return { ...p, totalDocumentos: countResult?.total ?? 0, totalPendentes: pendentesResult?.total ?? 0 };
        })
      );
      // Buscar nomes dos advogados (users com advogadoId)
      const advogadosMap = new Map<number, string>();
      const advIds = Array.from(new Set(resultado.map(p => p.advogadoId).filter((id): id is number => id !== null && id !== undefined)));
      if (advIds.length > 0) {
        const advs = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
        for (const a of advs) advogadosMap.set(a.id, a.name ?? "");
      }
      const totalSolicitados = resultado.length;
      const totalComAutos = resultado.filter(p => p.autosDisponiveis).length;
      const totalDocumentos = resultado.reduce((acc, p) => acc + p.totalDocumentos, 0);
      const custoTotal = totalSolicitados * 3.5;
      return {
        processos: resultado.map(p => ({
          id: p.id,
          cnj: p.cnj,
          nomeCliente: p.clienteNome,
          advogadoNome: p.advogadoId ? (advogadosMap.get(p.advogadoId) ?? null) : null,
          autosDisponiveis: p.autosDisponiveis,
          autosSolicitadoEm: p.autosSolicitadoEm,
          autosDisponivelEm: p.autosDisponivelEm,
          totalDocumentos: p.totalDocumentos,
          totalPendentes: p.totalPendentes,
        })),
        metricas: { totalSolicitados, totalComAutos, totalDocumentos, custoTotal },
      };
    }),
    // ─── Iniciar Download de Autos Individual ───────────────────────────────────────
    iniciarDownloadAutos: protectedProcedure
      .input(z.object({ processoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { getDb } = await import("./db");
        const { processos: processosTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, input.processoId));
        if (!processo) throw new TRPCError({ code: "NOT_FOUND", message: "Processo não encontrado" });
        if (processo.autosDisponiveis) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Autos já disponíveis para este processo" });
        }
        const requestId = await criarRequisicaoJudit(processo.cnj, processo.id, true);
        await insertJuditConsultaLog({
          processoCnj: processo.cnj,
          requestId,
          tipo: "download_autos",
          custo: "3.50",
          status: "sucesso",
          aprovadoPorId: ctx.user.id,
          isDuplicata: false,
        });
        await marcarAutosSolicitado(processo.id);
        console.log(`[Autos] Download individual iniciado para CNJ ${processo.cnj} — requestId: ${requestId}`);
        return { requestId, cnj: processo.cnj };
      }),
    // ─── Verificar Resultado e Processar Autos ────────────────────────────────────────
    verificarResultadoAutos: protectedProcedure
      .input(z.object({
        requestId: z.string(),
        processoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { storagePut } = await import("./storage");
        const { downloadAnexoJudit } = await import("./judit");
        const JUDIT_API_KEY = process.env.JUDIT_API_KEY ?? "";
        const resp = await fetch(`https://requests.prod.judit.io/responses?request_id=${encodeURIComponent(input.requestId)}`, {
          headers: { "api-key": JUDIT_API_KEY, "Content-Type": "application/json" },
        });
        if (!resp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Judit retornou HTTP ${resp.status}` });
        const json = await resp.json() as Record<string, unknown>;
        const requestStatus = (json.request_status as string) ?? "processing";
        if (requestStatus !== "completed") {
          return { status: "processing" as const, baixados: 0, erros: 0 };
        }
        const pageData = (json.page_data as Record<string, unknown>[]) ?? [];
        const lawsuitEntry = pageData.find(e => e.response_type === "lawsuit");
        if (!lawsuitEntry) return { status: "no_attachments" as const, baixados: 0, erros: 0, pendentes: 0, totalRaw: 0 };
        const rd = (lawsuitEntry.response_data as Record<string, unknown>) ?? {};
        const rawAttachments = (rd.attachments as Record<string, unknown>[]) ?? [];
        // Filtro: apenas attachment_id não-vazio (sem filtro de tamanho)
        const allValid = rawAttachments.filter(a => {
          const id = String(a.attachment_id ?? "").trim();
          return id !== "" && id !== "null" && id !== "undefined";
        });
        if (allValid.length === 0) {
          return { status: "no_valid_attachments" as const, baixados: 0, erros: 0, pendentes: 0, totalRaw: rawAttachments.length };
        }
        // Tentar download para TODOS os attachments válidos (independente do status)
        // Tribunais com IDs longos (TJBA, TJSP etc.) funcionam mesmo com status=pending
        const { getDb } = await import("./db");
        const { processos: processosTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, input.processoId));
        if (!processo) throw new TRPCError({ code: "NOT_FOUND" });
        const existentes = await listProcessoAutos(input.processoId);
        const existentesIds = new Set(existentes.map(a => String(a.attachmentId)));
        let baixados = 0;
        let erros = 0;
        let metadadosSalvos = 0;
        const instancia = 1;
        // Processar TODOS os attachments — tentar download independente do status
        for (const att of allValid) {
          const attachmentId = String(att.attachment_id ?? "");
          if (existentesIds.has(attachmentId)) continue;
          const nome = String(att.attachment_name ?? `doc_${attachmentId}`).trim().toUpperCase();
          const ext = String(att.extension ?? "pdf").toLowerCase();
          const dataDoc = att.attachment_date ? new Date(att.attachment_date as string) : undefined;
          const corrompido = Boolean(att.corrupted ?? false);
          try {
            const result = await downloadAnexoJudit(processo.cnj, instancia, attachmentId);
            if (!result || result.buffer.length < 100) {
              await insertProcessoAuto({ processoId: input.processoId, attachmentId, nomeArquivo: nome, extensao: ext, urlS3: null, fileKey: null, downloadErro: "Resposta vazia ou muito pequena", dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
              erros++; continue;
            }
            const fileKey = `autos/${processo.cnj.replace(/[^\w]/g, "_")}/${attachmentId}.${ext}`;
            const { url } = await storagePut(fileKey, result.buffer, result.contentType);
            await insertProcessoAuto({ processoId: input.processoId, attachmentId, nomeArquivo: nome, extensao: ext, tamanhoBytes: result.buffer.length, urlS3: url, fileKey, dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
            baixados++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const erroMsg = msg.includes("404") ? "404 - endpoint não disponível para este tribunal" : msg.substring(0, 200);
            console.error(`[Autos] Erro ao baixar anexo ${attachmentId}:`, msg);
            if (!existentesIds.has(attachmentId)) {
              await insertProcessoAuto({ processoId: input.processoId, attachmentId, nomeArquivo: nome, extensao: ext, urlS3: null, fileKey: null, downloadErro: erroMsg, dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
            }
            erros++;
          }
        }
        if (baixados > 0) await marcarAutosDisponiveis(input.processoId);
        console.log(`[Autos] CNJ ${processo.cnj}: ${baixados} baixados, ${erros} erros (todos tentados independente do status)`);
        return { status: "done" as const, baixados, erros, pendentes: 0, totalRaw: rawAttachments.length, totalValidos: allValid.length, totalDone: baixados, totalPending: erros };
      }),
    // ─── Processar Pendentes (Fluxo 2) ───────────────────────────────────────────────
    processarAutosPendentes: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { processos: processosTable, juditRequests: juditRequestsTable } = await import("../drizzle/schema");
      const { isNotNull, eq, and } = await import("drizzle-orm");
      const { storagePut } = await import("./storage");
      const { downloadAnexoJudit } = await import("./judit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const JUDIT_API_KEY = process.env.JUDIT_API_KEY ?? "";
      const pendentes = await db
        .select()
        .from(processosTable)
        .where(and(
          isNotNull(processosTable.autosSolicitadoEm),
          eq(processosTable.autosDisponiveis, false),
        ));
      let processados = 0;
      let aguardando = 0;
      let erros = 0;
      const detalhes: { cnj: string; status: string; baixados?: number }[] = [];
      for (const processo of pendentes) {
        const [req] = await db
          .select()
          .from(juditRequestsTable)
          .where(and(
            eq(juditRequestsTable.cnj, processo.cnj),
            eq(juditRequestsTable.status, "completed"),
          ))
          .orderBy(juditRequestsTable.createdAt)
          .limit(1);
        if (!req) { aguardando++; detalhes.push({ cnj: processo.cnj, status: "sem_request_completed" }); continue; }
        try {
          const resp = await fetch(`https://requests.prod.judit.io/responses?request_id=${encodeURIComponent(req.requestId)}`, {
            headers: { "api-key": JUDIT_API_KEY, "Content-Type": "application/json" },
          });
          if (!resp.ok) { aguardando++; detalhes.push({ cnj: processo.cnj, status: `http_${resp.status}` }); continue; }
          const json = await resp.json() as Record<string, unknown>;
          if ((json.request_status as string) !== "completed") {
            aguardando++; detalhes.push({ cnj: processo.cnj, status: "processing" }); continue;
          }
          const pageData = (json.page_data as Record<string, unknown>[]) ?? [];
          const lawsuitEntry = pageData.find(e => e.response_type === "lawsuit");
          if (!lawsuitEntry) { aguardando++; detalhes.push({ cnj: processo.cnj, status: "no_lawsuit_entry" }); continue; }
          const rd = (lawsuitEntry.response_data as Record<string, unknown>) ?? {};
          const rawAttachments = (rd.attachments as Record<string, unknown>[]) ?? [];
          const allValid = rawAttachments.filter(a => { const id = String(a.attachment_id ?? "").trim(); return id !== "" && id !== "null" && id !== "undefined"; });
          if (allValid.length === 0) { aguardando++; detalhes.push({ cnj: processo.cnj, status: "no_valid_attachments", baixados: 0 }); continue; }
          const doneAtts2 = allValid.filter(a => String(a.status ?? "") === "done");
          const pendingAtts2 = allValid.filter(a => String(a.status ?? "") !== "done");
          const existentes = await listProcessoAutos(processo.id);
          const existentesIds = new Set(existentes.map(a => String(a.attachmentId)));
          let baixados = 0;
          let metadadosSalvos2 = 0;
          const instancia = 1;
          for (const att of doneAtts2) {
            const attachmentId = String(att.attachment_id ?? "");
            if (existentesIds.has(attachmentId)) continue;
            const nome = String(att.attachment_name ?? `doc_${attachmentId}`).trim().toUpperCase();
            const ext = String(att.extension ?? "pdf").toLowerCase();
            const dataDoc = att.attachment_date ? new Date(att.attachment_date as string) : undefined;
            const corrompido = Boolean(att.corrupted ?? false);
            try {
              const result = await downloadAnexoJudit(processo.cnj, instancia, attachmentId);
              if (!result || result.buffer.length < 100) {
                await insertProcessoAuto({ processoId: processo.id, attachmentId, nomeArquivo: nome, extensao: ext, urlS3: null, fileKey: null, downloadErro: "Resposta vazia", dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
                continue;
              }
              const fileKey = `autos/${processo.cnj.replace(/[^\w]/g, "_")}/${attachmentId}.${ext}`;
              const { url } = await storagePut(fileKey, result.buffer, result.contentType);
              await insertProcessoAuto({ processoId: processo.id, attachmentId, nomeArquivo: nome, extensao: ext, tamanhoBytes: result.buffer.length, urlS3: url, fileKey, dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
              baixados++;
            } catch (err2: unknown) {
              const msg2 = err2 instanceof Error ? err2.message : String(err2);
              const erroMsg2 = msg2.includes("404") ? "404 - endpoint não disponível para este tribunal" : msg2.substring(0, 200);
              if (!existentesIds.has(attachmentId)) await insertProcessoAuto({ processoId: processo.id, attachmentId, nomeArquivo: nome, extensao: ext, urlS3: null, fileKey: null, downloadErro: erroMsg2, dataDocumento: dataDoc, statusAnexo: "done", instancia, corrompido });
            }
          }
          for (const att of pendingAtts2) {
            const attachmentId = String(att.attachment_id ?? "");
            if (existentesIds.has(attachmentId)) continue;
            const nome = String(att.attachment_name ?? `doc_${attachmentId}`).trim().toUpperCase();
            const ext = String(att.extension ?? "pdf").toLowerCase();
            const dataDoc = att.attachment_date ? new Date(att.attachment_date as string) : undefined;
            const corrompido = Boolean(att.corrupted ?? false);
            await insertProcessoAuto({ processoId: processo.id, attachmentId, nomeArquivo: nome, extensao: ext, urlS3: null, fileKey: null, downloadErro: null, dataDocumento: dataDoc, statusAnexo: String(att.status ?? "pending"), instancia, corrompido });
            metadadosSalvos2++;
          }
          if (baixados > 0) { await marcarAutosDisponiveis(processo.id); processados++; detalhes.push({ cnj: processo.cnj, status: "processado", baixados }); }
          else if (metadadosSalvos2 > 0) { aguardando++; detalhes.push({ cnj: processo.cnj, status: `${metadadosSalvos2}_pending_salvos`, baixados: 0 }); }
          else { aguardando++; detalhes.push({ cnj: processo.cnj, status: "sem_downloads", baixados: 0 }); }
        } catch (err) {
          erros++; detalhes.push({ cnj: processo.cnj, status: "erro" });
          console.error(`[Autos] Erro ao processar pendente CNJ ${processo.cnj}:`, err);
        }
      }
      return { processados, aguardando, erros, total: pendentes.length, detalhes };
    }),
    // ─── Verificar Attachments Pending de um Processo ─────────────────────────────
    verificarAutosPendentes: protectedProcedure
      .input(z.object({ processoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { storagePut } = await import("./storage");
        const { downloadAnexoJudit } = await import("./judit");
        const { getDb } = await import("./db");
        const { processos: processosTable, processoAutos: processoAutosTable } = await import("../drizzle/schema");
        const { eq, and, or, isNull } = await import("drizzle-orm");
        const JUDIT_API_KEY = process.env.JUDIT_API_KEY ?? "";
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Buscar processo
        const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, input.processoId));
        if (!processo) throw new TRPCError({ code: "NOT_FOUND" });
        // Buscar attachments pending do processo no banco
        const pendingRows = await db
          .select()
          .from(processoAutosTable)
          .where(and(
            eq(processoAutosTable.processoId, input.processoId),
            or(
              eq(processoAutosTable.statusAnexo, "pending"),
              and(eq(processoAutosTable.statusAnexo, "done"), isNull(processoAutosTable.urlS3)),
            ),
          ));
        if (pendingRows.length === 0) {
          return { atualizados: 0, aindaPending: 0, erros: 0, mensagem: "Nenhum documento pendente encontrado." };
        }
        // Buscar request_id mais recente completed para este CNJ
        const { juditRequests: juditRequestsTable } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");
        const [req] = await db
          .select()
          .from(juditRequestsTable)
          .where(and(eq(juditRequestsTable.cnj, processo.cnj), eq(juditRequestsTable.status, "completed")))
          .orderBy(desc(juditRequestsTable.createdAt))
          .limit(1);
        if (!req) return { atualizados: 0, aindaPending: pendingRows.length, erros: 0, mensagem: "Nenhuma requisição completada encontrada para este processo." };
        // Buscar payload atualizado da Judit
        const resp = await fetch(`https://requests.prod.judit.io/responses?request_id=${encodeURIComponent(req.requestId)}`, {
          headers: { "api-key": JUDIT_API_KEY, "Content-Type": "application/json" },
        });
        if (!resp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Judit retornou HTTP ${resp.status}` });
        const json = await resp.json() as Record<string, unknown>;
        const pageData = (json.page_data as Record<string, unknown>[]) ?? [];
        const lawsuitEntry = pageData.find(e => e.response_type === "lawsuit");
        if (!lawsuitEntry) return { atualizados: 0, aindaPending: pendingRows.length, erros: 0, mensagem: "Entrada lawsuit não encontrada no payload." };
        const rd = (lawsuitEntry.response_data as Record<string, unknown>) ?? {};
        const rawAttachments = (rd.attachments as Record<string, unknown>[]) ?? [];
        // Criar mapa de attachment_id → status atual na Judit
        const juditStatusMap = new Map<string, Record<string, unknown>>();
        for (const a of rawAttachments) {
          const id = String(a.attachment_id ?? "").trim();
          if (id) juditStatusMap.set(id, a as Record<string, unknown>);
        }
        let atualizados = 0;
        let aindaPending = 0;
        let erros = 0;
        const instancia = 1;
        for (const row of pendingRows) {
          const juditAtt = juditStatusMap.get(String(row.attachmentId));
          if (!juditAtt) { aindaPending++; continue; }
          // Tentar download independente do status (IDs longos funcionam mesmo com pending)
          // Status mudou para done — tentar download
          const ext = String(juditAtt.extension ?? row.extensao ?? "pdf").toLowerCase();
          const corrompido = Boolean(juditAtt.corrupted ?? false);
          try {
            const result = await downloadAnexoJudit(processo.cnj, instancia, String(row.attachmentId));
            if (!result || result.buffer.length < 100) {
              await db.update(processoAutosTable)
                .set({ statusAnexo: "done", downloadErro: "Resposta vazia ou muito pequena", corrompido })
                .where(eq(processoAutosTable.id, row.id));
              erros++; continue;
            }
            const fileKey = `autos/${processo.cnj.replace(/[^\w]/g, "_")}/${row.attachmentId}.${ext}`;
            const { url } = await storagePut(fileKey, result.buffer, result.contentType);
            await db.update(processoAutosTable)
              .set({ statusAnexo: "done", urlS3: url, fileKey, tamanhoBytes: result.buffer.length, downloadErro: null, corrompido })
              .where(eq(processoAutosTable.id, row.id));
            atualizados++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const erroMsg = msg.includes("404") ? "404 - endpoint não disponível para este tribunal" : msg.substring(0, 200);
            await db.update(processoAutosTable)
              .set({ statusAnexo: "done", downloadErro: erroMsg, corrompido })
              .where(eq(processoAutosTable.id, row.id));
            erros++;
          }
        }
        if (atualizados > 0) await marcarAutosDisponiveis(input.processoId);
        const mensagem = atualizados > 0
          ? `${atualizados} novo${atualizados !== 1 ? "s" : ""} documento${atualizados !== 1 ? "s" : ""} disponível${atualizados !== 1 ? "is" : ""}.`
          : aindaPending > 0
            ? `Documentos ainda sendo processados pela Judit (${aindaPending} pendente${aindaPending !== 1 ? "s" : ""}).`
            : "Nenhuma atualização disponível.";
        console.log(`[Autos] verificarAutosPendentes CNJ ${processo.cnj}: ${atualizados} atualizados, ${aindaPending} ainda pending, ${erros} erros`);
        return { atualizados, aindaPending, erros, mensagem };
      }),
    verificarTodosAutosPendentes: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const { storagePut } = await import("./storage");
        const { downloadAnexoJudit } = await import("./judit");
        const { getDb } = await import("./db");
        const { processos: processosTable, processoAutos: processoAutosTable } = await import("../drizzle/schema");
        const { eq, and, or, isNull, isNotNull } = await import("drizzle-orm");
        const JUDIT_API_KEY = process.env.JUDIT_API_KEY ?? "";
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Buscar todos os processos que têm attachments pending no banco
        const pendingRows = await db
          .select()
          .from(processoAutosTable)
          .where(and(
            or(
              eq(processoAutosTable.statusAnexo, "pending"),
              and(eq(processoAutosTable.statusAnexo, "done"), isNull(processoAutosTable.urlS3))
            ),
            isNotNull(processoAutosTable.attachmentId)
          ));
        if (pendingRows.length === 0) return { atualizados: 0, pendentes: 0 };
        // Agrupar por processoId
        const byProcesso = new Map<number, typeof pendingRows>();
        for (const row of pendingRows) {
          if (!byProcesso.has(row.processoId)) byProcesso.set(row.processoId, []);
          byProcesso.get(row.processoId)!.push(row);
        }
        let totalAtualizados = 0;
        let totalPendentes = 0;
        for (const [processoId, rows] of Array.from(byProcesso.entries())) {
          const [processo] = await db.select().from(processosTable).where(eq(processosTable.id, processoId));
          if (!processo) continue;
          // Buscar resultado atual na Judit via judit_requests completed
          const { juditRequests } = await import("../drizzle/schema");
          const juditReqs = await db
            .select()
            .from(juditRequests)
            .where(and(eq(juditRequests.cnj, processo.cnj), eq(juditRequests.status, "completed")))
            .orderBy(juditRequests.createdAt)
            .limit(1);
          if (!juditReqs.length) { totalPendentes += rows.length; continue; }
          const requestId = juditReqs[0].requestId;
          let pageData: any[] = [];
          try {
            const resp = await fetch(`https://requests.prod.judit.io/responses?request_id=${requestId}`, {
              headers: { "api-key": JUDIT_API_KEY }
            });
            const json = await resp.json() as any;
            pageData = json.page_data ?? [];
          } catch { totalPendentes += rows.length; continue; }
          const lawsuitEntry = pageData.find((e: any) => e.response_type === "lawsuit");
          if (!lawsuitEntry) { totalPendentes += rows.length; continue; }
          const juditAtts: any[] = (lawsuitEntry.response_data?.attachments ?? lawsuitEntry.attachments ?? []);
          const juditMap = new Map<string, any>();
          for (const a of juditAtts) { if (a.attachment_id) juditMap.set(String(a.attachment_id), a); }
          for (const row of rows) {
            if (!row.attachmentId) { totalPendentes++; continue; }
            const juditAtt = juditMap.get(row.attachmentId);
            // Tentar download independente do status (IDs longos funcionam mesmo com pending)
            if (!juditAtt) { totalPendentes++; continue; }
            try {
              const dlResult = await downloadAnexoJudit(processo.cnj, row.instancia ?? 1, row.attachmentId);
              if (!dlResult || dlResult.buffer.length < 100) { totalPendentes++; continue; }
              const ext = row.extensao ?? "pdf";
              const fileKey = `processo-autos/${processoId}/${row.attachmentId}-${Date.now()}.${ext}`;
              const { url: urlS3 } = await storagePut(fileKey, dlResult.buffer, dlResult.contentType || `application/${ext}`);
              await db.update(processoAutosTable)
                .set({ urlS3, fileKey, tamanhoBytes: dlResult.buffer.length, statusAnexo: "done" })
                .where(eq(processoAutosTable.id, row.id));
              totalAtualizados++;
            } catch { totalPendentes++; }
          }
        }
        if (totalAtualizados > 0) {
          // Atualizar autosDisponiveis para processos que agora têm docs disponíveis
          for (const processoId of Array.from(byProcesso.keys())) {
            const docs = await db.select().from(processoAutosTable)
              .where(and(eq(processoAutosTable.processoId, processoId), isNotNull(processoAutosTable.urlS3)));
            if (docs.length > 0) await marcarAutosDisponiveis(processoId);
          }
        }
        console.log(`[Autos] verificarTodosAutosPendentes: ${totalAtualizados} atualizados, ${totalPendentes} ainda pending`);
        if (totalAtualizados > 0) {
          try {
            const { notifyOwner } = await import("./_core/notification");
            const processosAtualizados = byProcesso.size;
            await notifyOwner({
              title: `✅ ${totalAtualizados} novos documentos disponíveis`,
              content: `${totalAtualizados} novo${totalAtualizados !== 1 ? "s" : ""} documento${totalAtualizados !== 1 ? "s" : ""} disponível${totalAtualizados !== 1 ? "is" : ""} em ${processosAtualizados} processo${processosAtualizados !== 1 ? "s" : ""}. Acesse a aba Autos para visualizar.`,
            });
          } catch (notifErr) {
            console.error("[Autos] Falha ao enviar notificação:", notifErr);
          }
        }
        return { atualizados: totalAtualizados, pendentes: totalPendentes };
      }),

    // ─── Configurações do Sistema ────────────────────────────────────────────────────
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

    // ─── Monitoramento de Webhook ─────────────────────────────────────────────
    statusWebhook: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const { juditRequests } = await import("../drizzle/schema");
      const { desc, eq, and, gte } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Último request que foi completado (webhook processado com sucesso)
      const [ultimoCompleto] = await db
        .select({ updatedAt: juditRequests.updatedAt, cnj: juditRequests.cnj })
        .from(juditRequests)
        .where(eq(juditRequests.status, "completed"))
        .orderBy(desc(juditRequests.updatedAt))
        .limit(1);

      // Contar requests processando há mais de 2 horas (possível problema)
      const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const [{ total: totalProcessandoAntigos }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(juditRequests)
        .where(
          and(
            eq(juditRequests.status, "processing"),
            (await import("drizzle-orm")).lt(juditRequests.updatedAt, duasHorasAtras)
          )
        );

      // Contar requests das últimas 24h
      const ontemAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [{ total: totalUltimas24h }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(juditRequests)
        .where(gte(juditRequests.updatedAt, ontemAtras));

      // Contar requests completados nas últimas 24h
      const [{ total: completadosUltimas24h }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(juditRequests)
        .where(
          and(
            eq(juditRequests.status, "completed"),
            gte(juditRequests.updatedAt, ontemAtras)
          )
        );

      const agora = new Date();
      const ultimoWebhookEm = ultimoCompleto?.updatedAt ?? null;
      const horasDesdeUltimoWebhook = ultimoWebhookEm
        ? (agora.getTime() - new Date(ultimoWebhookEm).getTime()) / (1000 * 60 * 60)
        : null;

      return {
        ultimoWebhookEm,
        horasDesdeUltimoWebhook,
        ultimoCnj: ultimoCompleto?.cnj ?? null,
        totalProcessandoAntigos: Number(totalProcessandoAntigos),
        totalUltimas24h: Number(totalUltimas24h),
        completadosUltimas24h: Number(completadosUltimas24h),
        alerta: horasDesdeUltimoWebhook !== null && horasDesdeUltimoWebhook > 24,
        alertaMensagem: horasDesdeUltimoWebhook !== null && horasDesdeUltimoWebhook > 24
          ? `Nenhum webhook recebido há ${Math.round(horasDesdeUltimoWebhook)}h — verifique se o deploy está atualizado`
          : null,
      };
    }),

    // ─── Reprocessar Autos Pendentes ─────────────────────────────────────────────
    /**
     * Busca request_ids com status "processing" no banco, consulta o resultado
     * na API Judit e salva os metadados de attachments sem criar nova requisição.
     * Útil quando o webhook chegou no site publicado mas o banco local ficou desatualizado.
     */
    reprocessarAutosJudit: protectedProcedure
      .input(z.object({ limite: z.number().min(1).max(50).default(10) }).optional())
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const limite = input?.limite ?? 10;
        const { getDb } = await import("./db");
        const { juditRequests } = await import("../drizzle/schema");
        const { eq, isNotNull } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Buscar requests com status "processing" (webhook não chegou ou não foi processado)
        const pendentes = await db
          .select({ id: juditRequests.id, requestId: juditRequests.requestId, cnj: juditRequests.cnj })
          .from(juditRequests)
          .where(eq(juditRequests.status, "processing"))
          .limit(limite);

        if (pendentes.length === 0) {
          return { reprocessados: 0, erros: 0, detalhes: [] };
        }

        const { obterResultadoJudit } = await import("./judit");
        const { processarResultadoJuditExterno } = await import("./_core/index");

        const detalhes: Array<{ cnj: string; requestId: string; status: string; attachments: number }> = [];
        let reprocessados = 0;
        let erros = 0;

        for (const req of pendentes) {
          try {
            const resultado = await obterResultadoJudit(req.requestId);
            if (!resultado) {
              detalhes.push({ cnj: req.cnj, requestId: req.requestId, status: "sem_resultado", attachments: 0 });
              continue;
            }
            const resultadoTyped = resultado as Record<string, unknown>;
            const attachments = (resultadoTyped.attachments as unknown[]) ?? [];
            await processarResultadoJuditExterno(req.requestId, resultadoTyped);
            reprocessados++;
            detalhes.push({ cnj: req.cnj, requestId: req.requestId, status: "ok", attachments: attachments.length });
          } catch (err) {
            erros++;
            detalhes.push({ cnj: req.cnj, requestId: req.requestId, status: `erro: ${String(err).slice(0, 80)}`, attachments: 0 });
          }
        }

        return { reprocessados, erros, detalhes };
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
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        try {
          // Busca diretamente na Judit (não apenas no banco local)
          const resultado = await buscarProcessosPorCpfJudit(input.cpf);
          return resultado.processos;
        } catch (err) {
          console.error("[buscarProcessosPorCpf] Erro na Judit:", err);
          // Fallback: banco local
          return buscarProcessosPorCpfLocal(input.cpf);
        }
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
        requestKey: z.string().uuid(), // C5: OBRIGATÓRIO para idempotência
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        // C5: Idempotência — verificar se requestKey já foi processado
        // Sempre verificar, pois requestKey é obrigatório
        const resultadoExistente = await getOperacaoIdempotente(input.requestKey);
        if (resultadoExistente) {
          console.log(`[aprovarFilaJudit] requestKey ${input.requestKey} já processado — retornando resultado anterior`);
          return JSON.parse(resultadoExistente);
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
              // Se um advogado foi selecionado na importação, atualizar o vínculo do processo
              if (advogadoIdImportacao !== undefined) {
                const { getDb } = await import("./db");
                const { processos: processosTable } = await import("../drizzle/schema");
                const { eq } = await import("drizzle-orm");
                const db = await getDb();
                if (db) {
                  await db.update(processosTable)
                    .set({ advogadoId: advogadoIdImportacao })
                    .where(eq(processosTable.cnj, cnj));
                }
              }
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
        if (convite.expiradoEm && new Date() > new Date(convite.expiradoEm)) return { valido: false, motivo: "Link de convite inválido ou expirado. Solicite um novo ao administrador." };
        // Se o convite já tem usadoEm (foi completado), é inválido
        if (convite.usadoEm) return { valido: false, motivo: "Este convite já foi utilizado." };
        // Se tem usadoPor mas sem usadoEm = pré-cadastro pelo admin, ainda válido
        const preCadastrado = !!convite.usadoPor && !convite.usadoEm;
        return { valido: true, roleConvite: convite.roleConvite, token: convite.token, preCadastrado };
      }),

    // Após OAuth: vincular convite ao usuário logado
    vincularAoUsuario: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import("./db")).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { users: usersTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const convite = await getConviteByToken(input.token);
        if (!convite) throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado" });
        if (!convite.ativo) throw new TRPCError({ code: "BAD_REQUEST", message: "Convite já foi revogado" });
        if (convite.usadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Convite já utilizado" });
        if (convite.expiradoEm && new Date() > new Date(convite.expiradoEm)) throw new TRPCError({ code: "BAD_REQUEST", message: "Convite expirado" });

        // Definir extra_roles baseado no roleConvite
        const extraRoles = convite.roleConvite === "advogado_investidor"
          ? ["advogado", "investidor"]
          : [convite.roleConvite];

        // Caso 1: Convite de pré-cadastro (usadoPor já preenchido pelo admin)
        if (convite.usadoPor && !convite.usadoEm) {
          const [usuarioPreCadastrado] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, convite.usadoPor))
            .limit(1);

          if (usuarioPreCadastrado && usuarioPreCadastrado.preCadastradoPeloAdmin) {
            // Vincular o openId real ao usuário pré-cadastrado
            await db.update(usersTable)
              .set({
                openId: ctx.user.openId,
                // Manter o nome do pré-cadastro se o usuário não tiver nome no OAuth
                name: ctx.user.name || usuarioPreCadastrado.name,
                email: ctx.user.email || usuarioPreCadastrado.email,
                statusCadastro: "ativo",
                preCadastradoPeloAdmin: false,
                lastSignedIn: new Date(),
              })
              .where(eq(usersTable.id, usuarioPreCadastrado.id));

            // Marcar convite como usado
            await usarConvite(input.token, usuarioPreCadastrado.id);

            // Remover o usuário duplicado criado pelo OAuth (se houver)
            // O OAuth cria um novo usuário com o openId, mas já atualizamos o pré-cadastrado
            const [duplicado] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.openId, ctx.user.openId))
              .limit(1);

            if (duplicado && duplicado.id !== usuarioPreCadastrado.id) {
              // Deletar o duplicado criado pelo OAuth
              await db.delete(usersTable).where(eq(usersTable.id, duplicado.id));
            }

            return { ok: true, extraRoles };
          }
        }

        // Caso 2: Convite normal (sem pré-cadastro)
        await setUserExtraRoles(ctx.user.id, extraRoles, convite.id);
        await usarConvite(input.token, ctx.user.id);

        // Atualizar status para ativo
        await db.update(usersTable)
          .set({ statusCadastro: "ativo" })
          .where(eq(usersTable.id, ctx.user.id));

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

  // ─── Judit: Qualidade de Dados ─────────────────────────────────────────────────────────────
  juditQualidade: router({
    metricas: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return metricsQualidadeJudit();
    }),
    registrosProblemáticos: protectedProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(50) }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return listRegistrosProblemáticos(input.page, input.pageSize);
      }),
    creditoRestante: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return creditoRestanteEsteMs();
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
