/**
 * Integração com a API Judit (https://requests.prod.judit.io)
 * Fluxo assíncrono em 3 etapas:
 *   1. POST /requests — cria requisição por CNJ
 *   2. GET /requests/{requestId} — verifica status (processing → completed)
 *   3. GET /responses?page=1 — obtém resultado filtrado pelo requestId
 */

import {
  getJuditRequestByCnj,
  getProcessoByCnj,
  listJuditRequestsByStatus,
  listProcessosSemAtualizacaoJudit,
  updateJuditRequestStatus,
  updateProcessoStatus,
  upsertJuditRequest,
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
    () => juditFetch(`/responses?page=1`),
    3,
    `GET /responses requestId=${requestId}`
  ) as { data?: unknown[]; results?: unknown[]; items?: unknown[] };

  const items = data.data ?? data.results ?? data.items ?? [];
  if (!Array.isArray(items)) return null;

  // Filtrar pelo requestId
  const match = items.find(
    (item: unknown) =>
      typeof item === "object" &&
      item !== null &&
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

  // Extrair texto de status de campos comuns
  const candidatos: string[] = [];
  const campos = ["status", "situation", "situacao", "fase", "phase", "state", "movimento"];

  for (const campo of campos) {
    const val = payload[campo];
    if (typeof val === "string" && val.trim()) candidatos.push(val.trim());
  }

  // Tentar extrair de objetos aninhados
  const nested = payload.process ?? payload.processo ?? payload.lawsuit ?? payload.data;
  if (nested && typeof nested === "object") {
    for (const campo of campos) {
      const val = (nested as Record<string, unknown>)[campo];
      if (typeof val === "string" && val.trim()) candidatos.push(val.trim());
    }
  }

  const statusOriginal = candidatos[0] ?? "Não Informado";
  const texto = statusOriginal.toLowerCase();

  let statusResumido: StatusResumido = "em_analise_inicial";

  if (/movimento|andamento|ativo|tramit|em curso/.test(texto)) {
    statusResumido = "em_andamento";
  } else if (/senten[çc]a|concluso|julgado/.test(texto)) {
    statusResumido = "aguardando_sentenca";
  } else if (/audi[eê]ncia/.test(texto)) {
    statusResumido = "aguardando_audiencia";
  } else if (/recurso|apela[çc][aã]o|agravo|embargos/.test(texto)) {
    statusResumido = "em_recurso";
  } else if (/execu[çc][aã]o|cumprimento/.test(texto)) {
    statusResumido = "cumprimento_de_sentenca";
  } else if (/arquivado|baixado|extinto|encerrado/.test(texto)) {
    statusResumido = "arquivado_encerrado";
  } else if (/acordo|negocia[çc][aã]o|concilia[çc][aã]o/.test(texto)) {
    statusResumido = "acordo_negociacao";
  } else if (/ganho|procedente|favorav/.test(texto)) {
    statusResumido = "concluido_ganho";
  } else if (/improcedente|perdido|desfavorav/.test(texto)) {
    statusResumido = "concluido_perdido";
  } else if (/documento|pend[eê]ncia/.test(texto)) {
    statusResumido = "aguardando_documentos";
  } else if (/protocolado|distribu[ií]do|petici/.test(texto)) {
    statusResumido = "protocolado";
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

// ─── Rotina automática a cada 6 horas ─────────────────────────────────────
let cronHandle: ReturnType<typeof setInterval> | null = null;

export function iniciarRotinaCron(): void {
  if (cronHandle) return; // já iniciada

  const SEIS_HORAS = 6 * 60 * 60 * 1000;

  cronHandle = setInterval(async () => {
    console.log("[Judit] Rotina automática iniciada (cron 6h)...");
    try {
      // 1. Disparar novas requisições para processos desatualizados
      const { criadas } = await dispararAtualizacaoBackground();
      console.log(`[Judit] Cron: ${criadas} novas requisições criadas.`);

      // 2. Aguardar 2 minutos para processamento inicial
      await sleep(2 * 60 * 1000);

      // 3. Coletar resultados pendentes
      const { atualizados, erros } = await coletarResultadosPendentes();
      console.log(`[Judit] Cron concluído: ${atualizados} atualizados, ${erros} erros.`);
    } catch (error) {
      console.error("[Judit] Erro na rotina automática:", error);
    }
  }, SEIS_HORAS);

  console.log("[Judit] Rotina automática iniciada (intervalo: 6h).");
}

export function pararRotinaCron(): void {
  if (cronHandle) {
    clearInterval(cronHandle);
    cronHandle = null;
    console.log("[Judit] Rotina automática parada.");
  }
}
