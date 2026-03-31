/**
 * Integração com a API Judit (https://requests.prod.judit.io)
 * Fluxo assíncrono em 3 etapas:
 *   1. POST /requests — cria requisição por CNJ
 *   2. GET /requests/{requestId} — verifica status (processing → completed)
 *   3. GET /responses?page=1 — obtém resultado filtrado pelo requestId
 */

import {
  extrairNomeClienteDoPayload,
  getJuditRequestByCnj,
  getProcessoByCnj,
  listAllJuditRequestsByCnj,
  listJuditRequestsByStatus,
  listProcessosSemAtualizacaoJudit,
  updateJuditRequestStatus,
  updateProcessoStatus,
  upsertCliente,
  upsertJuditRequest,
  upsertProcessoFromJudit,
  vincularClienteAoProcesso,
} from "./db";
import { StatusResumido } from "../drizzle/schema";

// ─── Configuração ──────────────────────────────────────────────────────────
const JUDIT_BASE_URL = process.env.JUDIT_BASE_URL ?? "https://requests.prod.judit.io";
const JUDIT_API_KEY = process.env.JUDIT_API_KEY ?? "";
const CACHE_TTL_DAYS = 7;
const BATCH_SIZE = 100;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 5_000;

// ─── Retry com backoff exponencial ────────────────────────────────────────
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  label = "judit"
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.warn(`[Judit] ${label} — tentativa ${attempt + 1} falhou, aguardando ${Math.round(waitMs)}ms...`);
      await sleep(waitMs);
    }
  }
  throw new Error(`[Judit] ${label} — todas as tentativas esgotadas`);
}

// ─── Requisição HTTP base ──────────────────────────────────────────────────
async function juditFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  if (!JUDIT_API_KEY) throw new Error("[Judit] JUDIT_API_KEY não configurada");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${JUDIT_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "api-key": JUDIT_API_KEY,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`[Judit] HTTP ${res.status}: ${body}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Etapa 1: Criar requisição por CNJ ────────────────────────────────────
export async function criarRequisicaoJudit(cnj: string, processoId?: number): Promise<string> {
  // Verificar cache: não consultar o mesmo CNJ em menos de 7 dias
  const existing = await getJuditRequestByCnj(cnj);
  if (existing) {
    const diasDesde = (Date.now() - existing.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diasDesde < CACHE_TTL_DAYS && existing.status !== "error") {
      console.log(`[Judit] CNJ ${cnj} já possui requisição recente (${Math.round(diasDesde)}d). Reutilizando requestId: ${existing.requestId}`);
      return existing.requestId;
    }
  }

  const data = await retryWithBackoff(
    () =>
      juditFetch("/requests", {
        method: "POST",
        body: JSON.stringify({
          search: {
            search_type: "lawsuit_cnj",
            search_key: cnj,
          },
          cache_ttl_in_days: CACHE_TTL_DAYS,
        }),
      }),
    3,
    `POST /requests CNJ=${cnj}`
  ) as { request_id?: string; id?: string };

  const requestId = data.request_id ?? data.id;
  if (!requestId) throw new Error(`[Judit] Resposta sem requestId para CNJ ${cnj}: ${JSON.stringify(data)}`);

  await upsertJuditRequest({
    cnj,
    requestId,
    status: "processing",
    processoId: processoId ?? null,
  });

  console.log(`[Judit] Requisição criada: requestId=${requestId} CNJ=${cnj}`);
  return requestId;
}

// ─── Etapa 2: Verificar status da requisição ──────────────────────────────
export async function verificarStatusRequisicao(requestId: string): Promise<"processing" | "completed" | "error"> {
  const data = await retryWithBackoff(
    () => juditFetch(`/requests/${requestId}`),
    3,
    `GET /requests/${requestId}`
  ) as { status?: string; state?: string };

  const status = (data.status ?? data.state ?? "processing").toLowerCase();

  if (status === "completed" || status === "done" || status === "success") return "completed";
  if (status === "error" || status === "failed") return "error";
  return "processing";
}

// ─── Etapa 3: Obter resultado ──────────────────────────────────────────────
export async function obterResultadoJudit(requestId: string): Promise<unknown | null> {
  const data = await retryWithBackoff(
    () => juditFetch(`/responses?request_id=${requestId}`),
    3,
    `GET /responses?request_id=${requestId}`
  ) as {
    page_data?: Array<{ response_data?: unknown; parties?: unknown[]; steps?: unknown[]; attachments?: unknown[] }>;
    data?: unknown[];
    results?: unknown[];
    items?: unknown[];
  };

  // Formato principal da Judit: { page_data: [{ response_data }] }
  // response_data já contém parties, steps, attachments dentro dele
  if (data.page_data && Array.isArray(data.page_data) && data.page_data.length > 0) {
    const entry = data.page_data[0];
    const rd = entry.response_data as Record<string, unknown> ?? {};
    // steps, parties e attachments estão DENTRO do response_data
    // entry.parties/steps/attachments são campos do envelope, não do processo
    return {
      ...rd,
      // Garantir que steps do response_data seja preservado (não sobrescrever com [])
      steps: (rd.steps as unknown[]) ?? (entry.steps as unknown[]) ?? [],
      parties: (rd.parties as unknown[]) ?? (entry.parties as unknown[]) ?? [],
      attachments: (rd.attachments as unknown[]) ?? (entry.attachments as unknown[]) ?? [],
    };
  }

  // Fallback: formatos alternativos
  const items = data.data ?? data.results ?? data.items ?? [];
  if (!Array.isArray(items)) return null;
  const match = items.find(
    (item: unknown) =>
      typeof item === "object" && item !== null &&
      (
        (item as Record<string, unknown>).request_id === requestId ||
        (item as Record<string, unknown>).requestId === requestId
      )
  );
  return match ?? null;
}

// ─── Mapeamento de status ──────────────────────────────────────────────────
export function mapearStatusJudit(data: unknown): { statusResumido: StatusResumido; statusOriginal: string } {
  const payload = data as Record<string, unknown>;

  // Campos do objeto Lawsuit da Judit — prioridade: situation > status > phase > state
  const candidatos: string[] = [];
  const camposPrioridade = ["situation", "status", "phase", "state", "situacao", "fase", "movimento"];

  for (const campo of camposPrioridade) {
    const val = payload[campo];
    if (typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "null") {
      candidatos.push(val.trim());
    }
  }

  // Tentar extrair de objetos aninhados (response_data, process, lawsuit)
  const nested = payload.response_data ?? payload.process ?? payload.processo ?? payload.lawsuit ?? payload.data;
  if (nested && typeof nested === "object") {
    for (const campo of camposPrioridade) {
      const val = (nested as Record<string, unknown>)[campo];
      if (typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "null") {
        candidatos.push(val.trim());
      }
    }
  }

  const statusOriginal = candidatos[0] ?? "Não Informado";
  const texto = statusOriginal.toLowerCase();

  // Extrair também phase/fase para combinações (ex: status=Finalizado + phase=Arquivado)
  const phaseVal = (
    (typeof payload.phase === "string" ? payload.phase : "") ||
    (nested && typeof (nested as Record<string, unknown>).phase === "string" ? (nested as Record<string, unknown>).phase as string : "")
  ).toLowerCase();
  const statusVal = (
    (typeof payload.status === "string" ? payload.status : "") ||
    (nested && typeof (nested as Record<string, unknown>).status === "string" ? (nested as Record<string, unknown>).status as string : "")
  ).toLowerCase();

  let statusResumido: StatusResumido = "em_analise_inicial";

  // Mapeamento baseado nos valores reais retornados pela Judit
  // Prioridade: verificar combinações de status+phase antes de avaliar individualmente
  const textoCompleto = `${texto} ${phaseVal} ${statusVal}`;

  if (/arquivado|extinto|encerrado|baixa definitiva|baixado/.test(textoCompleto) ||
      (statusVal === "finalizado" && /arquivado|extinto|encerrado/.test(phaseVal)) ||
      texto === "finalizado" || statusVal === "finalizado") {
    statusResumido = "arquivado_encerrado";
  } else if (/^ativo$|^ativa$|movimento|andamento|tramit|em curso|em andamento/.test(texto) ||
             /^ativo$|^ativa$/.test(statusVal)) {
    statusResumido = "em_andamento";
  } else if (/senten[\u00e7c]a|concluso|julgado|aguarda.*despacho|aguarda.*senten/.test(textoCompleto)) {
    statusResumido = "aguardando_sentenca";
  } else if (/audi[e\u00ea]ncia|pauta/.test(textoCompleto)) {
    statusResumido = "aguardando_audiencia";
  } else if (/recurso|apela[\u00e7c][\u00e3a]o|agravo|embargos|2[\u00aaa].*inst|segunda.*inst/.test(textoCompleto)) {
    statusResumido = "em_recurso";
  } else if (/execu[\u00e7c][\u00e3a]o|cumprimento/.test(textoCompleto)) {
    statusResumido = "cumprimento_de_sentenca";
  } else if (/acordo|negocia[\u00e7c][\u00e3a]o|concilia[\u00e7c][\u00e3a]o|tr[\u00e2a]nsito.*julgado/.test(textoCompleto)) {
    statusResumido = "acordo_negociacao";
  } else if (/procedente|ganho|favorav|provido/.test(textoCompleto)) {
    statusResumido = "concluido_ganho";
  } else if (/improcedente|perdido|desfavorav|n[a\u00e3]o provido/.test(textoCompleto)) {
    statusResumido = "concluido_perdido";
  } else if (/documento|pend[e\u00ea]ncia/.test(textoCompleto)) {
    statusResumido = "aguardando_documentos";
  } else if (/protocolado|distribu[i\u00ed]do|petici|inicial|cita[\u00e7c][\u00e3a]o/.test(textoCompleto)) {
    statusResumido = "protocolado";
  } else if (/suspen/.test(textoCompleto)) {
    statusResumido = "em_andamento";
  }

  return { statusResumido, statusOriginal };
}

// ─── Atualizar processo individual ────────────────────────────────────────
export async function atualizarProcesso(cnj: string): Promise<boolean> {
  try {
    const requestId = await criarRequisicaoJudit(cnj);

    // Polling até completar
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const status = await verificarStatusRequisicao(requestId);

      if (status === "completed") {
        const resultado = await obterResultadoJudit(requestId);
        if (!resultado) {
          console.warn(`[Judit] Requisição ${requestId} completada mas sem resultado.`);
          await updateJuditRequestStatus(requestId, "completed");
          return false;
        }

        const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);
        await updateProcessoStatus(cnj, statusResumido, statusOriginal, resultado, requestId);
        await updateJuditRequestStatus(requestId, "completed");
        // Extrair e vincular cliente pelo nome do payload
        await vincularClienteDoPayload(cnj, resultado);
        console.log(`[Judit] Processo ${cnj} atualizado: ${statusOriginal} → ${statusResumido}`);
        return true;
      }

      if (status === "error") {
        await updateJuditRequestStatus(requestId, "error");
        console.error(`[Judit] Requisição ${requestId} retornou erro.`);
        return false;
      }
    }

    console.warn(`[Judit] Timeout aguardando resultado para ${cnj} (requestId=${requestId})`);
    return false;
  } catch (error) {
    console.error(`[Judit] Erro ao atualizar processo ${cnj}:`, error);
    return false;
  }
}

// ─── Coletar resultados de requisições pendentes ──────────────────────────
export async function coletarResultadosPendentes(): Promise<{
  atualizados: number;
  semAlteracao: number;
  erros: number;
}> {
  const pendentes = await listJuditRequestsByStatus("processing");
  let atualizados = 0;
  let semAlteracao = 0;
  let erros = 0;

  console.log(`[Judit] Coletando resultados de ${pendentes.length} requisições pendentes...`);

  for (const req of pendentes) {
    try {
      const status = await verificarStatusRequisicao(req.requestId);

      if (status === "completed") {
        const resultado = await obterResultadoJudit(req.requestId);
        if (resultado) {
          const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);
          await updateProcessoStatus(req.cnj, statusResumido, statusOriginal, resultado, req.requestId);
          await updateJuditRequestStatus(req.requestId, "completed");
          await vincularClienteDoPayload(req.cnj, resultado);
          atualizados++;
        } else {
          await updateJuditRequestStatus(req.requestId, "completed");
          semAlteracao++;
        }
      } else if (status === "error") {
        await updateJuditRequestStatus(req.requestId, "error");
        erros++;
      } else {
        semAlteracao++; // ainda processing
      }
    } catch (error) {
      console.error(`[Judit] Erro ao coletar requestId=${req.requestId}:`, error);
      erros++;
    }
  }

  console.log(`[Judit] Coleta concluída: ${atualizados} atualizados, ${semAlteracao} sem alteração, ${erros} erros.`);
  return { atualizados, semAlteracao, erros };
}

// ─── Disparar atualização em lote (background) ────────────────────────────
export async function dispararAtualizacaoBackground(processoIds?: number[]): Promise<{
  criadas: number;
  erros: number;
}> {
  // Buscar processos sem atualização recente ou os especificados
  let lista: { id: number; cnj: string }[];

  if (processoIds && processoIds.length > 0) {
    const { getDb } = await import("./db");
    const { processos } = await import("../drizzle/schema");
    const { inArray } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { criadas: 0, erros: 0 };
    lista = await db
      .select({ id: processos.id, cnj: processos.cnj })
      .from(processos)
      .where(inArray(processos.id, processoIds));
  } else {
    const rows = await listProcessosSemAtualizacaoJudit(7);
    lista = rows.slice(0, BATCH_SIZE).map((p) => ({ id: p.id, cnj: p.cnj }));
  }

  let criadas = 0;
  let erros = 0;

  console.log(`[Judit] Disparando requisições para ${lista.length} processos...`);

  for (const { id, cnj } of lista) {
    try {
      await criarRequisicaoJudit(cnj, id);
      criadas++;
    } catch (error) {
      console.error(`[Judit] Erro ao criar requisição para CNJ ${cnj}:`, error);
      erros++;
    }
    // Pequena pausa para evitar rate limiting
    await sleep(200);
  }

  console.log(`[Judit] Background concluído: ${criadas} criadas, ${erros} erros.`);
  return { criadas, erros };
}


// ─── Buscar movimentações completas de um processo ────────────────────────
export interface JuditStep {
  step_id?: string;
  step_date?: string;
  content?: string;
  step_type?: string;
  private?: boolean;
  steps_count?: number;
  lawsuit_cnj?: string;
  lawsuit_instance?: number;
}

export async function buscarMovimentacoesJudit(cnj: string): Promise<{
  steps: JuditStep[];
  fromCache: boolean;
  requestId?: string;
}> {
  // 1. Verificar se já temos o payload com steps no banco
  const processo = await getProcessoByCnj(cnj);
  if (processo?.rawPayload) {
    let payload: Record<string, unknown>;
    try {
      payload = typeof processo.rawPayload === "string"
        ? JSON.parse(processo.rawPayload)
        : (processo.rawPayload as Record<string, unknown>);
    } catch {
      payload = {};
    }
    const steps = payload.steps as JuditStep[] | undefined;
    if (steps && steps.length > 0) {
      console.log(`[Judit] Movimentações do CNJ ${cnj} retornadas do cache (${steps.length} steps).`);
      return { steps, fromCache: true };
    }
  }

  // 2. Buscar via API Judit usando o requestId mais recente
  const requisicoes = await listAllJuditRequestsByCnj(cnj);
  const completada = requisicoes.find((r) => r.status === "completed");

  if (!completada) {
    // Criar nova requisição e aguardar
    console.log(`[Judit] Nenhuma requisição completada para ${cnj}. Criando nova...`);
    const requestId = await criarRequisicaoJudit(cnj, processo?.id);

    // Polling curto (máx 30s)
    for (let i = 0; i < 6; i++) {
      await sleep(5_000);
      const status = await verificarStatusRequisicao(requestId);
      if (status === "completed") {
        const resultado = await obterResultadoJudit(requestId);
        if (resultado) {
          const payload = resultado as Record<string, unknown>;
          const steps = (payload.steps as JuditStep[]) ?? [];
          // Salvar no banco
          if (processo) {
            const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);
            await updateProcessoStatus(cnj, statusResumido, statusOriginal, resultado, requestId);
            await updateJuditRequestStatus(requestId, "completed");
          }
          return { steps, fromCache: false, requestId };
        }
      }
      if (status === "error") break;
    }
    return { steps: [], fromCache: false, requestId };
  }

  // 3. Usar requestId existente para buscar resultado
  const resultado = await obterResultadoJudit(completada.requestId);
  if (resultado) {
    const payload = resultado as Record<string, unknown>;
    const steps = (payload.steps as JuditStep[]) ?? [];

    // Se encontrou steps, atualizar o banco
    if (steps.length > 0 && processo) {
      const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);
      await updateProcessoStatus(cnj, statusResumido, statusOriginal, resultado, completada.requestId);
    }

    return { steps, fromCache: false, requestId: completada.requestId };
  }

  return { steps: [], fromCache: false, requestId: completada.requestId };
}

// ─── Buscar na Judit e salvar no banco (cria se não existir) ─────────────────
/**
 * Consulta o CNJ na API Judit com polling e salva/atualiza o processo no banco.
 * Se o processo não existir no banco, ele é criado automaticamente.
 * Retorna { atualizado, criado, processo }.
 */
export async function buscarESalvarProcessoJudit(cnj: string): Promise<{
  atualizado: boolean;
  criado: boolean;
  processo: Awaited<ReturnType<typeof getProcessoByCnj>>;
  notFound: boolean;
}> {
  try {
    const requestId = await criarRequisicaoJudit(cnj);

    // Polling até completar
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const status = await verificarStatusRequisicao(requestId);

      if (status === "completed") {
        const resultado = await obterResultadoJudit(requestId);

        if (!resultado) {
          await updateJuditRequestStatus(requestId, "completed");
          const processo = await getProcessoByCnj(cnj);
          return { atualizado: false, criado: false, processo, notFound: true };
        }

        // Verificar se é um erro LAWSUIT_NOT_FOUND
        const r = resultado as Record<string, unknown>;
        if (r.code === 2 || (typeof r.message === "string" && r.message.includes("NOT_FOUND"))) {
          await updateJuditRequestStatus(requestId, "completed");
          const processo = await getProcessoByCnj(cnj);
          return { atualizado: false, criado: false, processo, notFound: true };
        }

        const { statusResumido, statusOriginal } = mapearStatusJudit(resultado);

        // Criar ou atualizar processo no banco
        const { criado } = await upsertProcessoFromJudit(cnj, statusResumido, statusOriginal, resultado, requestId);
        await updateJuditRequestStatus(requestId, "completed");

        // Extrair e vincular cliente
        await vincularClienteDoPayload(cnj, resultado);

        console.log(`[Judit] Processo ${cnj} ${criado ? "criado" : "atualizado"}: ${statusOriginal} → ${statusResumido}`);

        const processo = await getProcessoByCnj(cnj);
        return { atualizado: true, criado, processo, notFound: false };
      }

      if (status === "error") {
        await updateJuditRequestStatus(requestId, "error");
        const processo = await getProcessoByCnj(cnj);
        return { atualizado: false, criado: false, processo, notFound: false };
      }
    }

    // Timeout
    const processo = await getProcessoByCnj(cnj);
    return { atualizado: false, criado: false, processo, notFound: false };
  } catch (error) {
    console.error(`[Judit] Erro ao buscar/salvar processo ${cnj}:`, error);
    const processo = await getProcessoByCnj(cnj);
    return { atualizado: false, criado: false, processo, notFound: false };
  }
}

// ─── Helper: extrair e vincular cliente do payload Judit ──────────────────
async function vincularClienteDoPayload(cnj: string, payload: unknown): Promise<void> {
  try {
    const p = payload as Record<string, unknown>;
    const nomeProcesso = p.name as string | undefined;
    const nomeCliente = extrairNomeClienteDoPayload(nomeProcesso);
    if (!nomeCliente) return;
    const clienteId = await upsertCliente({ nome: nomeCliente });
    await vincularClienteAoProcesso(cnj, clienteId);
  } catch (err) {
    console.error(`[Judit] Erro ao vincular cliente para ${cnj}:`, err);
  }
}

// ─── Análise IA da Judit ──────────────────────────────────────────────────
/**
 * Cria uma requisição Judit IA e retorna o requestId imediatamente.
 * O frontend faz polling via buscarResultadoAnaliseIA.
 */
export async function iniciarAnaliseIA(cnj: string): Promise<string> {
  const data = await retryWithBackoff(
    () =>
      juditFetch("/requests", {
        method: "POST",
        body: JSON.stringify({
          search: {
            search_type: "lawsuit_cnj",
            search_key: cnj,
          },
          judit_ia: ["summary"],
        }),
      }),
    3,
    `POST /requests (IA) CNJ=${cnj}`
  ) as { request_id?: string; id?: string };

  const requestId = data.request_id ?? data.id;
  if (!requestId) throw new Error(`[Judit IA] Resposta sem requestId para CNJ ${cnj}`);
  console.log(`[Judit IA] Requisição criada: requestId=${requestId} CNJ=${cnj}`);
  return requestId;
}

/**
 * Verifica o status de uma análise IA e retorna o resumo se pronto.
 * Retorna { status: "pending" | "completed" | "error", summary?: string }
 */
export async function verificarAnaliseIA(
  requestId: string,
  cnj: string
): Promise<{ status: "pending" | "completed" | "error"; summary?: string }> {
  const reqStatus = await verificarStatusRequisicao(requestId);
  console.log(`[Judit IA] Status requestId=${requestId}: ${reqStatus}`);

  if (reqStatus === "processing") {
    return { status: "pending" };
  }

  if (reqStatus === "error") {
    return { status: "error" };
  }

  if (reqStatus === "completed") {
    const responseData = await retryWithBackoff(
      () => juditFetch(`/responses?request_id=${requestId}`),
      3,
      `GET /responses (IA) requestId=${requestId}`
    ) as { page_data?: unknown[] };

    const pageData = responseData.page_data ?? [];
    for (const entry of pageData) {
      const e = entry as Record<string, unknown>;
      if (e.response_type === "ia") {
        const summary = e.response_data as string;
        if (summary) {
          console.log(`[Judit IA] Resumo obtido para CNJ=${cnj} (${summary.length} chars)`);
          return { status: "completed", summary };
        }
      }
    }
    return { status: "error" };
  }

  return { status: "pending" };
}
