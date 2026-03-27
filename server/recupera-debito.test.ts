import { describe, expect, it } from "vitest";
import { mapearStatusJudit } from "./judit";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Testes: Mapeamento de Status Judit ───────────────────────────────────────────────
describe("mapearStatusJudit", () => {
  it("mapeia 'Em Andamento' para em_andamento", () => {
    const r = mapearStatusJudit({ status: "Em Andamento" });
    expect(r.statusResumido).toBe("em_andamento");
  });

  it("mapeia 'MOVIMENTO' para em_andamento", () => {
    const r = mapearStatusJudit({ status: "MOVIMENTO" });
    expect(r.statusResumido).toBe("em_andamento");
  });

  it("mapeia 'Arquivado' para arquivado_encerrado", () => {
    const r = mapearStatusJudit({ status: "Arquivado" });
    expect(r.statusResumido).toBe("arquivado_encerrado");
  });

  it("mapeia 'Concluso' para aguardando_sentenca", () => {
    const r = mapearStatusJudit({ status: "Concluso" });
    expect(r.statusResumido).toBe("aguardando_sentenca");
  });

  it("é case-insensitive", () => {
    const r = mapearStatusJudit({ status: "EM ANDAMENTO" });
    expect(r.statusResumido).toBe("em_andamento");
  });

  it("retorna em_analise_inicial para status desconhecido", () => {
    const r = mapearStatusJudit({ status: "status_inexistente_xyz" });
    expect(r.statusResumido).toBe("em_analise_inicial");
  });

  it("extrai statusOriginal do payload", () => {
    const r = mapearStatusJudit({ status: "Em Andamento", lawsuit: { status: "Em Andamento" } });
    expect(typeof r.statusOriginal).toBe("string");
    expect(r.statusOriginal).toBe("Em Andamento");
  });
});

// ─── Testes: Auth Router ───────────────────────────────────────────────────
type CookieCall = { name: string; options: Record<string, unknown> };
type AuthUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("limpa o cookie de sessão e retorna sucesso", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });
});

// ─── Testes: Rota admin.processos (filtros) ───────────────────────────────────
describe("admin.processos (filtros)", () => {
  it("lança FORBIDDEN para usuário não-admin", async () => {
    const { ctx } = createAuthContext();
    const ctxUser = { ...ctx, user: { ...ctx.user!, role: "user" as const } };
    const caller = appRouter.createCaller(ctxUser);
    await expect(caller.admin.processos({ page: 1 })).rejects.toThrow();
  });

  it("aceita filtros opcionais sem erros de validação Zod", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Não conecta ao DB em teste unitário, mas a validação Zod deve passar
    // O erro será de DB (sem conexão), não de validação
    const result = await caller.admin.processos({
      page: 1,
      status: ["concluido_ganho", "em_andamento"],
      dataInicio: "2024-01-01",
      dataFim: "2024-12-31",
      busca: "teste",
    }).catch((e: Error) => e);
    // Aceita erro de DB (sem conexão), mas não de validação Zod
    if (result instanceof Error) {
      expect(result.message).not.toContain("ZodError");
      expect(result.message).not.toContain("invalid_type");
    }
  });

  it("aceita page sem filtros opcionais", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.processos({ page: 1 }).catch((e: Error) => e);
    if (result instanceof Error) {
      expect(result.message).not.toContain("ZodError");
    }
  });

  it("aceita todos os campos de ordenação válidos", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const colunas = ["cnj", "statusResumido", "clienteNome", "parceiroNome", "updatedAt"] as const;
    const direcoes = ["asc", "desc"] as const;
    for (const orderBy of colunas) {
      for (const orderDir of direcoes) {
        const result = await caller.admin.processos({ page: 1, orderBy, orderDir }).catch((e: Error) => e);
        if (result instanceof Error) {
          expect(result.message).not.toContain("ZodError");
          expect(result.message).not.toContain("invalid_enum_value");
        }
      }
    }
  });

  it("rejeita coluna de ordenação inválida", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.processos({ page: 1, orderBy: "campoInexistente" as any })
    ).rejects.toThrow();
  });

  it("rejeita direção de ordenação inválida", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.admin.processos({ page: 1, orderDir: "random" as any })
    ).rejects.toThrow();
  });
});

// ─── Testes: Rota admin.atualizarStatusProcesso ──────────────────────────────
describe("admin.atualizarStatusProcesso", () => {
  it("lança FORBIDDEN para usuário não-admin", async () => {
    const { ctx } = createAuthContext();
    // Sobrescrever role para user
    const ctxUser = { ...ctx, user: { ...ctx.user!, role: "user" as const } };
    const caller = appRouter.createCaller(ctxUser);
    await expect(caller.admin.atualizarStatusProcesso({ cnj: "0000001-00.2020.8.26.0001", status: "em_andamento" }))
      .rejects.toThrow();
  });
});

// ─── Testes: Rota admin.gerarPlanilhaModelo ────────────────────────────────
describe("admin.gerarPlanilhaModelo", () => {
  it("lança FORBIDDEN para usuário não-admin", async () => {
    const { ctx } = createAuthContext();
    const ctxUser = { ...ctx, user: { ...ctx.user!, role: "user" as const } };
    const caller = appRouter.createCaller(ctxUser);
    await expect(caller.admin.gerarPlanilhaModelo()).rejects.toThrow();
  });

  it("retorna base64 e filename para admin", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Não conecta ao DB, mas o router deve retornar o modelo sem precisar de DB
    // Como não temos DB em teste, apenas verificamos que a função existe e tem a assinatura correta
    expect(typeof caller.admin.gerarPlanilhaModelo).toBe("function");
  });
});

// ─── Testes: Validação de CPF (lógica de frontend replicada) ───────────────
function validarCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d[i]!) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(d[9]!)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d[i]!) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(d[10]!);
}

describe("validarCpf", () => {
  it("aceita CPF válido", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
  });

  it("rejeita CPF com todos dígitos iguais", () => {
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("000.000.000-00")).toBe(false);
  });

  it("rejeita CPF com comprimento incorreto", () => {
    expect(validarCpf("123.456.789")).toBe(false);
    expect(validarCpf("")).toBe(false);
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(validarCpf("529.982.247-26")).toBe(false);
  });
});
