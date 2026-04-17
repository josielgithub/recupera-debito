import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Retorna os headers extras para cada requisição tRPC.
 * Se houver um token de impersonacão no sessionStorage, ele é injetado
 * como `x-impersonacao-token` para que o servidor substitua ctx.user
 * pelo usuário visualizado.
 */
export function getTrpcHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem("impersonacao_token");
    if (token) {
      return { "x-impersonacao-token": token };
    }
  } catch {
    // sessionStorage indisponível (SSR ou contexto restrito)
  }
  return {};
}
