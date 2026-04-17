import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Middleware que bloqueia mutations quando a requisição está em modo de impersonacão.
 * Procedures que DEVEM funcionar mesmo em impersonacão (queries e mutations de encerramento):
 *   - auth.validarTokenImpersonacao (query pública)
 *   - admin.encerrarImpersonacao (mutation de encerramento)
 * Todas as demais mutations são bloqueadas com FORBIDDEN.
 */
const blockMutationsOnImpersonation = t.middleware(async opts => {
  const { ctx, next, type, path } = opts;

  // Permite mutations de encerramento de impersonacão mesmo durante a sessão
  const ALLOWED_MUTATIONS_DURING_IMPERSONATION = [
    "admin.encerrarImpersonacao",
  ];

  if (
    ctx.isImpersonating &&
    type === "mutation" &&
    !ALLOWED_MUTATIONS_DURING_IMPERSONATION.includes(path)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Ação não permitida em modo de visualização",
    });
  }

  // Propagar ctx com user não-nulo (garantido pelo requireUser que vem antes)
  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

/**
 * Procedure protegida que também bloqueia mutations durante impersonacão.
 * Use este tipo para todas as procedures que não devem ser executadas
 * por um admin impersonando outro usuário.
 */
export const protectedProcedureWithImpersonationGuard = t.procedure
  .use(requireUser)
  .use(blockMutationsOnImpersonation);
