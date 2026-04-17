import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    isImpersonating: false,
    impersonatingAdminId: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    isImpersonating: false,
    impersonatingAdminId: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createImpersonatingContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "advogado-user",
    email: "advogado@example.com",
    name: "Advogado User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    isImpersonating: true,
    impersonatingAdminId: 1,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Testes de acesso ao router de lotes ─────────────────────────────────────

describe("admin.listarLotes", () => {
  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.listarLotes()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("permite acesso para admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Pode falhar por DB indisponível em teste, mas não deve falhar por FORBIDDEN
    const result = await caller.admin.listarLotes().catch(e => {
      // Se falhar por DB, não é erro de autorização
      if (e.code === "FORBIDDEN") throw e;
      return [] as unknown[];
    });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("admin.novoLote — validação de input", () => {
  it("rejeita nome vazio", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.novoLote({
        nome: "",
        percentualEmpresa: 10,
        percentualAdvogado: 10,
        investidores: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejeita percentual acima de 49", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.novoLote({
        nome: "Lote Teste",
        percentualEmpresa: 50, // acima do máximo
        percentualAdvogado: 0,
        investidores: [],
      })
    ).rejects.toBeDefined();
  });

  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.novoLote({
        nome: "Lote Teste",
        percentualEmpresa: 10,
        percentualAdvogado: 10,
        investidores: [],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.importarProcessosLote — validação de input", () => {
  it("rejeita lista de CNJs vazia", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.importarProcessosLote({ loteId: 1, cnjs: [] })
    ).rejects.toBeDefined();
  });

  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.importarProcessosLote({ loteId: 1, cnjs: ["12345"] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.processosDoLote", () => {
  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.processosDoLote({ loteId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.errosDoLote", () => {
  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.errosDoLote({ loteId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.desvincularProcessoLote", () => {
  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.desvincularProcessoLote({ processoId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.resolverErroLote", () => {
  it("retorna FORBIDDEN para usuário não-admin", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.resolverErroLote({ erroId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Testes de bloqueio de mutations em impersonação ─────────────────────────

describe("Bloqueio de mutations em modo impersonação", () => {
  it("bloqueia admin.novoLote durante impersonação", async () => {
    const ctx = createImpersonatingContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.novoLote({
        nome: "Lote Bloqueado",
        percentualEmpresa: 10,
        percentualAdvogado: 10,
        investidores: [],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("bloqueia admin.importarProcessosLote durante impersonação", async () => {
    const ctx = createImpersonatingContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.importarProcessosLote({ loteId: 1, cnjs: ["12345"] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
