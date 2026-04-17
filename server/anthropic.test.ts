import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { manusLlmLog } from "../drizzle/schema";
import { sql } from "drizzle-orm";

describe("Manus LLM Log", () => {
  it("tabela manus_llm_log deve existir no banco", async () => {
    const db = await getDb();
    const [rows] = await db.execute(sql`SHOW TABLES LIKE 'manus_llm_log'`);
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as unknown[]).length).toBeGreaterThan(0);
  });

  it("deve conseguir inserir e consultar um log de análise IA", async () => {
    const db = await getDb();
    const testCnj = "TEST-CNJ-VITEST-001";
    await db.insert(manusLlmLog).values({
      processoCnj: testCnj,
      solicitadoPor: 0,
      sucesso: false,
    });
    const [rows] = await db.execute(
      sql`SELECT * FROM manus_llm_log WHERE processo_cnj = ${testCnj} LIMIT 1`
    );
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as unknown[]).length).toBe(1);
    // Limpar
    await db.execute(sql`DELETE FROM manus_llm_log WHERE processo_cnj = ${testCnj}`);
  });
});
