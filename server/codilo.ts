/**
 * Serviço de integração com a API Codilo
 * Autenticação OAuth2 client_credentials + Monitoramento PUSH
 */
import axios from "axios";
import { CODILO_STATUS_MAP } from "../shared/const";
import { StatusResumido } from "../drizzle/schema";

const CODILO_AUTH_URL = "https://auth.codilo.com.br/oauth/token";
const CODILO_API_URL = "https://api.push.codilo.com.br/v1";

interface CodiloToken {
  access_token: string;
  expires_at: number; // timestamp ms
}

let _tokenCache: CodiloToken | null = null;

export async function getCodiloToken(): Promise<string | null> {
  const clientId = process.env.CODILO_CLIENT_ID;
  const clientSecret = process.env.CODILO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[Codilo] Credenciais não configuradas (CODILO_CLIENT_ID / CODILO_CLIENT_SECRET)");
    return null;
  }

  // Usar token em cache se ainda válido (com margem de 60s)
  if (_tokenCache && _tokenCache.expires_at > Date.now() + 60_000) {
    return _tokenCache.access_token;
  }

  try {
    const response = await axios.post(
      CODILO_AUTH_URL,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
    );

    const { access_token, expires_in } = response.data;
    _tokenCache = {
      access_token,
      expires_at: Date.now() + (expires_in ?? 3600) * 1000,
    };
    console.log("[Codilo] Token obtido com sucesso");
    return access_token;
  } catch (err: unknown) {
    console.error("[Codilo] Erro ao obter token:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface CadastroPushResult {
  sucesso: boolean;
  codiloProcessoId?: string;
  erro?: string;
}

export async function cadastrarProcessoMonitoramentoPush(
  cnj: string,
  callbackUrl: string
): Promise<CadastroPushResult> {
  const token = await getCodiloToken();
  if (!token) {
    return { sucesso: false, erro: "Token Codilo indisponível" };
  }

  try {
    const response = await axios.post(
      `${CODILO_API_URL}/processo/novo`,
      { cnj, callback: callbackUrl },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      }
    );

    const data = response.data;
    console.log(`[Codilo] Processo ${cnj} cadastrado no PUSH:`, data);
    return {
      sucesso: true,
      codiloProcessoId: data?.id ?? data?.processo_id ?? undefined,
    };
  } catch (err: unknown) {
    const msg = axios.isAxiosError(err)
      ? `${err.response?.status} - ${JSON.stringify(err.response?.data)}`
      : String(err);
    console.error(`[Codilo] Erro ao cadastrar processo ${cnj}:`, msg);
    return { sucesso: false, erro: msg };
  }
}

/**
 * Normaliza o status recebido da Codilo para um dos 12 estados resumidos.
 * Tenta correspondência exata, depois parcial (case-insensitive).
 */
export function normalizarStatusCodilo(statusRaw: string): StatusResumido {
  const lower = statusRaw.toLowerCase().trim();

  // Correspondência exata
  if (CODILO_STATUS_MAP[lower]) {
    return CODILO_STATUS_MAP[lower] as StatusResumido;
  }

  // Correspondência parcial
  for (const [chave, valor] of Object.entries(CODILO_STATUS_MAP)) {
    if (lower.includes(chave) || chave.includes(lower)) {
      return valor as StatusResumido;
    }
  }

  // Fallback: manter em andamento
  console.warn(`[Codilo] Status não mapeado: "${statusRaw}" → em_andamento`);
  return "em_andamento";
}

/**
 * Valida o header de segurança do callback Codilo.
 * Se CODILO_CALLBACK_SECRET estiver configurado, verifica o header X-Codilo-Secret.
 */
export function validarCallbackCodilo(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.CODILO_CALLBACK_SECRET;
  if (!secret) return true; // sem segredo configurado, aceitar tudo

  const headerValue = headers["x-codilo-secret"] ?? headers["x-codilo-signature"];
  if (!headerValue) return false;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value === secret;
}
