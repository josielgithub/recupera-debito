/**
 * Integração com a API Judit (https://requests.prod.judit.io)
 * Fluxo assíncrono em 3 etapas:
 *   1. POST /requests — cria requisição por CNJ
 *   2. GET /requests/{requestId} — verifica status (processing → completed)
 *   3. GET /responses?page=1 — obtém resultado filtrado pelo requestId
 */

import {
  extrairNomeClienteDoPayload,
  getConsultaRecentePorCnj,
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
// cache_ttl_in_days removido a pedido do suporte Judit (não recomendado para dados em tempo real)
const BATCH_SIZE = 100;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 5_000;

// ─── Retry com backoff exponencial ────────────────────────────────────────
export async function sleep(ms: number): Promise<void> {
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
async function juditFetch(path: string, options: RequestInit = {}, attempt = 0): Promise<unknown> {
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

    // Tratamento especial de rate limit 429 — aguardar e tentar novamente
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      const waitMs = retryAfter * 1000;
      console.warn(`[Judit] Rate limit 429 em ${path} — aguardando ${retryAfter}s antes de tentar novamente (tentativa ${attempt + 1}/3)`);
      if (attempt < 2) {
        clearTimeout(timeout);
        await sleep(waitMs);
        return juditFetch(path, options, attempt + 1);
      }
      throw new Error(`[Judit] Rate limit 429 persistente em ${path} após 3 tentativas`);
    }

    if (!res.ok) {
      // Verificar se a resposta é HTML (página de erro do servidor)
      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text().catch(() => "");
      if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
        console.error(`[Judit] HTTP ${res.status} retornou HTML em vez de JSON para ${path}. Primeiros 200 chars: ${body.slice(0, 200)}`);
        throw new Error(`[Judit] HTTP ${res.status}: resposta HTML inesperada (servidor Judit pode estar fora do ar)`);
      }
      throw new Error(`[Judit] HTTP ${res.status}: ${body}`);
    }

    // Verificar Content-Type antes de parsear JSON
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      const body = await res.text().catch(() => "");
      console.error(`[Judit] Resposta não-JSON (Content-Type: ${contentType}) para ${path}. Body: ${body.slice(0, 200)}`);
      throw new Error(`[Judit] Resposta inesperada não-JSON (Content-Type: ${contentType})`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Etapa 1: Criar requisição por CNJ ────────────────────────────────────
export async function criarRequisicaoJudit(cnj: string, processoId?: number): Promise<string> {
  // C3: Cooldown 24h — verificar se CNJ já foi consultado com sucesso nas últimas 24h
  const consultaRecente = await getConsultaRecentePorCnj(cnj, 24);
  if (consultaRecente) {
    console.log(`[Judit] CNJ ${cnj} já consultado nas últimas 24h — reutilizando resultado. requestId: ${consultaRecente.requestId ?? 'N/A'}`);
    // Retornar requestId existente ou buscar o mais recente no judit_requests
    if (consultaRecente.requestId) return consultaRecente.requestId;
    const existing = await getJuditRequestByCnj(cnj);
    if (existing) return existing.requestId;
  }

  // Verificar se já existe requisição recente com status processing (evitar duplicatas)
  const existing = await getJuditRequestByCnj(cnj);
  if (existing && existing.status === "processing") {
    const minutoDesde = (Date.now() - existing.createdAt.getTime()) / (1000 * 60);
    if (minutoDesde < 30) {
      console.log(`[Judit] CNJ ${cnj} já possui requisição em processamento (${Math.round(minutoDesde)}min). Reutilizando requestId: ${existing.requestId}`);
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
          // cache_ttl_in_days omitido — suporte Judit recomenda não usar para dados em tempo real
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
/**
 * Retorna o melhor resultado disponível no array page_data.
 * Conforme orientação do suporte Judit, o array pode conter múltiplos objetos
 * (ex: uma entrada por instância). Devemos iterar todos e escolher o mais completo.
 * Entradas com lawsuit_not_found são ignoradas se houver outra instância com dados.
 */
export async function obterResultadoJudit(requestId: string): Promise<unknown | null> {
  const data = await retryWithBackoff(
    () => juditFetch(`/responses?request_id=${requestId}`),
    3,
    `GET /responses?request_id=${requestId}`
  ) as {
    page_data?: Array<{ response_data?: unknown; parties?: unknown[]; steps?: unknown[]; attachments?: unknown[]; response_type?: string }>;
    data?: unknown[];
    results?: unknown[];
    items?: unknown[];
  };

  // Formato principal da Judit: { page_data: [{ response_data }, ...] }
  // O suporte confirmou que page_data é um array com uma entrada por instância.
  // Devemos iterar TODOS os objetos e escolher o que tem dados reais (não lawsuit_not_found).
  if (data.page_data && Array.isArray(data.page_data) && data.page_data.length > 0) {
    console.log(`[Judit] page_data contém ${data.page_data.length} entrada(s) para requestId=${requestId}`);

    let melhorResultado: Record<string, unknown> | null = null;
    let melhorScore = -1;

    for (let i = 0; i < data.page_data.length; i++) {
      const entry = data.page_data[i];
      const rd = (entry.response_data ?? {}) as Record<string, unknown>;

      // Pular entradas de IA (response_type === 'ia')
      if (entry.response_type === "ia") continue;

      // Verificar se é lawsuit_not_found
      const isNotFound =
        rd.code === 2 ||
        (typeof rd.message === "string" && rd.message.includes("NOT_FOUND")) ||
        (typeof rd.status === "string" && rd.status.toLowerCase().includes("not_found"));

      if (isNotFound) {
        console.log(`[Judit] Entrada ${i} (requestId=${requestId}): lawsuit_not_found — ignorando`);
        continue;
      }

      // Calcular score de completude: steps + parties + presença de status
      const steps = (rd.steps as unknown[]) ?? (entry.steps as unknown[]) ?? [];
      const parties = (rd.parties as unknown[]) ?? (entry.parties as unknown[]) ?? [];
      const hasStatus = typeof rd.status === "string" && rd.status.length > 0;
      const score = steps.length * 2 + parties.length + (hasStatus ? 10 : 0);

      console.log(`[Judit] Entrada ${i} (requestId=${requestId}): status=${rd.status ?? "N/A"}, steps=${steps.length}, parties=${parties.length}, score=${score}`);

      if (score > melhorScore) {
        melhorScore = score;
        melhorResultado = {
          ...rd,
          steps,
          parties,
          attachments: (rd.attachments as unknown[]) ?? (entry.attachments as unknown[]) ?? [],
        };
      }
    }

    if (melhorResultado) {
      console.log(`[Judit] Melhor resultado selecionado para requestId=${requestId}: status=${melhorResultado.status ?? "N/A"}, steps=${(melhorResultado.steps as unknown[]).length}`);
      return melhorResultado;
    }

    // Todos eram not_found
    console.log(`[Judit] Todas as entradas retornaram lawsuit_not_found para requestId=${requestId}`);
    return null;
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

// ─── Helpers de detecção de alvará ──────────────────────────────────────────
const ALVARA_REGEX = /alvar[aá]|expedi[cç][aã]o.*alvar[aá]|alvar[aá].*expedido|alvar[aá].*levantamento/i;

function detectarAlvara(data: Record<string, unknown>, cnj?: string): boolean {
  // 1. Verificar last_step.content
  const lastStep = data.last_step as Record<string, unknown> | undefined;
  if (lastStep?.content && ALVARA_REGEX.test(String(lastStep.content))) {
    if (cnj) console.log(`[Judit] Alvará detectado para CNJ ${cnj} — origem: last_step — status atualizado para concluido_ganho`);
    return true;
  }

  // 2. Verificar array steps[]
  const steps = (data.steps ?? (data.response_data as Record<string, unknown> | undefined)?.steps) as unknown[] | undefined;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      const s = step as Record<string, unknown>;
      if (s.content && ALVARA_REGEX.test(String(s.content))) {
        if (cnj) console.log(`[Judit] Alvará detectado para CNJ ${cnj} — origem: steps[] — status atualizado para concluido_ganho`);
        return true;
      }
    }
  }

  // 3. Verificar array attachments[]
  const attachments = (data.attachments ?? (data.response_data as Record<string, unknown> | undefined)?.attachments) as unknown[] | undefined;
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      const a = att as Record<string, unknown>;
      const nome = String(a.attachment_name ?? a.name ?? "");
      if (ALVARA_REGEX.test(nome)) {
        if (cnj) console.log(`[Judit] Alvará detectado para CNJ ${cnj} — origem: attachments[] — status atualizado para concluido_ganho`);
        return true;
      }
    }
  }

  // 4. Verificar também em nested response_data
  const nested = data.response_data as Record<string, unknown> | undefined;
  if (nested) {
    const nestedSteps = nested.steps as unknown[] | undefined;
    if (Array.isArray(nestedSteps)) {
      for (const step of nestedSteps) {
        const s = step as Record<string, unknown>;
        if (s.content && ALVARA_REGEX.test(String(s.content))) {
          if (cnj) console.log(`[Judit] Alvará detectado para CNJ ${cnj} — origem: response_data.steps[] — status atualizado para concluido_ganho`);
          return true;
        }
      }
    }
  }

  return false;
}

// ─── Mapeamento de status ──────────────────────────────────────────────────
export function mapearStatusJudit(data: unknown, cnj?: string): { statusResumido: StatusResumido; statusOriginal: string } {
  const payload = data as Record<string, unknown>;

  // ── PRIORIDADE MÁXIMA: detecção de alvará ──────────────────────────────────
  if (detectarAlvara(payload, cnj)) {
    const statusOriginal = (payload.status as string) ?? (payload.situation as string) ?? "Alvará Detectado";
    return { statusResumido: "concluido_ganho", statusOriginal };
  }

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

    // ── REGRA 2: Arquivado + related_lawsuits → em_recurso ─────────────────────────────
    const relatedLawsuits = (
      payload.related_lawsuits ??
      (payload.response_data as Record<string, unknown> | undefined)?.related_lawsuits
    ) as unknown[] | undefined;
    if (Array.isArray(relatedLawsuits) && relatedLawsuits.length > 0) {
      if (cnj) console.log(`[Judit] Arquivado com related_lawsuits para CNJ ${cnj} — regra: em_recurso`);
      return { statusResumido: "em_recurso", statusOriginal };
    }

    // ── REGRA 3: Arquivado + sem related_lawsuits + palavras-chave → concluido_perdido ────────
    const lastStep = (
      payload.last_step ??
      (payload.response_data as Record<string, unknown> | undefined)?.last_step
    ) as Record<string, unknown> | undefined;
    const lastStepContent = String(lastStep?.content ?? lastStep?.description ?? lastStep?.title ?? "").toLowerCase();
    const PERDIDO_REGEX = /arquivado definitivamente|baixa definitiva|processo arquivado|extinto|extin[cç][aã]o|improcedente|julgado improcedente|n[aã]o provido|negado provimento/i;
    if (PERDIDO_REGEX.test(lastStepContent)) {
      if (cnj) console.log(`[Judit] Arquivado definitivo para CNJ ${cnj} — regra: concluido_perdido (last_step: "${lastStepContent.substring(0, 60)}")`);
      return { statusResumido: "concluido_perdido", statusOriginal };
    }

    // ── REGRA 4: Manter arquivado_encerrado para revisão manual ───────────────────────
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

        const { statusResumido, statusOriginal } = mapearStatusJudit(resultado, cnj);
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
          const { statusResumido, statusOriginal } = mapearStatusJudit(resultado, req.cnj);
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

export async function buscarMovimentacoesJudit(cnj: string, apenasCache = false): Promise<{
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

  // Se apenasCache=true, retornar vazio em vez de chamar a API
  if (apenasCache) {
    console.log(`[Judit] Modo cache-only: retornando vazio para ${cnj}`);
    return { steps: [], fromCache: true };
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
            const { statusResumido, statusOriginal } = mapearStatusJudit(resultado, cnj);
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
      const { statusResumido, statusOriginal } = mapearStatusJudit(resultado, cnj);
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
  requestId: string | null;
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
          return { atualizado: false, criado: false, processo, notFound: true, requestId };
        }

        // Verificar se é um erro LAWSUIT_NOT_FOUND
        const r = resultado as Record<string, unknown>;
        if (r.code === 2 || (typeof r.message === "string" && r.message.includes("NOT_FOUND"))) {
          await updateJuditRequestStatus(requestId, "completed");
          const processo = await getProcessoByCnj(cnj);
          return { atualizado: false, criado: false, processo, notFound: true, requestId };
        }

        const { statusResumido, statusOriginal } = mapearStatusJudit(resultado, cnj);

        // Criar ou atualizar processo no banco
        const { criado } = await upsertProcessoFromJudit(cnj, statusResumido, statusOriginal, resultado, requestId);
        await updateJuditRequestStatus(requestId, "completed");

        // Extrair e vincular cliente
        await vincularClienteDoPayload(cnj, resultado);

        console.log(`[Judit] Processo ${cnj} ${criado ? "criado" : "atualizado"}: ${statusOriginal} → ${statusResumido}`);

        const processo = await getProcessoByCnj(cnj);
        return { atualizado: true, criado, processo, notFound: false, requestId };
      }

      if (status === "error") {
        await updateJuditRequestStatus(requestId, "error");
        const processo = await getProcessoByCnj(cnj);
        return { atualizado: false, criado: false, processo, notFound: false, requestId };
      }
    }

    // Timeout
    const processo = await getProcessoByCnj(cnj);
    return { atualizado: false, criado: false, processo, notFound: false, requestId: null };
  } catch (error) {
    console.error(`[Judit] Erro ao buscar/salvar processo ${cnj}:`, error);
    const processo = await getProcessoByCnj(cnj);
    return { atualizado: false, criado: false, processo, notFound: false, requestId: null };
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
