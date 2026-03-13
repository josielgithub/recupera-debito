/**
 * Serviço de integração com a API Codilo
 *
 * Autenticação: OAuth2 client_credentials
 * POST https://auth.codilo.com.br/oauth/token
 * Body JSON: { grant_type: "client_credentials", id: API_KEY, secret: API_SECRET }
 *
 * Todas as requisições seguintes usam: Authorization: Bearer <access_token>
 *
 * Estratégia de resiliência:
 * - Token armazenado em cache até expirar (com margem de 60s)
 * - Renovação automática em erro 401
 * - Erros logados sem interromper o sistema principal
 */

import axios, { AxiosError } from "axios";
import { CODILO_STATUS_MAP } from "../shared/const";
import { StatusResumido } from "../drizzle/schema";

// ─── Configuração ─────────────────────────────────────────────────────────────

const CODILO_AUTH_URL = "https://auth.codilo.com.br/oauth/token";
const CODILO_API_BASE = "https://api.codilo.com.br";

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

  const apiKey = process.env.CODILO_API_KEY;
  const apiSecret = process.env.CODILO_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("[Codilo] Credenciais não configuradas: CODILO_API_KEY e CODILO_API_SECRET são obrigatórios.");
  }

  try {
    const response = await axios.post(
      CODILO_AUTH_URL,
      {
        grant_type: "client_credentials",
        id: apiKey,
        secret: apiSecret,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10_000,
      }
    );

    const { access_token, expires_in } = response.data;

    if (!access_token) {
      throw new Error("[Codilo] Resposta de autenticação inválida: access_token ausente.");
    }

    const expiresInMs = (expires_in ?? 3600) * 1000;
    _tokenCache = {
      accessToken: access_token,
      expiresAt: agora + expiresInMs,
    };

    console.log(`[Codilo] Token obtido com sucesso. Expira em ${expires_in ?? 3600}s.`);
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

/**
 * Invalida o cache do token (usado após erro 401).
 */
export function invalidarTokenCache(): void {
  _tokenCache = null;
}

// ─── Helper de requisição com retry em 401 ────────────────────────────────────

async function codiloRequest<T>(
  method: "get" | "post" | "put",
  path: string,
  data?: unknown
): Promise<T> {
  const fazerRequisicao = async (): Promise<T> => {
    const token = await getCodiloToken();
    const url = `${CODILO_API_BASE}${path}`;

    const response = await axios({
      method,
      url,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15_000,
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

// ─── Tipos de Resposta da Codilo ──────────────────────────────────────────────

export interface CodiloProcesso {
  id?: string;
  numero?: string;
  cpf?: string;
  cnpj?: string;
  nome?: string;
  status?: string;
  tribunal?: string;
  vara?: string;
  comarca?: string;
  assunto?: string;
  ultimaMovimentacao?: string;
  dataUltimaAtualizacao?: string;
  [key: string]: unknown;
}

export interface CodiloSearchResult {
  processos?: CodiloProcesso[];
  data?: CodiloProcesso[];
  total?: number;
  pagina?: number;
  totalPaginas?: number;
  [key: string]: unknown;
}

// ─── Funções de Consulta ──────────────────────────────────────────────────────

/**
 * Consulta processos por CPF, CNPJ ou nome na API Codilo.
 * @param documento - CPF (somente dígitos), CNPJ (somente dígitos) ou nome completo
 * @param tipo - "cpf" | "cnpj" | "nome"
 */
export async function searchProcessByDocument(
  documento: string,
  tipo: "cpf" | "cnpj" | "nome" = "cpf"
): Promise<CodiloSearchResult> {
  const docLimpo = tipo !== "nome" ? documento.replace(/\D/g, "") : documento;

  try {
    const result = await codiloRequest<CodiloSearchResult>(
      "get",
      `/processos?${tipo}=${encodeURIComponent(docLimpo)}`
    );
    return result;
  } catch (err) {
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao consultar processos por ${tipo}: ${msg}`);
    throw new Error(`[Codilo] Falha na consulta por ${tipo}: ${msg}`);
  }
}

/**
 * Consulta um processo específico pelo número CNJ.
 * Retorna null se não encontrado (404) ou em caso de erro.
 */
export async function getProcessoByCnjCodilo(cnj: string): Promise<CodiloProcesso | null> {
  const cnjLimpo = cnj.replace(/\D/g, "");
  try {
    const result = await codiloRequest<CodiloProcesso>("get", `/processos/${cnjLimpo}`);
    return result;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      return null;
    }
    const msg = err instanceof AxiosError
      ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao buscar processo ${cnj}: ${msg}`);
    return null;
  }
}

// ─── Normalização de Status ───────────────────────────────────────────────────

/**
 * Normaliza o status retornado pela Codilo para os 12 estados resumidos do sistema.
 * Tenta correspondência exata via CODILO_STATUS_MAP, depois por palavras-chave.
 */
export function normalizarStatusCodilo(statusRaw: string | undefined): StatusResumido {
  if (!statusRaw) return "em_analise_inicial";

  const lower = statusRaw.toLowerCase().trim();

  // Correspondência exata via mapa configurável
  if (CODILO_STATUS_MAP[lower]) {
    return CODILO_STATUS_MAP[lower] as StatusResumido;
  }

  // Correspondência parcial via mapa
  for (const [chave, valor] of Object.entries(CODILO_STATUS_MAP)) {
    if (lower.includes(chave) || chave.includes(lower)) {
      return valor as StatusResumido;
    }
  }

  // Fallback por palavras-chave
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
 * Processa em lotes de 5 com delay de 500ms entre lotes para não sobrecarregar a API.
 * Nunca lança exceção — retorna relatório completo de resultados.
 *
 * @param processosList - Lista de processos com id, cnj e statusResumido atual
 * @param onUpdate - Callback chamado quando um processo tem status alterado
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
          const dados = await getProcessoByCnjCodilo(proc.cnj);

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

          const statusNovo = normalizarStatusCodilo(dados.status);
          const statusInterno = dados.status ?? "";

          if (statusNovo !== proc.statusResumido) {
            await onUpdate(proc.id, statusNovo, statusInterno, dados);
            resultado.atualizados++;
            resultado.detalhes.push({
              cnj: proc.cnj,
              statusAnterior: proc.statusResumido,
              statusNovo,
            });
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
 * Testa a conexão com a API Codilo obtendo um token fresco.
 * Retorna { ok: true } ou { ok: false, erro: string }
 */
export async function testarConexaoCodilo(): Promise<{ ok: boolean; erro?: string }> {
  try {
    invalidarTokenCache(); // força renovação para testar de verdade
    await getCodiloToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

// ─── Compatibilidade com código legado ───────────────────────────────────────

/** @deprecated Use testarConexaoCodilo() */
export function validarCallbackCodilo(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.CODILO_CALLBACK_SECRET;
  if (!secret) return true;
  const headerValue = headers["x-codilo-secret"] ?? headers["x-codilo-signature"];
  if (!headerValue) return false;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value === secret;
}
