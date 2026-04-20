import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function metricsQualidadeJudit() {
  const db = await getDb();
  if (!db) return { validas: 0, duplicatas: 0, requestIdInvalidos: 0, total: 0, custoDuplicatas: 0, custoDuplicatasFormatado: "R$ 0,00", taxaSucesso: 0 };

  const stats = await db.select({
    validas: sql<number>`SUM(CASE WHEN is_duplicata = false AND request_id_invalido = false THEN 1 ELSE 0 END)`,
    duplicatas: sql<number>`SUM(CASE WHEN is_duplicata = true THEN 1 ELSE 0 END)`,
    requestIdInvalidos: sql<number>`SUM(CASE WHEN request_id_invalido = true THEN 1 ELSE 0 END)`,
    total: sql<number>`COUNT(*)`,
    custoDuplicatas: sql<number>`SUM(CASE WHEN is_duplicata = true THEN custo ELSE 0 END)`,
    sucessos: sql<number>`SUM(CASE WHEN status = 'sucesso' THEN 1 ELSE 0 END)`,
    naoEncontrados: sql<number>`SUM(CASE WHEN status = 'nao_encontrado' THEN 1 ELSE 0 END)`,
  }).from(sql`judit_consulta_log`);

  const custoDuplicatas = Number(stats[0]?.custoDuplicatas ?? 0);
  const custoDuplicatasFormatado = custoDuplicatas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sucessos = Number(stats[0]?.sucessos ?? 0);
  const naoEncontrados = Number(stats[0]?.naoEncontrados ?? 0);
  const totalComResultado = sucessos + naoEncontrados;
  const taxaSucesso = totalComResultado > 0 ? (sucessos / totalComResultado) * 100 : 0;

  return {
    validas: Number(stats[0]?.validas ?? 0),
    duplicatas: Number(stats[0]?.duplicatas ?? 0),
    requestIdInvalidos: Number(stats[0]?.requestIdInvalidos ?? 0),
    total: Number(stats[0]?.total ?? 0),
    custoDuplicatas,
    custoDuplicatasFormatado,
    taxaSucesso: Math.round(taxaSucesso * 100) / 100,
  };
}

export async function listRegistrosProblemáticos(page: number = 1, pageSize: number = 50) {
  const db = await getDb();
  if (!db) return { registros: [], total: 0 };

  const offset = (page - 1) * pageSize;
  const registros = await db.select().from(sql`judit_consulta_log`).where(sql`is_duplicata = true OR request_id_invalido = true`).orderBy(sql`created_at DESC`).limit(pageSize).offset(offset);

  const countResult = await db.select({ total: sql<number>`COUNT(*)` }).from(sql`judit_consulta_log`).where(sql`is_duplicata = true OR request_id_invalido = true`);

  return {
    registros: (registros as any[]).map((r: any) => ({
      ...r,
      custo: Number(r.custo),
    })),
    total: Number(countResult[0]?.total ?? 0),
  };
}

export async function creditoRestanteEsteMs() {
  const db = await getDb();
  if (!db) return { creditoRestante: 0, creditoRestanteFormatado: "R$ 0,00", custoDuplicatas: 0, custoDuplicatasFormatado: "R$ 0,00" };

  // Pegar o crédito do mês atual (somente registros válidos)
  const stats = await db.select({
    custoValido: sql<number>`SUM(CASE WHEN is_duplicata = false AND request_id_invalido = false THEN custo ELSE 0 END)`,
    custoProblematico: sql<number>`SUM(CASE WHEN is_duplicata = true OR request_id_invalido = true THEN custo ELSE 0 END)`,
  }).from(sql`judit_consulta_log`).where(sql`YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())`);

  const custoValido = Number(stats[0]?.custoValido ?? 0);
  const custoProblematico = Number(stats[0]?.custoProblematico ?? 0);
  const creditoRestante = 1000 - custoValido; // Limite mensal de R$ 1000

  return {
    creditoRestante: Math.max(0, creditoRestante),
    creditoRestanteFormatado: Math.max(0, creditoRestante).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    custoDuplicatas: custoProblematico,
    custoDuplicatasFormatado: custoProblematico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  };
}
