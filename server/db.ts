import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Cliente,
  InsertCliente,
  InsertLogConsulta,
  InsertLogImportacao,
  InsertParceiro,
  InsertProcesso,
  InsertUser,
  Parceiro,
  Processo,
  StatusResumido,
  clientes,
  logsConsulta,
  logsImportacao,
  parceiros,
  processos,
  rateLimits,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ─────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Clientes ──────────────────────────────────────────────────────────────
export async function getClienteByCpf(cpf: string): Promise<Cliente | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.cpf, cpf)).limit(1);
  return result[0];
}

export async function upsertCliente(data: InsertCliente): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(clientes)
    .values(data)
    .onDuplicateKeyUpdate({ set: { nome: data.nome } });
  const result = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.cpf, data.cpf)).limit(1);
  return result[0]!.id;
}

// ─── Parceiros ─────────────────────────────────────────────────────────────
export async function upsertParceiro(data: InsertParceiro): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(parceiros)
    .values(data)
    .onDuplicateKeyUpdate({ set: { whatsapp: data.whatsapp, email: data.email } });
  const result = await db
    .select({ id: parceiros.id })
    .from(parceiros)
    .where(eq(parceiros.nomeEscritorio, data.nomeEscritorio))
    .limit(1);
  return result[0]!.id;
}

export async function getParceiroById(id: number): Promise<Parceiro | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(parceiros).where(eq(parceiros.id, id)).limit(1);
  return result[0];
}

export async function listParceiros(): Promise<Parceiro[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(parceiros).orderBy(parceiros.nomeEscritorio);
}

// ─── Processos ─────────────────────────────────────────────────────────────
export async function getProcessosByCpf(cpf: string): Promise<(Processo & { parceiro: Parceiro | null })[]> {
  const db = await getDb();
  if (!db) return [];
  const cliente = await getClienteByCpf(cpf);
  if (!cliente) return [];

  const rows = await db
    .select()
    .from(processos)
    .where(eq(processos.clienteId, cliente.id))
    .orderBy(processos.createdAt);

  const result = await Promise.all(
    rows.map(async (p) => ({
      ...p,
      parceiro: p.parceiroId ? (await getParceiroById(p.parceiroId)) ?? null : null,
    }))
  );
  return result;
}

export async function getProcessoByCnj(cnj: string): Promise<Processo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(processos).where(eq(processos.cnj, cnj)).limit(1);
  return result[0];
}

export async function upsertProcesso(data: InsertProcesso): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(processos)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        clienteId: data.clienteId,
        parceiroId: data.parceiroId,
        advogado: data.advogado,
        statusInterno: data.statusInterno,
      },
    });
  const result = await db.select({ id: processos.id }).from(processos).where(eq(processos.cnj, data.cnj!)).limit(1);
  return result[0]!.id;
}

export async function updateProcessoStatus(
  cnj: string,
  statusResumido: StatusResumido,
  payload: unknown
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({
      statusResumido,
      ultimaAtualizacaoApi: new Date(),
      rawPayload: payload as Record<string, unknown>,
      semAtualizacao7dias: false,
    })
    .where(eq(processos.cnj, cnj));
}

export async function updateMonitoramentoAtivo(cnj: string, ativo: boolean, codiloId?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({ monitoramentoAtivo: ativo, codiloProcessoId: codiloId })
    .where(eq(processos.cnj, cnj));
}

export async function listProcessosPorStatus(status: StatusResumido): Promise<Processo[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processos).where(eq(processos.statusResumido, status)).orderBy(desc(processos.updatedAt));
}

export async function listProcessosSemAtualizacao7dias(): Promise<Processo[]> {
  const db = await getDb();
  if (!db) return [];
  const sete = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(processos)
    .where(
      and(
        eq(processos.semAtualizacao7dias, true)
      )
    )
    .orderBy(desc(processos.updatedAt));
}

export async function marcarProcessosSemAtualizacao(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const sete = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .update(processos)
    .set({ semAtualizacao7dias: true })
    .where(
      and(
        eq(processos.monitoramentoAtivo, true),
        lt(processos.ultimaAtualizacaoApi, sete)
      )
    );
  return (result as unknown as { affectedRows: number }).affectedRows ?? 0;
}

export async function countProcessosPorStatus(): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({ status: processos.statusResumido, count: sql<number>`count(*)` })
    .from(processos)
    .groupBy(processos.statusResumido);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.status] = Number(row.count);
  }
  return map;
}

export async function listAllProcessos(page = 1, pageSize = 50): Promise<Processo[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(processos)
    .orderBy(desc(processos.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

// ─── Rate Limit ────────────────────────────────────────────────────────────
const JANELA_IP_MS = 60 * 1000; // 1 minuto
const MAX_IP = 10;
const JANELA_CPF_MS = 60 * 60 * 1000; // 1 hora
const MAX_CPF = 20;

export async function checkRateLimit(chave: string, isIp: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // permissivo se sem DB

  const janela = isIp ? JANELA_IP_MS : JANELA_CPF_MS;
  const max = isIp ? MAX_IP : MAX_CPF;
  const janelaInicio = new Date(Date.now() - janela);

  const existing = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.chave, chave))
    .limit(1);

  if (!existing[0]) {
    await db.insert(rateLimits).values({ chave, contador: 1, janelaInicio: new Date() });
    return true;
  }

  const record = existing[0];
  if (record.janelaInicio < janelaInicio) {
    // janela expirou, resetar
    await db
      .update(rateLimits)
      .set({ contador: 1, janelaInicio: new Date() })
      .where(eq(rateLimits.chave, chave));
    return true;
  }

  if (record.contador >= max) return false;

  await db
    .update(rateLimits)
    .set({ contador: record.contador + 1 })
    .where(eq(rateLimits.chave, chave));
  return true;
}

// ─── Logs de Consulta ──────────────────────────────────────────────────────
export async function registrarLogConsulta(data: InsertLogConsulta): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(logsConsulta).values(data);
}

export async function listLogsConsulta(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(logsConsulta).orderBy(desc(logsConsulta.createdAt)).limit(limit);
}

// ─── Logs de Importação ────────────────────────────────────────────────────
export async function registrarLogImportacao(data: InsertLogImportacao): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(logsImportacao).values(data);
  const result = await db
    .select({ id: logsImportacao.id })
    .from(logsImportacao)
    .orderBy(desc(logsImportacao.createdAt))
    .limit(1);
  return result[0]!.id;
}

export async function listLogsImportacao(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(logsImportacao).orderBy(desc(logsImportacao.createdAt)).limit(limit);
}
