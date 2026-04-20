import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Cliente,
  Convite,
  InsertCliente,
  InsertJuditRequest,
  InsertLogConsulta,
  InsertLogImportacao,
  InsertParceiro,
  InsertProcesso,
  InsertUser,
  Investidor,
  JuditRequest,
  Lote,
  LoteInvestidor,
  Parceiro,
  Processo,
  StatusResumido,
  User,
  clientes,
  convites,
  investidores,
  juditRequests,
  juditConsultaLog,
  logsConsulta,
  importJobs,
  logsImportacao,
  logsImportacaoUnificado,
  loteInvestidores,
  lotes,
  parceiros,
  processos,
  rateLimits,
  users,
  InsertJuditConsultaLog,
  InsertLogImportacaoUnificado,
  manusLlmLog,
  InsertManusLlmLog,
  configuracoes,
  operacoesIdempotentes,
  Configuracao,
  InsertConfiguracao,
  impersonacaoLog,
  ImpersonacaoLog,
  InsertImpersonacaoLog,
  juditProblemas,
  JuditProblema,
  InsertJuditProblema,
  loteImportacaoErros,
  LoteImportacaoErro,
  InsertLoteImportacaoErro,
  LOTE_IMPORTACAO_ERRO_MOTIVO,
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
export async function getProcessosByCpf(cpf: string): Promise<(Processo & { parceiro: Parceiro | null; advogadoInfo: { nome: string | null; whatsapp: string | null; oab: string | null } | null })[]> {
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
    rows.map(async (p) => {
      // Buscar parceiro (legado)
      const parceiro = p.parceiroId ? (await getParceiroById(p.parceiroId)) ?? null : null;
      // Buscar advogado vinculado ao processo
      let advogadoInfo: { nome: string | null; whatsapp: string | null; oab: string | null } | null = null;
      if (p.advogadoId) {
        const adv = await db
          .select({ nome: users.name, whatsapp: users.whatsappSuporte, oab: users.oab })
          .from(users)
          .where(eq(users.id, p.advogadoId))
          .limit(1);
        if (adv[0]) {
          advogadoInfo = { nome: adv[0].nome, whatsapp: adv[0].whatsapp, oab: adv[0].oab };
        }
      }
      return { ...p, parceiro, advogadoInfo };
    })
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
  semInvestidor?: boolean;
  advogado?: string;
  advogadoId?: number | null; // null = sem advogado vinculado
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
    const inicioISO = filtros.dataInicio.toISOString().slice(0, 19).replace('T', ' ');
    condicoes.push(sql`${processos.updatedAt} >= ${inicioISO}`);
  }
  if (filtros?.dataFim) {
    const fim = new Date(filtros.dataFim);
    fim.setHours(23, 59, 59, 999);
    const fimISO = fim.toISOString().slice(0, 19).replace('T', ' ');
    condicoes.push(sql`${processos.updatedAt} <= ${fimISO}`);
  }
  if (filtros?.semInvestidor) {
    condicoes.push(isNull(processos.investidorId));
  } else if (filtros?.investidorId) {
    condicoes.push(eq(processos.investidorId, filtros.investidorId));
  }
  if (filtros?.advogadoId === null) {
    // Filtrar processos sem advogado vinculado
    condicoes.push(isNull(processos.advogadoId));
  } else if (filtros?.advogadoId !== undefined) {
    condicoes.push(eq(processos.advogadoId, filtros.advogadoId));
  } else if (filtros?.advogado && filtros.advogado.trim()) {
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
      advogadoId: processos.advogadoId,
      advogadoNome: users.name,
      updatedAt: processos.updatedAt,
      semAtualizacao7dias: processos.semAtualizacao7dias,
      clienteNome: clientes.nome,
      clienteCpf: clientes.cpf,
      parceiroNome: parceiros.nomeEscritorio,
    })
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .leftJoin(parceiros, eq(processos.parceiroId, parceiros.id))
    .leftJoin(users, eq(processos.advogadoId, users.id));

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
    const inicioISO = filtros.dataInicio.toISOString().slice(0, 19).replace('T', ' ');
    condicoes.push(sql`${logsConsulta.createdAt} >= ${inicioISO}`);
  }
  if (filtros?.dataFim) {
    const fim = new Date(filtros.dataFim);
    fim.setHours(23, 59, 59, 999);
    const fimISO = fim.toISOString().slice(0, 19).replace('T', ' ');
    condicoes.push(sql`${logsConsulta.createdAt} <= ${fimISO}`);
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

export async function vincularInvestidorEmLote(cnjs: string[], investidorId: number, percentual?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let count = 0;
  for (const cnj of cnjs) {
    const updateData: Record<string, unknown> = { investidorId };
    if (percentual !== undefined) updateData.percentualInvestidor = String(percentual);
    await db.update(processos).set(updateData as any).where(eq(processos.cnj, cnj));
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

// ─── Convites ──────────────────────────────────────────────────────────────────
export async function criarConvite(data: {
  token: string;
  roleConvite: "advogado" | "investidor" | "advogado_investidor";
  geradoPor: number;
  expiradoEm?: Date | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(convites).values({
    token: data.token,
    roleConvite: data.roleConvite,
    geradoPor: data.geradoPor,
    expiradoEm: data.expiradoEm ?? null,
    ativo: true,
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getConviteByToken(token: string): Promise<Convite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(convites).where(eq(convites.token, token)).limit(1);
  return result[0];
}

export async function usarConvite(token: string, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(convites)
    .set({ usadoEm: new Date(), usadoPor: userId, ativo: false })
    .where(eq(convites.token, token));
}

export async function revogarConvite(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(convites).set({ ativo: false }).where(eq(convites.id, id));
}

export async function listConvites(opts?: { ativo?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conds: ReturnType<typeof and>[] = [];
  if (opts?.ativo !== undefined) conds.push(eq(convites.ativo, opts.ativo));
  const q = db.select().from(convites).orderBy(desc(convites.geradoEm));
  return conds.length > 0 ? q.where(and(...conds)) : q;
}

// ─── Users: funções adicionais ─────────────────────────────────────────────────
export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function listUsers(opts?: { ativo?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conds: ReturnType<typeof and>[] = [];
  if (opts?.ativo !== undefined) conds.push(eq(users.ativo, opts.ativo));
  const q = db.select().from(users).orderBy(desc(users.createdAt));
  return conds.length > 0 ? q.where(and(...conds)) : q;
}

export async function updateUserAtivo(id: number, ativo: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ ativo }).where(eq(users.id, id));
}

export async function updateUsuarioDados(
  id: number,
  nome: string,
  telefone: string | null,
  oab?: string | null,
  whatsappSuporte?: string | null,
  bio?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    name: nome,
    telefone: telefone ?? null,
    oab: oab !== undefined ? (oab ?? null) : undefined,
    whatsappSuporte: whatsappSuporte !== undefined ? (whatsappSuporte ?? null) : undefined,
    bio: bio !== undefined ? (bio ?? null) : undefined,
  }).where(eq(users.id, id));
}

export async function setUserExtraRoles(userId: number, extraRoles: string[], conviteId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    extraRoles,
    ...(conviteId !== undefined ? { conviteId } : {}),
  }).where(eq(users.id, userId));
}

// ─── Lotes ──────────────────────────────────────────────────────────────────────
export async function criarLoteSimples(data: {
  nome: string;
  descricao?: string | null;
  advogadoId?: number | null;
  percentualEmpresa?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(lotes).values({
    nome: data.nome,
    descricao: data.descricao ?? null,
    advogadoId: data.advogadoId ?? null,
    percentualEmpresa: data.percentualEmpresa !== undefined ? String(data.percentualEmpresa) : "0",
    percentualAdvogado: "0",
    ativo: true,
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getLoteById(id: number): Promise<Lote | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1);
  return result[0];
}

export async function listLotes(opts?: { ativo?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conds: ReturnType<typeof and>[] = [];
  if (opts?.ativo !== undefined) conds.push(eq(lotes.ativo, opts.ativo));
  const q = db.select().from(lotes).orderBy(desc(lotes.createdAt));
  return conds.length > 0 ? q.where(and(...conds)) : q;
}

export async function editarLoteSimples(id: number, data: Partial<{
  nome: string;
  descricao: string | null;
  advogadoId: number | null;
  percentualEmpresa: number;
  ativo: boolean;
}>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {};
  if (data.nome !== undefined) set.nome = data.nome;
  if (data.descricao !== undefined) set.descricao = data.descricao;
  if (data.advogadoId !== undefined) set.advogadoId = data.advogadoId;
  if (data.percentualEmpresa !== undefined) set.percentualEmpresa = String(data.percentualEmpresa);
  if (data.ativo !== undefined) set.ativo = data.ativo;
  if (Object.keys(set).length === 0) return;
  await db.update(lotes).set(set).where(eq(lotes.id, id));
}

export async function adicionarInvestidorLote(loteId: number, investidorId: number, percentual: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Upsert: remover existente e reinserir
  await db.delete(loteInvestidores).where(
    and(eq(loteInvestidores.loteId, loteId), eq(loteInvestidores.investidorId, investidorId))
  );
  await db.insert(loteInvestidores).values({ loteId, investidorId, percentual: String(percentual) });
}

export async function listInvestidoresDoLote(loteId: number): Promise<LoteInvestidor[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(loteInvestidores).where(eq(loteInvestidores.loteId, loteId));
}

export async function vincularProcessoAoLote(processoId: number, loteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({ loteId }).where(eq(processos.id, processoId));
}

// ─── Advogado: processos ────────────────────────────────────────────────────────
export async function listProcessosDoAdvogado(advogadoId: number, page = 1, pageSize = 20) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0 };
  const offset = (page - 1) * pageSize;
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: processos.id,
        cnj: processos.cnj,
        statusResumido: processos.statusResumido,
        statusOriginal: processos.statusOriginal,
        statusJudit: processos.statusJudit,
        clienteNome: clientes.nome,
        clienteCpf: clientes.cpf,
        valorObtido: processos.valorObtido,
        clientePago: processos.clientePago,
        createdAt: processos.createdAt,
        updatedAt: processos.updatedAt,
      })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(eq(processos.advogadoId, advogadoId))
      .orderBy(desc(processos.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(processos)
      .where(eq(processos.advogadoId, advogadoId)),
  ]);
  return { processos: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function metricsAdvogado(advogadoId: number) {
  const db = await getDb();
  if (!db) return { total: 0, emAndamento: 0, concluidoGanho: 0, concluidoPerdido: 0, aguardandoJudit: 0, emAnalise: 0 };
  const rows = await db
    .select({ statusResumido: processos.statusResumido, statusJudit: processos.statusJudit })
    .from(processos)
    .where(eq(processos.advogadoId, advogadoId));

  const m = { total: rows.length, emAndamento: 0, concluidoGanho: 0, concluidoPerdido: 0, aguardandoJudit: 0, emAnalise: 0 };
  for (const r of rows) {
    if (r.statusJudit === "aguardando_aprovacao_judit") m.aguardandoJudit++;
    if (r.statusResumido === "em_analise_inicial") m.emAnalise++;
    if (["em_andamento", "protocolado", "aguardando_audiencia", "aguardando_sentenca", "em_recurso", "cumprimento_de_sentenca"].includes(r.statusResumido)) m.emAndamento++;
    if (r.statusResumido === "concluido_ganho") m.concluidoGanho++;
    if (r.statusResumido === "concluido_perdido") m.concluidoPerdido++;
  }
  return m;
}

export async function registrarResultadoProcesso(processoId: number, data: {
  valorObtido: number | null;
  clientePago: boolean;
  dataPagamentoCliente: Date | null;
  valorPagoCliente: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({
    valorObtido: data.valorObtido !== null ? String(data.valorObtido) : null,
    valorObtidoUpdatedAt: new Date(),
    clientePago: data.clientePago,
    dataPagamentoCliente: data.dataPagamentoCliente,
    valorPagoCliente: data.valorPagoCliente !== null ? String(data.valorPagoCliente) : null,
  }).where(eq(processos.id, processoId));
}

export async function declinarProcesso(processoId: number, motivo: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({
    statusResumido: "arquivado_encerrado",
    motivoDeclinado: motivo,
  }).where(eq(processos.id, processoId));
}

// ─── Fila Judit (admin) ────────────────────────────────────────────────────────
export async function listFilaJudit(page = 1, pageSize = 50) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0 };
  const offset = (page - 1) * pageSize;
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: processos.id,
        cnj: processos.cnj,
        statusResumido: processos.statusResumido,
        statusJudit: processos.statusJudit,
        clienteNome: clientes.nome,
        clienteCpf: clientes.cpf,
        advogadoId: processos.advogadoId,
        createdAt: processos.createdAt,
      })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(eq(processos.statusJudit, "aguardando_aprovacao_judit"))
      .orderBy(asc(processos.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(processos)
      .where(eq(processos.statusJudit, "aguardando_aprovacao_judit")),
  ]);
  return { processos: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function aprovarProcessoJudit(processoId: number, adminId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({
    statusJudit: "consultado",
    aprovadoParaJuditEm: new Date(),
    aprovadoParaJuditPor: adminId,
  }).where(eq(processos.id, processoId));
}

export async function marcarProcessoNaoEncontradoJudit(processoId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({
    statusJudit: "nao_encontrado",
    statusResumido: "em_analise_inicial",
  }).where(eq(processos.id, processoId));
}

// ─── Investidor: processos dos lotes ────────────────────────────────────────────
export async function listProcessosDoInvestidor(investidorUserId: number, page = 1, pageSize = 50) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0, projecaoTotal: 0, percentualMedio: 0 };

  // Buscar lotes onde o investidor está vinculado
  const lotesInv = await db
    .select({ loteId: loteInvestidores.loteId, percentual: loteInvestidores.percentual })
    .from(loteInvestidores)
    .where(eq(loteInvestidores.investidorId, investidorUserId));

  if (lotesInv.length === 0) return { processos: [], total: 0, projecaoTotal: 0, percentualMedio: 0 };

  const loteIds = lotesInv.map(l => l.loteId);
  const percentualMap = new Map(lotesInv.map(l => [l.loteId, Number(l.percentual)]));

  const offset = (page - 1) * pageSize;

  // Buscar processos dos lotes
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: processos.id,
        cnj: processos.cnj,
        statusResumido: processos.statusResumido,
        clienteNome: clientes.nome,
        clienteCpf: clientes.cpf,
        loteId: processos.loteId,
        valorObtido: processos.valorObtido,
        clientePago: processos.clientePago,
        valorPagoCliente: processos.valorPagoCliente,
        updatedAt: processos.updatedAt,
      })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(inArray(processos.loteId, loteIds))
      .orderBy(desc(processos.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(processos)
      .where(inArray(processos.loteId, loteIds)),
  ]);

  // Calcular projeção
  let projecaoTotal = 0;
  let somaPercentual = 0;
  let countPercentual = 0;

  const processosComPercentual = rows.map(p => {
    const percentual = p.loteId ? (percentualMap.get(p.loteId) ?? 0) : 0;
    const valorObtido = p.valorObtido ? Number(p.valorObtido) : 0;
    const valorProjetado = valorObtido * (percentual / 100);
    const valorRecebido = p.clientePago && p.valorPagoCliente ? Number(p.valorPagoCliente) * (percentual / 100) : 0;
    if (percentual > 0) { somaPercentual += percentual; countPercentual++; }
    projecaoTotal += valorProjetado;
    return { ...p, percentual, valorProjetado, valorRecebido };
  });

  return {
    processos: processosComPercentual,
    total: Number(countRows[0]?.count ?? 0),
    projecaoTotal,
    percentualMedio: countPercentual > 0 ? somaPercentual / countPercentual : 0,
  };
}

export async function metricsInvestidor(investidorUserId: number) {
  const db = await getDb();
  if (!db) return { total: 0, emAndamento: 0, ganhos: 0, perdidos: 0, valorTotalDisputa: 0, valorProjetado: 0 };

  const lotesInv = await db
    .select({ loteId: loteInvestidores.loteId, percentual: loteInvestidores.percentual })
    .from(loteInvestidores)
    .where(eq(loteInvestidores.investidorId, investidorUserId));

  if (lotesInv.length === 0) return { total: 0, emAndamento: 0, ganhos: 0, perdidos: 0, valorTotalDisputa: 0, valorProjetado: 0 };

  const loteIds = lotesInv.map(l => l.loteId);
  const percentualMap = new Map(lotesInv.map(l => [l.loteId, Number(l.percentual)]));

  const rows = await db
    .select({ statusResumido: processos.statusResumido, loteId: processos.loteId, valorObtido: processos.valorObtido })
    .from(processos)
    .where(inArray(processos.loteId, loteIds));

  const m = { total: rows.length, emAndamento: 0, ganhos: 0, perdidos: 0, valorTotalDisputa: 0, valorProjetado: 0 };
  for (const r of rows) {
    const percentual = r.loteId ? (percentualMap.get(r.loteId) ?? 0) : 0;
    const valor = r.valorObtido ? Number(r.valorObtido) : 0;
    m.valorTotalDisputa += valor;
    m.valorProjetado += valor * (percentual / 100);
    if (["em_andamento", "protocolado", "aguardando_audiencia", "aguardando_sentenca", "em_recurso", "cumprimento_de_sentenca"].includes(r.statusResumido)) m.emAndamento++;
    if (r.statusResumido === "concluido_ganho") m.ganhos++;
    if (r.statusResumido === "concluido_perdido") m.perdidos++;
  }
  return m;
}

// ─── Advogados e Investidores por extra_roles ────────────────────────────────
export async function listAdvogadosUsuarios() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    extraRoles: users.extraRoles,
    ativo: users.ativo,
  }).from(users).where(eq(users.ativo, true));
  return all.filter((u) => {
    const roles: string[] = Array.isArray(u.extraRoles) ? (u.extraRoles as string[]) : [];
    return roles.includes("advogado") || roles.includes("advogado_investidor");
  });
}

export async function listInvestidoresUsuarios() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    extraRoles: users.extraRoles,
    ativo: users.ativo,
  }).from(users).where(eq(users.ativo, true));
  return all.filter((u) => {
    const roles: string[] = Array.isArray(u.extraRoles) ? (u.extraRoles as string[]) : [];
    return roles.includes("investidor") || roles.includes("advogado_investidor");
  });
}

// ─── Judit Consulta Log ────────────────────────────────────────────────

// Validar se uma string é um UUID v4 válido
function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function insertJuditConsultaLog(data: InsertJuditConsultaLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Validar requestId se fornecido
  if (data.requestId && !isValidUUID(data.requestId)) {
    console.warn(`[insertJuditConsultaLog] requestId inválido para CNJ ${data.processoCnj}: "${data.requestId}" não é um UUID válido`);
    // Salvar como null se inválido
    data.requestId = null;
  }
  
  await db.insert(juditConsultaLog).values(data);
}

export async function listJuditConsultaLog(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(juditConsultaLog).orderBy(desc(juditConsultaLog.createdAt)).limit(limit);
}

export async function countJuditConsultaLog() {
  const db = await getDb();
  if (!db) return { total: 0, custoTotal: 0 };
  const rows = await db
    .select({ total: sql<number>`count(*)`, custo: sql<number>`sum(custo)` })
    .from(juditConsultaLog);
  return { total: Number(rows[0]?.total ?? 0), custoTotal: Number(rows[0]?.custo ?? 0) };
}

// ─── Logs Importação Unificado ─────────────────────────────────────────────
export async function insertLogImportacaoUnificado(data: InsertLogImportacaoUnificado): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(logsImportacaoUnificado).values(data);
  const result = await db
    .select({ id: logsImportacaoUnificado.id })
    .from(logsImportacaoUnificado)
    .orderBy(desc(logsImportacaoUnificado.createdAt))
    .limit(1);
  return result[0]?.id ?? 0;
}

export async function listLogsImportacaoUnificado(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(logsImportacaoUnificado).orderBy(desc(logsImportacaoUnificado.createdAt)).limit(limit);
}

// ─── Judit: Métricas do Painel ─────────────────────────────────────────────
export async function metricsJudit() {
  const db = await getDb();
  if (!db) return { creditoRestante: 1000, consultasMes: 0, requisicaoProcessando: 0, processosNaFila: 0, custoMes: 0, limiteMensal: 1000 };

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  // Usar string ISO para evitar bug de timezone do driver mysql2 com Date objects
  const inicioMesISO = inicioMes.toISOString().slice(0, 19).replace('T', ' ');

  const [logsMes, processando, fila] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)`, custo: sql<number>`sum(custo)` })
      .from(juditConsultaLog)
      .where(sql`${juditConsultaLog.createdAt} >= ${inicioMesISO}`),
    db
      .select({ total: sql<number>`count(*)` })
      .from(juditRequests)
      .where(eq(juditRequests.status, "processing")),
    db
      .select({ total: sql<number>`count(*)` })
      .from(processos)
      .where(eq(processos.statusJudit, "aguardando_aprovacao_judit")),
  ]);

  const custoMes = Number(logsMes[0]?.custo ?? 0);
  const LIMITE_MENSAL = 1000;
  return {
    creditoRestante: Math.max(0, LIMITE_MENSAL - custoMes),
    consultasMes: Number(logsMes[0]?.total ?? 0),
    requisicaoProcessando: Number(processando[0]?.total ?? 0),
    processosNaFila: Number(fila[0]?.total ?? 0),
    custoMes,
    limiteMensal: LIMITE_MENSAL,
  };
}

// ─── Judit: Fila com filtros (busca + advogado) ────────────────────────────
export async function listFilaJuditFiltrada(opts: {
  busca?: string;
  advogadoId?: number;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0 };
  const { busca, advogadoId, page = 1, pageSize = 50 } = opts;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [eq(processos.statusJudit, "aguardando_aprovacao_judit") as ReturnType<typeof eq>];
  if (advogadoId) conditions.push(eq(processos.advogadoId, advogadoId) as ReturnType<typeof eq>);
  if (busca) {
    const like = `%${busca}%`;
    conditions.push(
      or(
        sql`${processos.cnj} LIKE ${like}`,
        sql`${clientes.nome} LIKE ${like}`,
        sql`${clientes.cpf} LIKE ${like}`
      ) as ReturnType<typeof eq>
    );
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: processos.id,
        cnj: processos.cnj,
        statusResumido: processos.statusResumido,
        statusJudit: processos.statusJudit,
        clienteNome: clientes.nome,
        clienteCpf: clientes.cpf,
        advogadoId: processos.advogadoId,
        createdAt: processos.createdAt,
      })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(whereClause)
      .orderBy(asc(processos.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(whereClause),
  ]);

  return { processos: rows, total: Number(countRows[0]?.count ?? 0) };
}

// ─── Judit: Histórico paginado com filtro de período ──────────────────────
export async function listHistoricoJudit(opts: {
  periodo?: "7d" | "30d" | "custom";
  dataInicio?: Date;
  dataFim?: Date;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { registros: [], total: 0, custoTotal: 0 };
  const { periodo = "30d", dataInicio, dataFim, page = 1, pageSize = 50 } = opts;
  const offset = (page - 1) * pageSize;

  let inicioDate: Date;
  const fimDate = dataFim ?? new Date();
  if (periodo === "custom" && dataInicio) {
    inicioDate = dataInicio;
  } else if (periodo === "7d") {
    inicioDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else {
    inicioDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  // Usar strings ISO para evitar bug de timezone do driver mysql2 com Date objects
  const inicioISO = inicioDate.toISOString().slice(0, 19).replace('T', ' ');
  const fimISO = fimDate.toISOString().slice(0, 19).replace('T', ' ');

  const whereClause = and(
    sql`${juditConsultaLog.createdAt} >= ${inicioISO}`,
    sql`${juditConsultaLog.createdAt} <= ${fimISO}`
  );

  const [rows, countRows, custoRows] = await Promise.all([
    db
      .select({
        id: juditConsultaLog.id,
        processoCnj: juditConsultaLog.processoCnj,
        requestId: juditConsultaLog.requestId,
        tipo: juditConsultaLog.tipo,
        custo: juditConsultaLog.custo,
        status: juditConsultaLog.status,
        aprovadoPorId: juditConsultaLog.aprovadoPorId,
        createdAt: juditConsultaLog.createdAt,
        isDuplicata: juditConsultaLog.isDuplicata, // C6: campo para indicar duplicata
      })
      .from(juditConsultaLog)
      .where(whereClause)
      .orderBy(desc(juditConsultaLog.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(juditConsultaLog)
      .where(whereClause),
    db
      .select({ custo: sql<number>`sum(custo)` })
      .from(juditConsultaLog)
      .where(whereClause),
  ]);

  return {
    registros: rows,
    total: Number(countRows[0]?.count ?? 0),
    custoTotal: Number(custoRows[0]?.custo ?? 0),
  };
}

/// ─── Manus LLM Log ────────────────────────────────────────────────────────
export async function insertManusLlmLog(data: InsertManusLlmLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(manusLlmLog).values(data);
}

export async function metricsAnalisesIA() {
  const db = await getDb();
  if (!db) return { totalMes: 0, totalGeral: 0 };
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const [totalMesRows, totalGeralRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(manusLlmLog)
      .where(gte(manusLlmLog.solicitadoEm, inicioMes)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(manusLlmLog),
  ]);
  return {
    totalMes: Number(totalMesRows[0]?.count ?? 0),
    totalGeral: Number(totalGeralRows[0]?.count ?? 0),
  };
}

export async function listAnalisesIA(opts: {
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { registros: [], total: 0 };
  const { page = 1, pageSize = 50 } = opts;
  const offset = (page - 1) * pageSize;
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: manusLlmLog.id,
        processoCnj: manusLlmLog.processoCnj,
        solicitadoPor: manusLlmLog.solicitadoPor,
        solicitadoEm: manusLlmLog.solicitadoEm,
        tokensEntrada: manusLlmLog.tokensEntrada,
        tokensSaida: manusLlmLog.tokensSaida,
        custoEstimado: manusLlmLog.custoEstimado,
        modelo: manusLlmLog.modelo,
        sucesso: manusLlmLog.sucesso,
        nomeUsuario: users.name,
      })
      .from(manusLlmLog)
      .leftJoin(users, eq(manusLlmLog.solicitadoPor, users.id))
      .orderBy(desc(manusLlmLog.solicitadoEm))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(manusLlmLog),
  ]);
  return {
    registros: rows,
    total: Number(countRows[0]?.count ?? 0),
  };
}

// ─── Judit: Buscar processos por CPF no banco local ──────────────────────
export async function buscarProcessosPorCpfLocal(cpf: string) {
  const db = await getDb();
  if (!db) return [];
  const cpfLimpo = cpf.replace(/\D/g, "");
  const rows = await db
    .select({
      id: processos.id,
      cnj: processos.cnj,
      statusResumido: processos.statusResumido,
      statusJudit: processos.statusJudit,
      clienteNome: clientes.nome,
      clienteCpf: clientes.cpf,
    })
    .from(processos)
    .leftJoin(clientes, eq(processos.clienteId, clientes.id))
    .where(eq(clientes.cpf, cpfLimpo));
  return rows;
}

// ─── Configurações do Sistema ──────────────────────────────────────────────
export async function getConfiguracoes(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select({ chave: configuracoes.chave, valor: configuracoes.valor }).from(configuracoes);
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
}

export async function salvarConfiguracao(chave: string, valor: string, adminId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(configuracoes)
    .values({ chave, valor, atualizadoPor: adminId })
    .onDuplicateKeyUpdate({ set: { valor, atualizadoPor: adminId } });
}

export async function salvarConfiguracoes(
  dados: Record<string, string>,
  adminId: number
): Promise<void> {
  for (const [chave, valor] of Object.entries(dados)) {
    await salvarConfiguracao(chave, valor, adminId);
  }
}

// ─── Impersonação (Visualizar como) ───────────────────────────────────────
export async function criarImpersonacao(
  adminId: number,
  usuarioVisualizadoId: number,
  token: string
): Promise<ImpersonacaoLog> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const agora = new Date();
  const expira = new Date(agora.getTime() + 30 * 60 * 1000); // +30 minutos
  await db.insert(impersonacaoLog).values({
    adminId,
    usuarioVisualizadoId,
    token,
    iniciadoEm: agora,
    expiradoEm: expira,
    ativo: true,
  });
  const rows = await db
    .select()
    .from(impersonacaoLog)
    .where(eq(impersonacaoLog.token, token))
    .limit(1);
  return rows[0]!;
}

export async function buscarImpersonacaoPorToken(token: string): Promise<ImpersonacaoLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(impersonacaoLog)
    .where(eq(impersonacaoLog.token, token))
    .limit(1);
  return rows[0];
}

export async function encerrarImpersonacao(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(impersonacaoLog)
    .set({ ativo: false, encerradoEm: new Date() })
    .where(eq(impersonacaoLog.token, token));
}

// ─── Judit: Problemas ──────────────────────────────────────────────────────
export async function detectarERegistrarTimeouts(): Promise<{ registrados: number; cnjs: string[] }> {
  const db = await getDb();
  if (!db) return { registrados: 0, cnjs: [] };

  // Buscar judit_requests com status "processing" há mais de 2 horas
  const doisHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const doisHorasAtrasISO = doisHorasAtras.toISOString().slice(0, 19).replace("T", " ");

  const travados = await db
    .select()
    .from(juditRequests)
    .where(
      and(
        eq(juditRequests.status, "processing"),
        sql`${juditRequests.createdAt} < ${doisHorasAtrasISO}`
      )
    );

  if (travados.length === 0) return { registrados: 0, cnjs: [] };

  const cnjs: string[] = [];
  for (const req of travados) {
    const horasAtras = Math.round((Date.now() - new Date(req.createdAt).getTime()) / 3600000);
    // Verificar se já existe problema registrado para este request_id
    const existente = await db
      .select({ id: juditProblemas.id })
      .from(juditProblemas)
      .where(eq(juditProblemas.requestId, req.requestId))
      .limit(1);

    if (existente.length === 0) {
      await db.insert(juditProblemas).values({
        processoCnj: req.cnj,
        requestId: req.requestId,
        tipo: "webhook_nao_recebido",
        descricao: `Requisição enviada há ${horasAtras} horas sem retorno de webhook`,
        enviadoEm: new Date(req.createdAt),
        tentativas: 1,
      });
    }
    // Marcar judit_request como error
    await db
      .update(juditRequests)
      .set({ status: "error" })
      .where(eq(juditRequests.id, req.id));

    cnjs.push(req.cnj);
  }

  return { registrados: travados.length, cnjs };
}

export async function listarProblemasJudit(opts: { apenasNaoResolvidos?: boolean } = {}): Promise<JuditProblema[]> {
  const db = await getDb();
  if (!db) return [];
  // MySQL/TiDB armazena boolean como TINYINT(1) — usar sql raw para evitar erro de tipo
  const where = opts.apenasNaoResolvidos ? sql`${juditProblemas.resolvido} = 0` : undefined;
  return db
    .select()
    .from(juditProblemas)
    .where(where)
    .orderBy(desc(juditProblemas.detectadoEm));
}

export async function marcarProblemaResolvido(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(juditProblemas)
    .set({ resolvido: true, resolvidoEm: new Date() })
    .where(eq(juditProblemas.id, id));
}

export async function atualizarObservacaoProblema(id: number, observacao: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(juditProblemas)
    .set({ observacao })
    .where(eq(juditProblemas.id, id));
}

export async function incrementarTentativasProblema(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(juditProblemas)
    .set({ tentativas: sql`${juditProblemas.tentativas} + 1` })
    .where(eq(juditProblemas.id, id));
}

export async function countProblemasJudit(): Promise<{ total: number; naoResolvidos: number }> {
  const db = await getDb();
  if (!db) return { total: 0, naoResolvidos: 0 };
  const [totais] = await db
    .select({
      total: sql<number>`count(*)`,
      naoResolvidos: sql<number>`sum(case when ${juditProblemas.resolvido} = false then 1 else 0 end)`,
    })
    .from(juditProblemas);
  return {
    total: Number(totais?.total ?? 0),
    naoResolvidos: Number(totais?.naoResolvidos ?? 0),
  };
}

export async function resetStatusJuditParaFila(cnj: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(processos)
    .set({ statusJudit: "aguardando_aprovacao_judit" })
    .where(eq(processos.cnj, cnj));
}

// ─── Sistema de Lotes ──────────────────────────────────────────────────────────

export interface LoteComMetricas extends Lote {
  advogadoNome: string | null;
  criadoPorNome: string | null;
  totalInvestidores: number;
  totalProcessos: number;
  errosNaoResolvidos: number;
  investidores: Array<{ investidorId: number; investidorNome: string | null; percentual: string }>;
}

export async function listarLotes(): Promise<LoteComMetricas[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: lotes.id,
      nome: lotes.nome,
      descricao: lotes.descricao,
      advogadoId: lotes.advogadoId,
      percentualEmpresa: lotes.percentualEmpresa,
      percentualAdvogado: lotes.percentualAdvogado,
      criadoPor: lotes.criadoPor,
      ativo: lotes.ativo,
      createdAt: lotes.createdAt,
      updatedAt: lotes.updatedAt,
      advogadoNome: sql<string | null>`adv.name`,
      criadoPorNome: sql<string | null>`criador.name`,
    })
    .from(lotes)
    .leftJoin(sql`users adv`, sql`adv.id = ${lotes.advogadoId}`)
    .leftJoin(sql`users criador`, sql`criador.id = ${lotes.criadoPor}`)
    .orderBy(desc(lotes.createdAt));

  // Para cada lote, buscar investidores, contagem de processos e erros
  const result: LoteComMetricas[] = [];
  for (const row of rows) {
    const [investidoresRows, processosCount, errosCount] = await Promise.all([
      db
        .select({
          investidorId: loteInvestidores.investidorId,
          percentual: loteInvestidores.percentual,
          investidorNome: sql<string | null>`u.name`,
        })
        .from(loteInvestidores)
        .leftJoin(sql`users u`, sql`u.id = ${loteInvestidores.investidorId}`)
        .where(eq(loteInvestidores.loteId, row.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(processos)
        .where(eq(processos.loteId, row.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(loteImportacaoErros)
        .where(and(eq(loteImportacaoErros.loteId, row.id), eq(loteImportacaoErros.resolvido, false))),
    ]);

    result.push({
      ...row,
      totalInvestidores: investidoresRows.length,
      totalProcessos: Number(processosCount[0]?.count ?? 0),
      errosNaoResolvidos: Number(errosCount[0]?.count ?? 0),
      investidores: investidoresRows.map(i => ({
        investidorId: i.investidorId,
        investidorNome: i.investidorNome,
        percentual: i.percentual,
      })),
    });
  }
  return result;
}

export interface CriarLoteInput {
  nome: string;
  descricao?: string | null;
  advogadoId?: number | null;
  percentualEmpresa: number;
  percentualAdvogado: number;
  criadoPor: number;
  investidores: Array<{ usuarioId: number; percentual: number }>;
}

function validarSomaPercentuais(percentualEmpresa: number, percentualAdvogado: number, investidores: Array<{ percentual: number }>): void {
  const soma = percentualEmpresa + percentualAdvogado + investidores.reduce((acc, i) => acc + i.percentual, 0);
  if (soma > 49) {
    throw new Error(`A soma dos percentuais não pode ultrapassar 49%. Total atual: ${soma.toFixed(2)}%`);
  }
}

export async function criarLoteCompleto(input: CriarLoteInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  validarSomaPercentuais(input.percentualEmpresa, input.percentualAdvogado, input.investidores);

  const [result] = await db.insert(lotes).values({
    nome: input.nome,
    descricao: input.descricao ?? null,
    advogadoId: input.advogadoId ?? null,
    percentualEmpresa: String(input.percentualEmpresa),
    percentualAdvogado: String(input.percentualAdvogado),
    criadoPor: input.criadoPor,
    ativo: true,
  });

  const loteId = (result as { insertId: number }).insertId;

  if (input.investidores.length > 0) {
    await db.insert(loteInvestidores).values(
      input.investidores.map(inv => ({
        loteId,
        investidorId: inv.usuarioId,
        percentual: String(inv.percentual),
      }))
    );
  }

  return loteId;
}

export interface EditarLoteInput {
  loteId: number;
  nome?: string;
  descricao?: string | null;
  advogadoId?: number | null;
  percentualEmpresa?: number;
  percentualAdvogado?: number;
  investidores?: Array<{ usuarioId: number; percentual: number }>;
}

export async function editarLoteCompleto(input: EditarLoteInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar lote atual para validar soma
  const [loteAtual] = await db.select().from(lotes).where(eq(lotes.id, input.loteId)).limit(1);
  if (!loteAtual) throw new Error("Lote não encontrado");

  const pEmpresa = input.percentualEmpresa ?? Number(loteAtual.percentualEmpresa);
  const pAdvogado = input.percentualAdvogado ?? Number(loteAtual.percentualAdvogado);

  let investidoresFinal: Array<{ percentual: number }>;
  if (input.investidores !== undefined) {
    investidoresFinal = input.investidores;
  } else {
    const existentes = await db.select({ percentual: loteInvestidores.percentual }).from(loteInvestidores).where(eq(loteInvestidores.loteId, input.loteId));
    investidoresFinal = existentes.map(e => ({ percentual: Number(e.percentual) }));
  }

  validarSomaPercentuais(pEmpresa, pAdvogado, investidoresFinal);

  await db.update(lotes).set({
    ...(input.nome !== undefined && { nome: input.nome }),
    ...(input.descricao !== undefined && { descricao: input.descricao }),
    ...(input.advogadoId !== undefined && { advogadoId: input.advogadoId }),
    ...(input.percentualEmpresa !== undefined && { percentualEmpresa: String(input.percentualEmpresa) }),
    ...(input.percentualAdvogado !== undefined && { percentualAdvogado: String(input.percentualAdvogado) }),
  }).where(eq(lotes.id, input.loteId));

  if (input.investidores !== undefined) {
    await db.delete(loteInvestidores).where(eq(loteInvestidores.loteId, input.loteId));
    if (input.investidores.length > 0) {
      await db.insert(loteInvestidores).values(
        input.investidores.map(inv => ({
          loteId: input.loteId,
          investidorId: inv.usuarioId,
          percentual: String(inv.percentual),
        }))
      );
    }
  }
}

export interface ImportarProcessosLoteResult {
  vinculados: number;
  erros: number;
  detalhes: Array<{ cnj: string; status: "vinculado" | "erro"; motivo?: string }>;
}

export async function importarProcessosLote(loteId: number, cnjs: string[]): Promise<ImportarProcessosLoteResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar nome do lote para mensagens de erro
  const [loteAtual] = await db.select({ nome: lotes.nome }).from(lotes).where(eq(lotes.id, loteId)).limit(1);
  if (!loteAtual) throw new Error("Lote não encontrado");

  let vinculados = 0;
  let erros = 0;
  const detalhes: ImportarProcessosLoteResult["detalhes"] = [];

  for (const cnj of cnjs) {
    const cnjLimpo = cnj.trim();
    if (!cnjLimpo) continue;

    // Buscar processo no banco
    const [processo] = await db
      .select({ id: processos.id, loteId: processos.loteId })
      .from(processos)
      .where(eq(processos.cnj, cnjLimpo))
      .limit(1);

    if (!processo) {
      // CNJ não encontrado no banco
      await db.insert(loteImportacaoErros).values({
        loteId,
        cnj: cnjLimpo,
        motivo: "nao_encontrado_banco",
        loteAtualNome: null,
      });
      erros++;
      detalhes.push({ cnj: cnjLimpo, status: "erro", motivo: "CNJ não encontrado no banco interno" });
      continue;
    }

    if (processo.loteId !== null && processo.loteId !== loteId) {
      // Processo já pertence a outro lote
      const [loteExistente] = await db.select({ nome: lotes.nome }).from(lotes).where(eq(lotes.id, processo.loteId)).limit(1);
      const nomeOutroLote = loteExistente?.nome ?? "desconhecido";
      await db.insert(loteImportacaoErros).values({
        loteId,
        cnj: cnjLimpo,
        motivo: "processo_ja_em_lote",
        loteAtualNome: nomeOutroLote,
      });
      erros++;
      detalhes.push({ cnj: cnjLimpo, status: "erro", motivo: `Processo já pertence ao lote "${nomeOutroLote}"` });
      continue;
    }

    // Vincular ao lote
    await db.update(processos).set({ loteId }).where(eq(processos.id, processo.id));
    vinculados++;
    detalhes.push({ cnj: cnjLimpo, status: "vinculado" });
  }

  return { vinculados, erros, detalhes };
}

export async function listarProcessosLote(loteId: number, page = 1, pageSize = 50) {
  const db = await getDb();
  if (!db) return { processos: [], total: 0, valorTotalDisputa: 0 };

  const offset = (page - 1) * pageSize;
  const [rows, countRows, valorRows] = await Promise.all([
    db
      .select({
        id: processos.id,
        cnj: processos.cnj,
        statusResumido: processos.statusResumido,
        valorObtido: processos.valorObtido,
        clienteNome: clientes.nome,
        clienteCpf: clientes.cpf,
        updatedAt: processos.updatedAt,
        ultimaAtualizacaoApi: processos.ultimaAtualizacaoApi,
      })
      .from(processos)
      .leftJoin(clientes, eq(processos.clienteId, clientes.id))
      .where(eq(processos.loteId, loteId))
      .orderBy(desc(processos.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(processos)
      .where(eq(processos.loteId, loteId)),
    db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${processos.valorObtido} AS DECIMAL(15,2))), 0)` })
      .from(processos)
      .where(and(eq(processos.loteId, loteId), sql`${processos.valorObtido} IS NOT NULL`)),
  ]);

  return {
    processos: rows,
    total: Number(countRows[0]?.count ?? 0),
    valorTotalDisputa: Number(valorRows[0]?.total ?? 0),
  };
}

export async function desvincularProcessoLote(processoId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(processos).set({ loteId: null }).where(eq(processos.id, processoId));
}

export async function listarErrosLote(loteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loteImportacaoErros)
    .where(eq(loteImportacaoErros.loteId, loteId))
    .orderBy(desc(loteImportacaoErros.importadoEm));
}

export async function resolverErroLote(erroId: number, observacao: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(loteImportacaoErros)
    .set({ resolvido: true, resolvidoEm: new Date(), observacao })
    .where(eq(loteImportacaoErros.id, erroId));
}

// ─── Idempotência de operações (anti-duplo envio) ────────────────────────────

export async function getOperacaoIdempotente(requestKey: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ resultado: operacoesIdempotentes.resultado })
    .from(operacoesIdempotentes)
    .where(
      and(
        eq(operacoesIdempotentes.requestKey, requestKey),
        // TTL de 5 minutos
        gte(operacoesIdempotentes.criadoEm, new Date(Date.now() - 5 * 60 * 1000))
      )
    )
    .limit(1);
  return row?.resultado ?? null;
}

export async function salvarOperacaoIdempotente(requestKey: string, resultado: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(operacoesIdempotentes).values({
    requestKey,
    resultado: JSON.stringify(resultado),
  }).onDuplicateKeyUpdate({ set: { resultado: JSON.stringify(resultado) } });
}

export async function limparOperacoesExpiradas(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(operacoesIdempotentes)
    .where(lt(operacoesIdempotentes.criadoEm, new Date(Date.now() - 60 * 60 * 1000)));
}

// ─── Cooldown 24h: verificar se CNJ foi consultado recentemente ──────────────

export async function getConsultaRecentePorCnj(cnj: string, horasAtras = 24): Promise<{ requestId: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const limite = new Date(Date.now() - horasAtras * 60 * 60 * 1000);
  const [row] = await db
    .select({ requestId: juditConsultaLog.requestId })
    .from(juditConsultaLog)
    .where(
      and(
        eq(juditConsultaLog.processoCnj, cnj),
        eq(juditConsultaLog.status, "sucesso"),
        eq(juditConsultaLog.isDuplicata, false),
        gte(juditConsultaLog.createdAt, limite)
      )
    )
    .orderBy(desc(juditConsultaLog.createdAt))
    .limit(1);
  return row ?? null;
}

// ─── Ajustar query de crédito restante (excluir duplicatas) ─────────────────

export async function getCustoConsultasMes(excluirDuplicatas = true): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const conditions = [gte(juditConsultaLog.createdAt, inicioMes)];
  if (excluirDuplicatas) {
    conditions.push(eq(juditConsultaLog.isDuplicata, false));
  }
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${juditConsultaLog.custo}), 0)` })
    .from(juditConsultaLog)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}



export async function getConsultaRecenteJudit(cnj: string) {
  const db = await getDb();
  if (!db) return null;
  const [consulta] = await db
    .select()
    .from(juditConsultaLog)
    .where(eq(juditConsultaLog.processoCnj, cnj))
    .orderBy(desc(juditConsultaLog.createdAt))
    .limit(1);
  return consulta ?? null;
}
