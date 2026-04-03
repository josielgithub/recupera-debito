import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Cliente,
  InsertCliente,
  InsertJuditRequest,
  InsertLogConsulta,
  InsertLogImportacao,
  InsertParceiro,
  InsertProcesso,
  InsertUser,
  Investidor,
  JuditRequest,
  Parceiro,
  Processo,
  StatusResumido,
  clientes,
  investidores,
  juditRequests,
  logsConsulta,
  importJobs,
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
  if (data.cpf) {
    // Com CPF: upsert por CPF
    await db
      .insert(clientes)
      .values(data)
      .onDuplicateKeyUpdate({ set: { nome: data.nome } });
    const result = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.cpf, data.cpf)).limit(1);
    return result[0]!.id;
  } else {
    // Sem CPF: inserir ou buscar por nome exato
    const existing = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.nome, data.nome)).limit(1);
    if (existing[0]) return existing[0].id;
    await db.insert(clientes).values(data);
    const result = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.nome, data.nome)).limit(1);
    return result[0]!.id;
  }
}

/**
 * Extrai o nome do cliente do campo `name` do payload Judit.
 * Padrão: "NOME DO CLIENTE X NOME DO RÉU" — retorna a parte antes do " X ".
 */
export function extrairNomeClienteDoPayload(payloadName: string | null | undefined): string | null {
  if (!payloadName) return null;
  const partes = payloadName.split(/ X /i);
  const nome = partes[0]?.trim() ?? null;
  return nome && nome.length > 1 ? nome : null;
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

export async function getProcessoByCnj(cnj: string): Promise<(Processo & { clienteNome: string | null; clienteCpf: string | null; parceiroNome: string | null }) | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  // Buscar processo base
  const base = await db.select().from(processos).where(eq(processos.cnj, cnj)).limit(1);
  if (!base[0]) return undefined;
  const p = base[0];
  // Buscar cliente
  let clienteNome: string | null = null;
  let clienteCpf: string | null = null;
  if (p.clienteId) {
    const cli = await db.select({ nome: clientes.nome, cpf: clientes.cpf }).from(clientes).where(eq(clientes.id, p.clienteId)).limit(1);
    clienteNome = cli[0]?.nome ?? null;
    clienteCpf = cli[0]?.cpf ?? null;
  }
  // Buscar parceiro
  let parceiroNome: string | null = null;
  if (p.parceiroId) {
    const par = await db.select({ nome: parceiros.nomeEscritorio }).from(parceiros).where(eq(parceiros.id, p.parceiroId)).limit(1);
    parceiroNome = par[0]?.nome ?? null;
  }
  return { ...p, clienteNome, clienteCpf, parceiroNome };
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
        statusOriginal: data.statusOriginal,
      },
    });
  const result = await db.select({ id: processos.id }).from(processos).where(eq(processos.cnj, data.cnj!)).limit(1);
  return result[0]!.id;
}

export async function updateProcessoStatus(
  cnj: string,
  statusResumido: StatusResumido,
  statusOriginal: string,
  payload: unknown,
  juditProcessId?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({
      statusResumido,
      statusOriginal,
      ultimaAtualizacaoApi: new Date(),
      rawPayload: payload as Record<string, unknown>,
      semAtualizacao7dias: false,
      ...(juditProcessId ? { juditProcessId } : {}),
    })
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

type OrderByColuna = "cnj" | "statusResumido" | "clienteNome" | "parceiroNome" | "updatedAt";

interface FiltrosProcessos {
  status?: StatusResumido[];
  dataInicio?: Date;
  dataFim?: Date;
  busca?: string;
  orderBy?: OrderByColuna;
  orderDir?: "asc" | "desc";
  investidorId?: number;
  advogado?: string;
}

export async function listAllProcessos(page = 1, pageSize = 50, filtros?: FiltrosProcessos) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0 };

  // Construir condições WHERE dinamicamente
  const condicoes: ReturnType<typeof and>[] = [];

  if (filtros?.status && filtros.status.length > 0) {
    condicoes.push(inArray(processos.statusResumido, filtros.status));
  }
  if (filtros?.dataInicio) {
    condicoes.push(gte(processos.updatedAt, filtros.dataInicio));
  }
  if (filtros?.dataFim) {
    const fim = new Date(filtros.dataFim);
    fim.setHours(23, 59, 59, 999);
    condicoes.push(lte(processos.updatedAt, fim));
  }
  if (filtros?.investidorId) {
    condicoes.push(eq(processos.investidorId, filtros.investidorId));
  }
  if (filtros?.advogado && filtros.advogado.trim()) {
    condicoes.push(sql`${processos.advogado} LIKE ${'%' + filtros.advogado.trim() + '%'}`);
  }

  const whereClause = condicoes.length > 0 ? and(...condicoes) : undefined;

  // Mapear coluna de ordenação para expressão Drizzle
  const dir = filtros?.orderDir ?? "desc";
  const colunaOrdem = (() => {
    const col = filtros?.orderBy ?? "updatedAt";
    const colMap = {
      cnj: processos.cnj,
      statusResumido: processos.statusResumido,
      clienteNome: clientes.nome,
      parceiroNome: parceiros.nomeEscritorio,
      updatedAt: processos.updatedAt,
    } as const;
    const expr = colMap[col];
    return dir === "asc" ? asc(expr) : desc(expr);
  })();

  const baseQuery = db
    .select({
      id: processos.id,
      cnj: processos.cnj,
      statusResumido: processos.statusResumido,
      statusOriginal: processos.statusOriginal,
      advogado: processos.advogado,
      updatedAt: processos.updatedAt,
      semAtualizacao7dias: processos.semAtualizacao7dias,
      clienteNome: clientes.nome,
      clienteCpf: clientes.cpf,
      parceiroNome: parceiros.nomeEscritorio,
    })
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .leftJoin(parceiros, eq(processos.parceiroId, parceiros.id));

  const countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .leftJoin(parceiros, eq(processos.parceiroId, parceiros.id));

  const [rows, countRows] = await Promise.all([
    (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(colunaOrdem)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    (whereClause ? countQuery.where(whereClause) : countQuery),
  ]);

  // Filtro de busca textual em memória (CNJ, nome, CPF, parceiro)
  let resultado = rows;
  if (filtros?.busca && filtros.busca.trim()) {
    const termo = filtros.busca.trim().toLowerCase();
    resultado = rows.filter(
      (p) =>
        p.cnj.toLowerCase().includes(termo) ||
        (p.clienteNome ?? "").toLowerCase().includes(termo) ||
        (p.clienteCpf ?? "").includes(termo) ||
        (p.parceiroNome ?? "").toLowerCase().includes(termo)
    );
  }

  return { processos: resultado, total: Number(countRows[0]?.count ?? 0) };
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

export async function listLogsConsulta(
  page = 1,
  pageSize = 50,
  filtros?: { resultado?: string; dataInicio?: Date; dataFim?: Date; telefone?: string }
) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };

  const condicoes: ReturnType<typeof and>[] = [];
  if (filtros?.resultado) {
    condicoes.push(eq(logsConsulta.resultado, filtros.resultado as "encontrado" | "nao_encontrado" | "bloqueado"));
  }
  if (filtros?.dataInicio) {
    condicoes.push(gte(logsConsulta.createdAt, filtros.dataInicio));
  }
  if (filtros?.dataFim) {
    const fim = new Date(filtros.dataFim);
    fim.setHours(23, 59, 59, 999);
    condicoes.push(lte(logsConsulta.createdAt, fim));
  }

  const whereClause = condicoes.length > 0 ? and(...condicoes) : undefined;

  const baseQ = db.select().from(logsConsulta);
  const countQ = db.select({ count: sql<number>`count(*)` }).from(logsConsulta);

  const [logs, countRows] = await Promise.all([
    (whereClause ? baseQ.where(whereClause) : baseQ)
      .orderBy(desc(logsConsulta.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    (whereClause ? countQ.where(whereClause) : countQ),
  ]);

  // Filtro de telefone em memória (busca parcial)
  let resultado = logs;
  if (filtros?.telefone) {
    const t = filtros.telefone.replace(/\D/g, "");
    resultado = logs.filter((l) => l.telefone?.replace(/\D/g, "").includes(t));
  }

  return { logs: resultado, total: Number(countRows[0]?.count ?? 0) };
}

// ─── Resumo Mensal ────────────────────────────────────────────────────────────
export async function resumoMensal() {
  const db = await getDb();
  if (!db) return { mesAtual: 0, mesAnterior: 0, variacao: 0, ganhosMes: 0, emAndamentoMes: 0, semAtualizacaoMes: 0 };

  const agora = new Date();

  // Início e fim do mês atual
  const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMesAtual = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);

  // Início e fim do mês anterior
  const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 1);

  // Total de processos atualizados no mês atual
  const [rowAtual] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(processos)
    .where(and(gte(processos.updatedAt, inicioMesAtual), lt(processos.updatedAt, fimMesAtual)));

  // Total de processos atualizados no mês anterior
  const [rowAnterior] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(processos)
    .where(and(gte(processos.updatedAt, inicioMesAnterior), lt(processos.updatedAt, fimMesAnterior)));

  // Ganhos no mês atual
  const [rowGanhos] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(processos)
    .where(and(
      gte(processos.updatedAt, inicioMesAtual),
      lt(processos.updatedAt, fimMesAtual),
      eq(processos.statusResumido, "concluido_ganho")
    ));

  // Em andamento no mês atual
  const [rowAndamento] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(processos)
    .where(and(
      gte(processos.updatedAt, inicioMesAtual),
      lt(processos.updatedAt, fimMesAtual),
      eq(processos.statusResumido, "em_andamento")
    ));

  // Sem atualização há 7 dias (marcados)
  const [rowSemAtu] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(processos)
    .where(eq(processos.semAtualizacao7dias, true));

  const mesAtual = Number(rowAtual?.count ?? 0);
  const mesAnterior = Number(rowAnterior?.count ?? 0);
  const variacao = mesAnterior === 0
    ? (mesAtual > 0 ? 100 : 0)
    : Math.round(((mesAtual - mesAnterior) / mesAnterior) * 100);

  return {
    mesAtual,
    mesAnterior,
    variacao,
    ganhosMes: Number(rowGanhos?.count ?? 0),
    emAndamentoMes: Number(rowAndamento?.count ?? 0),
    semAtualizacaoMes: Number(rowSemAtu?.count ?? 0),
  };
}

// ─── Gráfico de Status de Processos por Mês ────────────────────────────────────────────
export async function graficoStatusProcessos(meses = 6) {
  const db = await getDb();
  if (!db) return [];

  // Busca todos os processos com updatedAt no período
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses + 1);
  desde.setDate(1);
  desde.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      statusResumido: processos.statusResumido,
      updatedAt: processos.updatedAt,
    })
    .from(processos)
    .where(gte(processos.updatedAt, desde));

  // Monta mapa de meses
  const mapa = new Map<string, Record<string, number>>();
  for (let i = 0; i < meses; i++) {
    const d = new Date(desde);
    d.setMonth(d.getMonth() + i);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mapa.set(chave, {});
  }

  for (const row of rows) {
    const d = new Date(row.updatedAt);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entrada = mapa.get(chave);
    if (!entrada) continue;
    const s = row.statusResumido;
    entrada[s] = (entrada[s] ?? 0) + 1;
  }

  return Array.from(mapa.entries()).map(([mes, counts]) => ({ mes, ...counts }));
}

// ─── Gráfico de Consultas Diárias ────────────────────────────────────────────
export async function graficoConsultasDiarias(dias = 30) {
  const db = await getDb();
  if (!db) return [];

  const desde = new Date();
  desde.setDate(desde.getDate() - dias + 1);
  desde.setHours(0, 0, 0, 0);

  // Busca todos os logs no período
  const rows = await db
    .select({
      createdAt: logsConsulta.createdAt,
      resultado: logsConsulta.resultado,
    })
    .from(logsConsulta)
    .where(gte(logsConsulta.createdAt, desde))
    .orderBy(asc(logsConsulta.createdAt));

  // Agrupa por data e resultado em memória
  const mapa = new Map<string, { encontrado: number; nao_encontrado: number; bloqueado: number; total: number }>();

  // Pré-preenche todos os dias do período com zeros
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    const chave = d.toISOString().slice(0, 10);
    mapa.set(chave, { encontrado: 0, nao_encontrado: 0, bloqueado: 0, total: 0 });
  }

  for (const row of rows) {
    const chave = new Date(row.createdAt).toISOString().slice(0, 10);
    const entrada = mapa.get(chave);
    if (!entrada) continue;
    entrada.total++;
    if (row.resultado === "encontrado") entrada.encontrado++;
    else if (row.resultado === "nao_encontrado") entrada.nao_encontrado++;
    else if (row.resultado === "bloqueado") entrada.bloqueado++;
  }

  return Array.from(mapa.entries()).map(([data, counts]) => ({ data, ...counts }));
}

// ─── Judit Requests ───────────────────────────────────────────────────────
export async function upsertJuditRequest(data: InsertJuditRequest): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(juditRequests)
    .values(data)
    .onDuplicateKeyUpdate({ set: { status: data.status, updatedAt: new Date() } });
}

export async function getJuditRequestByCnj(cnj: string): Promise<JuditRequest | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(juditRequests)
    .where(eq(juditRequests.cnj, cnj))
    .orderBy(desc(juditRequests.createdAt))
    .limit(1);
  return result[0];
}

export async function listAllJuditRequestsByCnj(cnj: string): Promise<JuditRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(juditRequests).where(eq(juditRequests.cnj, cnj)).orderBy(desc(juditRequests.createdAt));
}

export async function listJuditRequestsByStatus(status: "processing" | "completed" | "error"): Promise<JuditRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(juditRequests).where(eq(juditRequests.status, status)).orderBy(desc(juditRequests.createdAt));
}

export async function updateJuditRequestStatus(requestId: string, status: "processing" | "completed" | "error"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(juditRequests).set({ status, updatedAt: new Date() }).where(eq(juditRequests.requestId, requestId));
}

export async function listProcessosSemAtualizacaoJudit(diasMinimos = 7): Promise<Processo[]> {
  const db = await getDb();
  if (!db) return [];
  const limite = new Date(Date.now() - diasMinimos * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(processos)
    .where(
      and(
        lt(processos.ultimaAtualizacaoApi, limite)
      )
    )
    .orderBy(asc(processos.ultimaAtualizacaoApi))
    .limit(100);
}

export async function countJuditRequests(): Promise<{ total: number; processing: number; completed: number; error: number }> {
  const db = await getDb();
  if (!db) return { total: 0, processing: 0, completed: 0, error: 0 };
  const rows = await db
    .select({ status: juditRequests.status, count: sql<number>`count(*)` })
    .from(juditRequests)
    .groupBy(juditRequests.status);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.status] = Number(r.count);
  return {
    total: Object.values(map).reduce((a, b) => a + b, 0),
    processing: map.processing ?? 0,
    completed: map.completed ?? 0,
    error: map.error ?? 0,
  };
}

// ─── Judit: listar processos com status de requisição ───────────────────────
export async function listJuditProcessos(opts: {
  page?: number;
  pageSize?: number;
  statusRequisicao?: "processing" | "completed" | "error" | "sem_requisicao";
  statusResumido?: string;
  busca?: string;
}) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0 };

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;

  // Subquery: última requisição Judit por CNJ
  const ultimaReq = db
    .select({
      cnj: juditRequests.cnj,
      status: sql<string>`MAX(${juditRequests.status})`.as("req_status"),
      updatedAt: sql<Date>`MAX(${juditRequests.updatedAt})`.as("req_updated"),
    })
    .from(juditRequests)
    .groupBy(juditRequests.cnj)
    .as("ultima_req");

  const condicoes: ReturnType<typeof and>[] = [];

  if (opts.statusResumido) {
    condicoes.push(eq(processos.statusResumido, opts.statusResumido as StatusResumido));
  }

  const whereClause = condicoes.length > 0 ? and(...condicoes) : undefined;

  const baseSelect = {
    id: processos.id,
    cnj: processos.cnj,
    statusResumido: processos.statusResumido,
    statusOriginal: processos.statusOriginal,
    advogado: processos.advogado,
    ultimaAtualizacaoApi: processos.ultimaAtualizacaoApi,
    updatedAt: processos.updatedAt,
    semAtualizacao7dias: processos.semAtualizacao7dias,
    clienteNome: clientes.nome,
    clienteCpf: clientes.cpf,
    parceiroNome: parceiros.nomeEscritorio,
    reqStatus: ultimaReq.status,
    reqUpdatedAt: ultimaReq.updatedAt,
  };

  let baseQuery = db
    .select(baseSelect)
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .leftJoin(parceiros, eq(processos.parceiroId, parceiros.id))
    .leftJoin(ultimaReq, eq(processos.cnj, ultimaReq.cnj));

  let countBase = db
    .select({ count: sql<number>`count(*)` })
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .leftJoin(parceiros, eq(processos.parceiroId, parceiros.id))
    .leftJoin(ultimaReq, eq(processos.cnj, ultimaReq.cnj));

  const [rows, countRows] = await Promise.all([
    (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(desc(processos.updatedAt))
      .limit(pageSize * 5) // busca mais para filtrar em memória
      .offset(0),
    (whereClause ? countBase.where(whereClause) : countBase),
  ]);

  // Filtros em memória (statusRequisicao e busca)
  let resultado = rows;

  if (opts.statusRequisicao) {
    if (opts.statusRequisicao === "sem_requisicao") {
      resultado = resultado.filter(r => !r.reqStatus);
    } else {
      resultado = resultado.filter(r => r.reqStatus === opts.statusRequisicao);
    }
  }

  if (opts.busca && opts.busca.trim()) {
    const termo = opts.busca.trim().toLowerCase();
    resultado = resultado.filter(
      (p) =>
        p.cnj.toLowerCase().includes(termo) ||
        (p.clienteNome ?? "").toLowerCase().includes(termo) ||
        (p.clienteCpf ?? "").includes(termo) ||
        (p.parceiroNome ?? "").toLowerCase().includes(termo)
    );
  }

  const total = resultado.length;
  const paginado = resultado.slice((page - 1) * pageSize, page * pageSize);

  return { processos: paginado, total };
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

// ─── Criar ou atualizar processo a partir do payload Judit ──────────────────────
/**
 * Cria um novo processo no banco a partir dos dados retornados pela Judit,
 * ou atualiza o payload/status se já existir.
 * Retorna { id, criado: true/false }.
 */
export async function upsertProcessoFromJudit(
  cnj: string,
  statusResumido: StatusResumido,
  statusOriginal: string,
  payload: unknown,
  requestId?: string
): Promise<{ id: number; criado: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Verificar se já existe
  const existing = await db.select({ id: processos.id }).from(processos).where(eq(processos.cnj, cnj)).limit(1);

  if (existing[0]) {
    // Já existe — apenas atualiza payload e status
    await db
      .update(processos)
      .set({
        statusResumido,
        statusOriginal,
        ultimaAtualizacaoApi: new Date(),
        rawPayload: payload as Record<string, unknown>,
        semAtualizacao7dias: false,
        ...(requestId ? { juditProcessId: requestId } : {}),
      })
      .where(eq(processos.cnj, cnj));
    return { id: existing[0].id, criado: false };
  }

  // Não existe — criar novo processo
  // clienteId é nullable no banco real; usamos 0 como placeholder e vinculamos depois
  await db.insert(processos).values({
    cnj,
    statusResumido,
    statusOriginal,
    ultimaAtualizacaoApi: new Date(),
    rawPayload: payload as Record<string, unknown>,
    semAtualizacao7dias: false,
    fonteAtualizacao: "judit",
    ...(requestId ? { juditProcessId: requestId } : {}),
  } as unknown as typeof processos.$inferInsert);

  const result = await db.select({ id: processos.id }).from(processos).where(eq(processos.cnj, cnj)).limit(1);
  return { id: result[0]!.id, criado: true };
}

// ─── Vincular cliente ao processo ─────────────────────────────────────────────
/**
 * Atualiza o cliente_id de um processo pelo CNJ.
 * Usado para vincular retroativamente clientes extraídos do payload Judit.
 */
export async function vincularClienteAoProcesso(cnj: string, clienteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({ clienteId }).where(eq(processos.cnj, cnj));
}

// ─── Análise IA (Judit IA) ─────────────────────────────────────────────────
/**
 * Salva o resumo gerado pela Judit IA no processo.
 */
export async function updateAiSummary(cnj: string, aiSummary: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({ aiSummary, aiSummaryUpdatedAt: new Date() })
    .where(eq(processos.cnj, cnj));
}

// ─── Atualizar valor obtido de um processo ─────────────────────────────────
export async function updateValorObtido(cnj: string, valorObtido: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({
      valorObtido: valorObtido !== null ? String(valorObtido) : null,
      valorObtidoUpdatedAt: new Date(),
    })
    .where(eq(processos.cnj, cnj));
}

// ─── Import Jobs ────────────────────────────────────────────────────────────
export async function criarImportJob(nomeArquivo: string, totalLinhas: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(importJobs).values({
    nomeArquivo,
    totalLinhas,
    status: "importando",
    detalhes: [],
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getImportJob(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateImportJob(id: number, data: Partial<{
  linhasImportadas: number;
  linhasErro: number;
  linhasConciliadas: number;
  linhasNaoEncontradas: number;
  status: "importando" | "conciliando" | "concluido" | "erro";
  detalhes: unknown[];
}>) {
  const db = await getDb();
  if (!db) return;
  await db.update(importJobs).set(data).where(eq(importJobs.id, id));
}

export async function listImportJobs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(limit);
}

// ─── Investidores ──────────────────────────────────────────────────────────────────────

export async function listInvestidores(): Promise<Investidor[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(investidores).orderBy(investidores.nome);
}

export async function upsertInvestidor(nome: string, percentualParticipacao?: number | null): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Tentar inserir; se já existe, retornar o id existente
  await db
    .insert(investidores)
    .values({ nome, percentualParticipacao: percentualParticipacao != null ? String(percentualParticipacao) : null })
    .onDuplicateKeyUpdate({ set: { nome } });
  const rows = await db.select({ id: investidores.id }).from(investidores).where(eq(investidores.nome, nome)).limit(1);
  return rows[0]?.id ?? 0;
}

export async function vincularInvestidorAoProcesso(cnj: string, investidorId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({ investidorId }).where(eq(processos.cnj, cnj));
}

export async function vincularInvestidorEmLote(cnjs: string[], investidorId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let count = 0;
  for (const cnj of cnjs) {
    await db.update(processos).set({ investidorId }).where(eq(processos.cnj, cnj));
    count++;
  }
  return count;
}

export async function getDashboardInvestidores() {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os investidores
  const todos = await db.select().from(investidores).orderBy(investidores.nome);

  // Para cada investidor, contar processos por status
  const resultado = [];
  for (const inv of todos) {
    const procs = await db
      .select({ statusResumido: processos.statusResumido })
      .from(processos)
      .where(eq(processos.investidorId, inv.id));

    const contagem = {
      total: procs.length,
      em_andamento: 0,
      aguardando_sentenca: 0,
      cumprimento_de_sentenca: 0,
      concluido_ganho: 0,
      concluido_perdido: 0,
      outros: 0,
    };
    for (const p of procs) {
      const s = p.statusResumido;
      if (s === "em_andamento" || s === "protocolado" || s === "em_recurso" || s === "aguardando_audiencia") contagem.em_andamento++;
      else if (s === "aguardando_sentenca") contagem.aguardando_sentenca++;
      else if (s === "cumprimento_de_sentenca") contagem.cumprimento_de_sentenca++;
      else if (s === "concluido_ganho" || s === "acordo_negociacao") contagem.concluido_ganho++;
      else if (s === "concluido_perdido") contagem.concluido_perdido++;
      else contagem.outros++;
    }

    resultado.push({
      id: inv.id,
      nome: inv.nome,
      percentualParticipacao: inv.percentualParticipacao,
      ...contagem,
    });
  }

  return resultado;
}

export async function getProcessosSemInvestidor(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: processos.id,
      cnj: processos.cnj,
      statusResumido: processos.statusResumido,
      clienteId: processos.clienteId,
    })
    .from(processos)
    .where(isNull(processos.investidorId))
    .limit(limit);
}
