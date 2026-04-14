import { describe, expect, it } from "vitest";

describe("Anthropic API Key", () => {
  it("ANTHROPIC_API_KEY should be configured", () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    expect(apiKey).toBeDefined();
    expect(typeof apiKey).toBe("string");
    expect(apiKey).toMatch(/^sk-ant-/);
  });

  it("should be able to import Anthropic SDK", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    expect(Anthropic).toBeDefined();
    
    // Criar cliente (não faz chamada real, só testa se consegue instanciar)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    expect(client).toBeDefined();
  });
});
