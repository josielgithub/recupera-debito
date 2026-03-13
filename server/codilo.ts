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

/**
 * Busca um processo pelo número CNJ.
 * Endpoint: GET https://api.capturaweb.com.br/v1/autorequest?key=cnj&value={CNJ}
 */
export async function searchProcessByCNJ(cnj: string): Promise<CodiloProcesso | null> {
  console.log(`[Codilo] Buscando processo CNJ: ${cnj}`);
  try {
    const result = await codiloRequest<CodiloApiResponse<CodiloProcesso>>(
      "get",
      `${CAPTURA_BASE}/autorequest`,
      undefined,
      { key: "cnj", value: cnj }
    );

    // Formato: { success: true, data: { total: N, result: [...] } }
    const data = result.data;
    if (data && typeof data === "object" && "result" in data) {
      const arr = (data as { total?: number; result?: CodiloProcesso[] }).result;
      return arr && arr.length > 0 ? arr[0] : null;
    }
    // Fallback: data é array direto
    if (Array.isArray(data)) return (data as CodiloProcesso[])[0] ?? null;
    // Fallback: resultado direto
    if (data && typeof data === "object" && "cnj" in data) return data as CodiloProcesso;
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
  console.log(`[Codilo] Buscando processos por ${tipo}: ${docLimpo}`);

  try {
    const result = await codiloRequest<CodiloApiResponse<CodiloProcesso>>(
      "get",
      `${CAPTURA_BASE}/autorequest`,
      undefined,
      { key: tipo, value: docLimpo }
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

  if (lower.includes("ganho") || lower.includes("procedente") || lower.includes("deferido")) return "concluido_ganho";
  if (lower.includes("perdido") || lower.includes("improcedente") || lower.includes("indeferido")) return "concluido_perdido";
  if (lower.includes("cumprimento") || lower.includes("execução") || lower.includes("execucao")) return "cumprimento_de_sentenca";
  if (lower.includes("recurso") || lower.includes("apelação") || lower.includes("apelacao") || lower.includes("agravo")) return "em_recurso";
  if (lower.includes("audiência") || lower.includes("audiencia")) return "aguardando_audiencia";
  if (lower.includes("sentença") || lower.includes("sentenca") || lower.includes("julgamento")) return "aguardando_sentenca";
  if (lower.includes("acordo") || lower.includes("negociação") || lower.includes("negociacao")) return "acordo_negociacao";
  if (lower.includes("documento") || lower.includes("diligência") || lower.includes("diligencia")) return "aguardando_documentos";
  if (lower.includes("arquivado") || lower.includes("encerrado") || lower.includes("extinto")) return "arquivado_encerrado";
  if (lower.includes("protocolado") || lower.includes("distribuído") || lower.includes("distribuido")) return "protocolado";
  if (lower.includes("andamento") || lower.includes("tramitando") || lower.includes("ativo")) return "em_andamento";

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
 * Processa em lotes de 5 com delay de 500ms entre lotes.
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

  const LOTE = 5;
  const DELAY_MS = 500;

  for (let i = 0; i < processosList.length; i += LOTE) {
    const lote = processosList.slice(i, i + LOTE);

    await Promise.all(
      lote.map(async (proc) => {
        try {
          const dados = await searchProcessByCNJ(proc.cnj);

          if (!dados) {
            resultado.semAlteracao++;
            resultado.detalhes.push({
              cnj: proc.cnj,
              statusAnterior: proc.statusResumido,
              statusNovo: proc.statusResumido,
              erro: "Processo não encontrado na Codilo",
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
