import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { STATUS_RESUMIDO, StatusResumido } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
} from "./db";
import { processarPlanilha } from "./importacao";
import { importarPlanilhaSimples, conciliarComJuditBackground } from "./importacaoSimples";
import {
  atualizarProcesso,
  buscarESalvarProcessoJudit,
  buscarMovimentacoesJudit,
  coletarResultadosPendentes,
  criarRequisicaoJudit,
  dispararAtualizacaoBackground,
  iniciarAnaliseIA,
  verificarAnaliseIA,
} from "./judit";
import { updateAiSummary, updateValorObtido, getImportJob, listImportJobs } from "./db";
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
            const ids = processosCliente.map(p => p.id);
            dispararAtualizacaoBackground(ids).catch(err =>
              console.error("[Judit] Erro ao disparar atualização por CPF:", err)
            );
            atualizacaoInfo = `Disparando atualização para ${ids.length} processo(s) via Judit em background.`;
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

      // Executa em background
      ;(async () => {
        try {
          const { criadas, erros } = await dispararAtualizacaoBackground(ids);
          console.log(`[Judit] Background: ${criadas} requisições criadas, ${erros} erros.`);
        } catch (err) {
          console.error("[Judit] Erro no background:", err);
        }
      })();

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
        const { steps, fromCache, requestId } = await buscarMovimentacoesJudit(input.cnj);
        return { steps, fromCache, requestId, total: steps.length };
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
  }),
});

export type AppRouter = typeof appRouter;
