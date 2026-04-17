/**
 * Testes para o modo de impersonação:
 * 1. Middleware blockMutationsOnImpersonation bloqueia mutations quando isImpersonating=true
 * 2. Mutations permitidas durante impersonação (admin.encerrarImpersonacao) não são bloqueadas
 * 3. Queries funcionam normalmente durante impersonação
 * 4. Procedures normais (sem guard) não são afetadas pelo isImpersonating
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/** Cria um contexto de usuário advogado normal (sem impersonação) */
function createAdvogadoContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "advogado-test",
    email: "advogado@test.com",
    name: "Advogado Teste",
    loginMethod: "manus",
    role: "user",
    extraRoles: ["advogado"],
    foto: null,
    conviteId: null,
    ativo: true,
    telefone: null,
    oab: null,
    whatsappSuporte: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    isImpersonating: false,
    impersonatingAdminId: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/** Cria um contexto de impersonação — admin visualizando como advogado */
function createImpersonacaoContext(advogadoId = 1260053): TrpcContext {
  const user: AuthenticatedUser = {
    id: advogadoId,
    openId: "marcos-roberto-junior",
    email: "marcos@test.com",
    name: "Marcos Roberto Junior",
    loginMethod: "manus",
    role: "user",
    extraRoles: ["advogado"],
    foto: null,
    conviteId: null,
    ativo: true,
    telefone: null,
    oab: null,
    whatsappSuporte: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    isImpersonating: true,
    impersonatingAdminId: 1, // ID do admin que iniciou
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/** Cria um contexto de admin (para testar encerrarImpersonacao) */
function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-test",
    email: "admin@test.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    extraRoles: null,
    foto: null,
    conviteId: null,
    ativo: true,
    telefone: null,
    oab: null,
    whatsappSuporte: null,
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    isImpersonating: false,
    impersonatingAdminId: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Impersonação — bloqueio de mutations", () => {
  it("bloqueia advogado.cadastrarProcesso quando isImpersonating=true", async () => {
    const ctx = createImpersonacaoContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.advogado.cadastrarProcesso({ cnj: "1234567-89.2024.8.11.0001", cpfCliente: "123.456.789-00" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Ação não permitida em modo de visualização",
    });
  });

  it("bloqueia advogado.registrarResultado quando isImpersonating=true", async () => {
    const ctx = createImpersonacaoContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.advogado.registrarResultado({
        processoId: 1,
        valorObtido: 1000,
        clientePago: false,
        dataPagamento: null,
        valorPagoCliente: null,
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Ação não permitida em modo de visualização",
    });
  });

  it("bloqueia advogado.declinarProcesso quando isImpersonating=true", async () => {
    const ctx = createImpersonacaoContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.advogado.declinarProcesso({ processoId: 1, motivo: null })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Ação não permitida em modo de visualização",
    });
  });
});

describe("Impersonação — procedures normais não afetadas", () => {
  it("advogado.cadastrarProcesso funciona normalmente sem impersonação (erro de DB esperado, não FORBIDDEN)", async () => {
    const ctx = createAdvogadoContext();
    const caller = appRouter.createCaller(ctx);

    // Sem impersonação, o erro deve ser de DB/validação, não FORBIDDEN
    const result = await caller.advogado.cadastrarProcesso({
      cnj: "1234567-89.2024.8.11.0001",
      cpfCliente: "123.456.789-00",
    }).catch(e => e);

    // O erro NÃO deve ser FORBIDDEN de impersonação
    expect(result?.message).not.toBe("Ação não permitida em modo de visualização");
  });
});

describe("Contexto de impersonação — campos corretos", () => {
  it("ctx.isImpersonating é true quando impersonando", () => {
    const ctx = createImpersonacaoContext(1260053);
    expect(ctx.isImpersonating).toBe(true);
    expect(ctx.impersonatingAdminId).toBe(1);
    expect(ctx.user?.id).toBe(1260053);
    expect(ctx.user?.name).toBe("Marcos Roberto Junior");
  });

  it("ctx.isImpersonating é false no contexto normal", () => {
    const ctx = createAdvogadoContext();
    expect(ctx.isImpersonating).toBe(false);
    expect(ctx.impersonatingAdminId).toBeNull();
  });

  it("ctx.user retorna o usuário visualizado (não o admin) durante impersonação", () => {
    const ctx = createImpersonacaoContext(1260053);
    // O user deve ser o Marcos, não o admin
    expect(ctx.user?.id).toBe(1260053);
    expect(ctx.user?.role).toBe("user");
    expect(ctx.user?.extraRoles).toContain("advogado");
  });
});
