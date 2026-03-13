/**
 * Serviço de integração com a API Codilo
 *
 * Autenticação: OAuth2 client_credentials
 *   POST https://auth.codilo.com.br/oauth/token
 *   Body: { grant_type: "client_credentials", id: API_KEY, secret: API_SECRET }
 *
 * Consulta de processos: https://api.capturaweb.com.br/v1
 * Monitoramento PUSH:    https://api.push.codilo.com.br/v1
 *
 * Estratégia de resiliência:
 *   - Token armazenado em cache até expirar (com margem de 60s)
 *   - Renovação automática em erro 401
 *   - Erros logados sem interromper o sistema principal
 */

import axios, { AxiosError } from "axios";
import { CODILO_STATUS_MAP } from "../shared/const";
import { StatusResumido } from "../drizzle/schema";

// ─── URLs da API ──────────────────────────────────────────────────────────────

const CODILO_AUTH_URL = "https://auth.codilo.com.br/oauth/token";
const CAPTURA_BASE    = "https://api.capturaweb.com.br/v1";
const PUSH_BASE       = "https://api.push.codilo.com.br/v1";

// ─── Cache de Token ───────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number; // timestamp em ms
}

let _tokenCache: TokenCache | null = null;

/**
 * Obtém um token de acesso válido, usando cache quando disponível.
 * Renova automaticamente se expirado ou próximo de expirar (margem de 60s).
 */
export async function getCodiloToken(): Promise<string> {
  const agora = Date.now();
  const margemSeguranca = 60_000;

  if (_tokenCache && _tokenCache.expiresAt - margemSeguranca > agora) {
    return _tokenCache.accessToken;
  }

  const apiKey    = process.env.CODILO_API_KEY;
  const apiSecret = process.env.CODILO_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("[Codilo] Credenciais não configuradas: CODILO_API_KEY e CODILO_API_SECRET são obrigatórios.");
  }

  try {
    const response = await axios.post(
      CODILO_AUTH_URL,
      { grant_type: "client_credentials", id: apiKey, secret: apiSecret },
      { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
    );

    const { access_token, expires_in } = response.data;

    if (!access_token) {
      throw new Error("[Codilo] Resposta de autenticação inválida: access_token ausente.");
    }

    const expiresInMs = (expires_in ?? 21600) * 1000;
    _tokenCache = { accessToken: access_token, expiresAt: agora + expiresInMs };

    console.log(`[Codilo] Token obtido com sucesso. Expira em ${expires_in ?? 21600}s.`);
    return access_token;
  } catch (err) {
    _tokenCache = null;
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Falha ao obter token: ${msg}`);
    throw new Error(`[Codilo] Falha na autenticação: ${msg}`);
  }
}

/** Invalida o cache do token (usado após erro 401). */
export function invalidarTokenCache(): void {
  _tokenCache = null;
}

// ─── Helper de requisição com retry em 401 ────────────────────────────────────

async function codiloRequest<T>(
  method: "get" | "post" | "put",
  url: string,
  data?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const fazerRequisicao = async (): Promise<T> => {
    const token = await getCodiloToken();
    const response = await axios({
      method,
      url,
      data,
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
    return response.data as T;
  };

  try {
    return await fazerRequisicao();
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 401) {
      console.warn("[Codilo] Token expirado (401). Renovando e tentando novamente...");
      invalidarTokenCache();
      return await fazerRequisicao();
    }
    throw err;
  }
}

// ─── Tipos de Resposta ────────────────────────────────────────────────────────

export interface CodiloProcesso {
  id?: string;
  cnj?: string;
  numero?: string;
  cpf?: string;
  cnpj?: string;
  nome?: string;
  status?: string;
  situacao?: string;
  tribunal?: string;
  vara?: string;
  comarca?: string;
  uf?: string;
  assunto?: string;
  classe?: string;
  ultimaMovimentacao?: string;
  dataUltimaAtualizacao?: string;
  partes?: Array<{ nome: string; tipo: string }>;
  movimentacoes?: Array<{ data: string; descricao: string }>;
  // Campos do formato real da Codilo (GET /request/{id})
  cover?: Array<{ description: string; value: string }>;
  properties?: Record<string, unknown>;
  people?: Array<{ pole: string; description: string; name: string; lawyers?: Array<{ name: string; oab?: string }> }>;
  steps?: Array<{ seq: string; timestamp: string; title: string; description: string; actionBy?: string }>;
  [key: string]: unknown;
}

export interface CodiloRequest {
  id?: string;
  cnj?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CodiloApiResponse<T> {
  success?: boolean;
  data?: {
    total?: number;
    result?: T[];
  } | T;
  [key: string]: unknown;
}

export interface CodiloSearchResult {
  processos?: CodiloProcesso[];
  data?: CodiloProcesso[] | { total?: number; result?: CodiloProcesso[] };
  total?: number;
  result?: CodiloProcesso[];
  [key: string]: unknown;
}

// ─── Funções de Consulta ──────────────────────────────────────────────────────

// ─── Tipos de autorequest ────────────────────────────────────────────────────

export interface CodiloAutoRequest {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  requests: Array<{
    id: string;
    status: "pending" | "done" | "success" | "error" | "warning";
    platform: string;
    query: string;
    court?: string;
    uf?: string;
    respondedAt?: string | null;
    result?: CodiloProcesso; // geralmente null no autorequest; buscar via GET /request/{id}
    [key: string]: unknown;
  }>;
}

/**
 * Cria uma requisição de busca assíncrona na Codilo (POST /autorequest).
 * Retorna o autorequest com ID para polling posterior.
 * Endpoint: POST https://api.capturaweb.com.br/v1/autorequest
 */
// Mapeamento de tipos internos para os keys aceitos pela API Codilo
const CODILO_KEY_MAP: Record<string, string> = {
  cpf:  "doc",
  cnpj: "doc",
  nome: "nomeparte",
  cnj:  "cnj",
};

export async function criarAutoRequest(
  key: "cnj" | "cpf" | "cnpj" | "nome",
  value: string
): Promise<CodiloAutoRequest | null> {
  const codiloKey = CODILO_KEY_MAP[key] ?? key;
  console.log(`[Codilo] Criando autorequest ${key} (key Codilo: ${codiloKey}): ${value}`);
  try {
    const result = await codiloRequest<{ success: boolean; data: CodiloAutoRequest }>(
      "post",
      `${CAPTURA_BASE}/autorequest`,
      { key: codiloKey, value }
    );
    return result.data ?? null;
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao criar autorequest ${key}=${value}: ${msg}`);
    return null;
  }
}

/**
 * Busca o estado atual de um autorequest pelo ID (polling).
 * Retorna null se não encontrado.
 */
export async function getAutoRequest(id: string): Promise<CodiloAutoRequest | null> {
  try {
    const result = await codiloRequest<{ success: boolean; data: CodiloAutoRequest }>(
      "get",
      `${CAPTURA_BASE}/autorequest/${id}`
    );
    return result.data ?? null;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao buscar autorequest ${id}: ${msg}`);
    return null;
  }
}

/**
 * Busca o resultado de uma request individual via GET /request/{id}.
 * O resultado real fica neste endpoint, não no autorequest.
 */
async function getRequestResult(requestId: string): Promise<CodiloProcesso | null> {
  try {
    const result = await codiloRequest<{
      success: boolean;
      type: string;
      data: Array<{
        cover: Array<{ description: string; value: string }>;
        properties?: Record<string, unknown>;
        people?: unknown[];
        steps?: unknown[];
      }>;
    }>("get", `${CAPTURA_BASE}/request/${requestId}`);

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) return null;

    const processo = result.data[0];
    const cover = processo.cover ?? [];

    // Extrai campos do cover (array de { description, value })
    const getCover = (desc: string): string | undefined =>
      cover.find(c => c.description?.toLowerCase() === desc.toLowerCase())?.value;

    // Status: preferir "Fase Processual" > "Status" > "Situação"
    const fase = getCover("Fase Processual");
    const status = getCover("Status") ?? getCover("Situação") ?? getCover("Situacao");
    const statusFinal = fase ?? status ?? "";

    return {
      cnj: getCover("Número") ?? getCover("Numero"),
      status: statusFinal,
      situacao: statusFinal,
      classe: getCover("Classe"),
      assunto: getCover("Assunto(s)") ?? getCover("Assunto"),
      tribunal: getCover("Serventia") ?? getCover("Tribunal"),
      vara: getCover("Serventia"),
      comarca: getCover("Serventia"),
      uf: (processo.properties as Record<string, string> | undefined)?.uf,
      ultimaMovimentacao: getCover("Dt. Distribuição") ?? getCover("Última Movimentação"),
      cover,
      properties: processo.properties,
      people: processo.people as CodiloProcesso["people"],
      steps: processo.steps as CodiloProcesso["steps"],
    } as CodiloProcesso;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao buscar resultado da request ${requestId}: ${msg}`);
    return null;
  }
}

/**
 * Busca um processo pelo número CNJ usando fluxo assíncrono correto:
 * 1. POST /autorequest para criar a requisição (ou reutiliza existente)
 * 2. Polling em GET /autorequest/{id} até encontrar request com status "success"
 * 3. Busca resultado via GET /request/{id} (onde o resultado real fica)
 * 4. Extrai status do campo cover[{ description: "Status" | "Fase Processual" }]
 *
 * NOTA: A Codilo processa requisições de forma assíncrona. O resultado pode
 * demorar de segundos a minutos dependendo do tribunal.
 */
export async function searchProcessByCNJ(
  cnj: string,
  opcoes?: { polling?: boolean; maxTentativas?: number; intervaloMs?: number }
): Promise<CodiloProcesso | null> {
  console.log(`[Codilo] Buscando processo CNJ: ${cnj}`);
  try {
    // Primeiro verifica se já existe um autorequest para este CNJ
    const existente = await codiloRequest<{ success: boolean; data: { total: number; result: CodiloAutoRequest[] } }>(
      "get",
      `${CAPTURA_BASE}/autorequest`,
      undefined,
      { key: "cnj", value: cnj }
    );

    let autorequest: CodiloAutoRequest | null = null;

    if (existente.data && existente.data.total > 0 && existente.data.result.length > 0) {
      autorequest = existente.data.result[0];
      console.log(`[Codilo] Autorequest existente encontrado: ${autorequest.id}`);
    } else {
      autorequest = await criarAutoRequest("cnj", cnj);
      if (!autorequest) return null;
      console.log(`[Codilo] Novo autorequest criado: ${autorequest.id}`);
    }

    /**
     * Tenta extrair resultado de um autorequest.
     * O resultado NÃO está no campo result do autorequest — está em GET /request/{id}.
     * Busca a primeira request com status "success" e chama GET /request/{id}.
     */
    const extrairResultado = async (ar: CodiloAutoRequest): Promise<CodiloProcesso | null> => {
      // Buscar request com status success (resultado disponível)
      const successReq = ar.requests?.find(r => r.status === "success");
      if (successReq?.id) {
        console.log(`[Codilo] Request com sucesso encontrada: ${successReq.id} (${successReq.platform})`);
        return await getRequestResult(successReq.id);
      }
      // Fallback: request com status done (formato antigo)
      const doneReq = ar.requests?.find(r => r.status === "done" && r.result);
      if (doneReq?.result) return doneReq.result;
      return null;
    };

    // Verifica se já há resultado imediato
    const resultadoImediato = await extrairResultado(autorequest);
    if (resultadoImediato) return resultadoImediato;

    // Se polling desabilitado, retorna null (modo não-bloqueante)
    if (opcoes?.polling === false) {
      console.log(`[Codilo] Autorequest ${autorequest.id} pendente (polling desabilitado).`);
      return null;
    }

    // Polling: aguarda até resultado ou timeout
    const maxTentativas = opcoes?.maxTentativas ?? 6;
    const intervaloMs   = opcoes?.intervaloMs ?? 5_000;

    for (let i = 0; i < maxTentativas; i++) {
      await new Promise(r => setTimeout(r, intervaloMs));
      const atualizado = await getAutoRequest(autorequest.id);
      if (!atualizado) break;

      const resultado = await extrairResultado(atualizado);
      if (resultado) {
        console.log(`[Codilo] Resultado obtido para CNJ ${cnj} após ${i + 1} tentativas.`);
        return resultado;
      }

      const todosFinalizados = atualizado.requests.every(
        r => r.status === "done" || r.status === "success" || r.status === "error" || r.status === "warning"
      );
      if (todosFinalizados) {
        console.log(`[Codilo] Todas as requests finalizadas para CNJ ${cnj} sem resultado útil.`);
        break;
      }

      console.log(`[Codilo] CNJ ${cnj}: aguardando... tentativa ${i + 1}/${maxTentativas}`);
    }

    return null;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao buscar CNJ ${cnj}: ${msg}`);
    return null;
  }
}

/**
 * Consulta processos por CPF, CNPJ ou nome.
 * Endpoint: GET https://api.capturaweb.com.br/v1/autorequest?key={tipo}&value={doc}
 */
export async function searchProcessByDocument(
  documento: string,
  tipo: "cpf" | "cnpj" | "nome" = "cpf"
): Promise<CodiloSearchResult> {
  const docLimpo = tipo !== "nome" ? documento.replace(/\D/g, "") : documento;
  const codiloKey = CODILO_KEY_MAP[tipo] ?? tipo;
  console.log(`[Codilo] Buscando processos por ${tipo} (key Codilo: ${codiloKey}): ${docLimpo}`);

  try {
    const result = await codiloRequest<CodiloApiResponse<CodiloProcesso>>(
      "get",
      `${CAPTURA_BASE}/autorequest`,
      undefined,
      { key: codiloKey, value: docLimpo }
    );

    // Normaliza para CodiloSearchResult
    const data = result.data;
    if (data && typeof data === "object" && "result" in data) {
      const inner = data as { total?: number; result?: CodiloProcesso[] };
      return { processos: inner.result ?? [], total: inner.total ?? 0 };
    }
    if (Array.isArray(data)) return { processos: data as CodiloProcesso[], total: (data as CodiloProcesso[]).length };
    return { processos: [], total: 0 };
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao consultar por ${tipo}: ${msg}`);
    throw new Error(`[Codilo] Falha na consulta por ${tipo}: ${msg}`);
  }
}

/**
 * Lista todas as requisições existentes na conta.
 * Endpoint: GET https://api.capturaweb.com.br/v1/request
 */
export async function listRequests(): Promise<CodiloRequest[]> {
  console.log("[Codilo] Listando requisições existentes...");
  try {
    const result = await codiloRequest<CodiloApiResponse<CodiloRequest>>(
      "get",
      `${CAPTURA_BASE}/request`
    );

    // Formato: { success: true, data: { total: N, result: [...] } }
    const data = result.data;
    let list: CodiloRequest[] = [];
    if (data && typeof data === "object" && "result" in data) {
      list = (data as { total?: number; result?: CodiloRequest[] }).result ?? [];
    } else if (Array.isArray(data)) {
      list = data as CodiloRequest[];
    }

    console.log(`[Codilo] ${list.length} requisições encontradas.`);
    return list;
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao listar requisições: ${msg}`);
    throw new Error(`[Codilo] Falha ao listar requisições: ${msg}`);
  }
}

/**
 * Registra um processo no sistema de Monitoramento PUSH da Codilo.
 * Endpoint: POST https://api.push.codilo.com.br/v1/processo/novo
 */
export async function registerMonitoring(cnj: string): Promise<boolean> {
  console.log(`[Codilo] Registrando monitoramento PUSH para CNJ: ${cnj}`);
  try {
    await codiloRequest(
      "post",
      `${PUSH_BASE}/processo/novo`,
      { cnj, ignore: false, callbacks: [] }
    );
    console.log(`[Codilo] Monitoramento registrado para ${cnj}.`);
    return true;
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao registrar monitoramento ${cnj}: ${msg}`);
    return false;
  }
}

/** @deprecated Use searchProcessByCNJ */
export async function getProcessoByCnjCodilo(cnj: string): Promise<CodiloProcesso | null> {
  return searchProcessByCNJ(cnj);
}

// ─── Normalização de Status ───────────────────────────────────────────────────

/**
 * Normaliza o status retornado pela Codilo para os 12 estados resumidos do sistema.
 */
export function normalizarStatusCodilo(statusRaw: string | undefined): StatusResumido {
  if (!statusRaw) return "em_analise_inicial";

  const lower = statusRaw.toLowerCase().trim();

  if (CODILO_STATUS_MAP[lower]) return CODILO_STATUS_MAP[lower] as StatusResumido;

  for (const [chave, valor] of Object.entries(CODILO_STATUS_MAP)) {
    if (lower.includes(chave) || chave.includes(lower)) {
      return valor as StatusResumido;
    }
  }

  // Valores reais retornados pela Codilo no campo cover["Fase Processual"] e cover["Status"]
  if (lower === "ativo" || lower === "em andamento" || lower === "tramitando") return "em_andamento";
  if (lower === "conhecimento") return "em_andamento"; // fase processual
  if (lower === "execução" || lower === "execucao" || lower.includes("cumprimento")) return "cumprimento_de_sentenca";
  if (lower === "recurso" || lower.includes("apelação") || lower.includes("apelacao") || lower.includes("agravo")) return "em_recurso";
  if (lower.includes("audiência") || lower.includes("audiencia")) return "aguardando_audiencia";
  if (lower.includes("sentença") || lower.includes("sentenca") || lower.includes("julgamento")) return "aguardando_sentenca";
  if (lower.includes("acordo") || lower.includes("negociação") || lower.includes("negociacao")) return "acordo_negociacao";
  if (lower.includes("documento") || lower.includes("diligência") || lower.includes("diligencia")) return "aguardando_documentos";
  if (lower.includes("arquivado") || lower.includes("encerrado") || lower.includes("extinto") || lower === "baixado") return "arquivado_encerrado";
  if (lower.includes("protocolado") || lower.includes("distribuído") || lower.includes("distribuido")) return "protocolado";
  if (lower.includes("ganho") || lower.includes("procedente") || lower.includes("deferido")) return "concluido_ganho";
  if (lower.includes("perdido") || lower.includes("improcedente") || lower.includes("indeferido")) return "concluido_perdido";

  console.warn(`[Codilo] Status não mapeado: "${statusRaw}" → em_analise_inicial`);
  return "em_analise_inicial";
}

// ─── Atualização Automática de Processos ─────────────────────────────────────

export interface ResultadoAtualizacao {
  total: number;
  atualizados: number;
  semAlteracao: number;
  erros: number;
  detalhes: Array<{ cnj: string; statusAnterior: string; statusNovo: string; erro?: string }>;
}

/**
 * Atualiza o status de uma lista de processos consultando a API Codilo.
 *
 * FLUXO ASSINCRONO DA CODILO:
 * 1. POST /autorequest → cria requisição assíncrona (retorna ID)
 * 2. GET /autorequest/{id} → polling até status "done" ou timeout
 * 3. Extrai resultado da request concluída e normaliza o status
 *
 * Processa em lotes de 3 com polling de até 5 tentativas (25s por processo).
 * Nunca lança exceção — retorna relatório completo de resultados.
 */
export async function updateProcessStatus(
  processosList: Array<{ id: number; cnj: string; statusResumido: string }>,
  onUpdate: (id: number, statusNovo: string, statusInterno: string, rawPayload: unknown) => Promise<void>
): Promise<ResultadoAtualizacao> {
  const resultado: ResultadoAtualizacao = {
    total: processosList.length,
    atualizados: 0,
    semAlteracao: 0,
    erros: 0,
    detalhes: [],
  };

  const LOTE = 3;      // Menos processos em paralelo para não sobrecarregar a API
  const DELAY_MS = 1_000; // 1s entre lotes

  for (let i = 0; i < processosList.length; i += LOTE) {
    const lote = processosList.slice(i, i + LOTE);

    await Promise.all(
      lote.map(async (proc) => {
        try {
          // Usa polling com até 5 tentativas de 5s cada (25s total por processo)
          const dados = await searchProcessByCNJ(proc.cnj, {
            polling: true,
            maxTentativas: 5,
            intervaloMs: 5_000,
          });

          if (!dados) {
            resultado.semAlteracao++;
            resultado.detalhes.push({
              cnj: proc.cnj,
              statusAnterior: proc.statusResumido,
              statusNovo: proc.statusResumido,
              erro: "Requisição criada na Codilo, aguardando processamento (pode demorar minutos)",
            });
            return;
          }

          const statusBruto = (dados.situacao ?? dados.status ?? "") as string;
          const statusNovo   = normalizarStatusCodilo(statusBruto);

          if (statusNovo !== proc.statusResumido) {
            await onUpdate(proc.id, statusNovo, statusBruto, dados);
            resultado.atualizados++;
            resultado.detalhes.push({ cnj: proc.cnj, statusAnterior: proc.statusResumido, statusNovo });
          } else {
            resultado.semAlteracao++;
          }
        } catch (err) {
          resultado.erros++;
          resultado.detalhes.push({
            cnj: proc.cnj,
            statusAnterior: proc.statusResumido,
            statusNovo: proc.statusResumido,
            erro: String(err),
          });
          console.error(`[Codilo] Erro ao atualizar processo ${proc.cnj}:`, err);
        }
      })
    );

    if (i + LOTE < processosList.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(
    `[Codilo] Atualização concluída: ${resultado.atualizados} atualizados, ` +
    `${resultado.semAlteracao} sem alteração, ${resultado.erros} erros.`
  );

  return resultado;
}

/**
 * Cria autorrequests para todos os processos sem aguardar resultado.
 * Útil para disparar a atualização em background e buscar resultados depois.
 * Retorna os IDs dos autorequests criados para polling posterior.
 */
export async function dispararAtualizacaoBackground(
  processosList: Array<{ id: number; cnj: string }>
): Promise<Array<{ cnj: string; autorequest_id: string | null }>> {
  const resultados: Array<{ cnj: string; autorequest_id: string | null }> = [];
  const LOTE = 5;
  const DELAY_MS = 500;

  for (let i = 0; i < processosList.length; i += LOTE) {
    const lote = processosList.slice(i, i + LOTE);
    const loteResultados = await Promise.all(
      lote.map(async (proc) => {
        const ar = await criarAutoRequest("cnj", proc.cnj);
        return { cnj: proc.cnj, autorequest_id: ar?.id ?? null };
      })
    );
    resultados.push(...loteResultados);
    if (i + LOTE < processosList.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[Codilo] ${resultados.filter(r => r.autorequest_id).length}/${processosList.length} autorequests criados.`);
  return resultados;
}

/**
 * Testa a conexão com a API Codilo obtendo um token fresco e listando requisições.
 */
export async function testarConexaoCodilo(): Promise<{ ok: boolean; erro?: string; detalhes?: unknown }> {
  try {
    invalidarTokenCache(); // força renovação para testar de verdade
    await getCodiloToken();

    let detalhes: unknown = null;
    try {
      const requests = await listRequests();
      detalhes = { totalRequests: requests.length };
    } catch (e) {
      detalhes = { aviso: "Token OK, mas listagem de requisições falhou", erro: String(e) };
    }

    return { ok: true, detalhes };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

/** Valida o secret do callback Codilo via header. */
export function validarCallbackCodilo(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.CODILO_CALLBACK_SECRET;
  if (!secret) return true;
  const headerValue = headers["x-codilo-secret"] ?? headers["x-codilo-signature"];
  if (!headerValue) return false;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value === secret;
}
