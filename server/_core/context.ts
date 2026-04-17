import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** true quando a requisição está autenticada via token de impersonacão */
  isImpersonating: boolean;
  /** ID do admin que iniciou a sessão de impersonacão (null quando não há impersonacão) */
  impersonatingAdminId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let isImpersonating = false;
  let impersonatingAdminId: number | null = null;

  // ─── Verificar token de impersonacão no header ─────────────────────────────────────
  const impersonacaoToken = opts.req.headers["x-impersonacao-token"];
  if (typeof impersonacaoToken === "string" && impersonacaoToken.length > 0) {
    try {
      const imp = await db.buscarImpersonacaoPorToken(impersonacaoToken);
      if (imp && imp.ativo && imp.expiradoEm > new Date()) {
        const usuarioVisualizado = await db.getUserById(imp.usuarioVisualizadoId);
        if (usuarioVisualizado) {
          user = usuarioVisualizado;
          isImpersonating = true;
          impersonatingAdminId = imp.adminId;
        }
      }
    } catch {
      // Token inválido ou erro de DB — ignorar e continuar com autenticação normal
    }
  }

  // ─── Autenticação normal via cookie (apenas se impersonacão não resolveu) ──────
  if (!user) {
    // In development mode, automatically authenticate as the owner user
    // so the admin panel is accessible without going through OAuth.
    if (!ENV.isProduction && ENV.ownerOpenId) {
      try {
        user = (await db.getUserByOpenId(ENV.ownerOpenId)) ?? null;
      } catch {
        user = null;
      }
    }

    if (!user) {
      try {
        user = await sdk.authenticateRequest(opts.req);
      } catch {
        // Authentication is optional for public procedures.
        user = null;
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isImpersonating,
    impersonatingAdminId,
  };
}
