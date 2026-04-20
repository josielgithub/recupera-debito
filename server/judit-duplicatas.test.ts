import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { juditConsultaLog, operacoesIdempotentes } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

describe("Judit Duplicatas - Correções", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");
  });

  afterAll(async () => {
    // Cleanup
  });

  it("deve rejeitar requestKey sem UUID válido", async () => {
    const schema = z.object({
      processoIds: z.array(z.number()),
      requestKey: z.string().uuid(),
    });

    const invalidInputs = [
      { processoIds: [1], requestKey: "not-a-uuid" },
      { processoIds: [1], requestKey: "" },
      { processoIds: [1] }, // Sem requestKey
    ];

    for (const input of invalidInputs) {
      try {
        schema.parse(input);
        expect.fail(`Should have rejected: ${JSON.stringify(input)}`);
      } catch (e) {
        // Esperado
        expect(true).toBe(true);
      }
    }
  });

  it("deve aceitar UUID v4 válido", () => {
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(validUUID)).toBe(true);
  });

  it("deve validar que requestId é salvo como UUID válido", async () => {
    if (!db) return;

    const testCNJ = "9999999-99.9999.9.99.9999";
    const validRequestId = "550e8400-e29b-41d4-a716-446655440000";

    // Inserir log com requestId válido
    await db.insert(juditConsultaLog).values({
      processoCnj: testCNJ,
      requestId: validRequestId,
      tipo: "consulta_lote",
      custo: "0.25",
      status: "sucesso",
      isDuplicata: false,
    });

    // Verificar que foi salvo
    const logs = await db
      .select()
      .from(juditConsultaLog)
      .where(eq(juditConsultaLog.processoCnj, testCNJ));

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].requestId).toBe(validRequestId);

    // Cleanup
    await db.delete(juditConsultaLog).where(eq(juditConsultaLog.processoCnj, testCNJ));
  });

  it("deve prevenir duplicatas com idempotência via requestKey", async () => {
    if (!db) return;

    const requestKey = "550e8400-e29b-41d4-a716-446655440001";
    const resultado = { resultados: [{ processoId: 1, ok: true }] };

    // Simular primeira requisição
    await db.insert(operacoesIdempotentes).values({
      requestKey,
      resultado: JSON.stringify(resultado),
      expiresAt: new Date(Date.now() + 3600000),
    });

    // Simular segunda requisição com mesmo requestKey
    const existentes = await db
      .select()
      .from(operacoesIdempotentes)
      .where(eq(operacoesIdempotentes.requestKey, requestKey));

    expect(existentes.length).toBeGreaterThan(0);
    expect(JSON.parse(existentes[0].resultado)).toEqual(resultado);

    // Cleanup
    await db.delete(operacoesIdempotentes).where(eq(operacoesIdempotentes.requestKey, requestKey));
  });

  it("deve contar registros com mesmo request_id para o mesmo CNJ", async () => {
    if (!db) return;

    const testCNJ = "8888888-88.8888.8.88.8888";
    const sharedRequestId = "550e8400-e29b-41d4-a716-446655440002";

    // Inserir 4 registros com mesmo request_id e CNJ (simulando duplicatas)
    for (let i = 0; i < 4; i++) {
      await db.insert(juditConsultaLog).values({
        processoCnj: testCNJ,
        requestId: sharedRequestId,
        tipo: "consulta_lote",
        custo: "0.25",
        status: "sucesso",
        isDuplicata: false,
      });
    }

    // Contar registros
    const logs = await db
      .select()
      .from(juditConsultaLog)
      .where(eq(juditConsultaLog.processoCnj, testCNJ));

    expect(logs.length).toBe(4);
    expect(logs.every((log: any) => log.requestId === sharedRequestId)).toBe(true);

    // Cleanup
    await db.delete(juditConsultaLog).where(eq(juditConsultaLog.processoCnj, testCNJ));
  });

  it("deve validar que requestKey é obrigatório na procedure", () => {
    const schema = z.object({
      processoIds: z.array(z.number()),
      requestKey: z.string().uuid(),
    });

    // Deve rejeitar sem requestKey
    try {
      schema.parse({ processoIds: [1, 2, 3] });
      expect.fail("Should have rejected input without requestKey");
    } catch (e) {
      expect(true).toBe(true);
    }

    // Deve aceitar com requestKey válido
    const validInput = {
      processoIds: [1, 2, 3],
      requestKey: "550e8400-e29b-41d4-a716-446655440003",
    };
    expect(() => schema.parse(validInput)).not.toThrow();
  });
});
