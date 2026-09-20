import { describe,expect,it } from "vitest";
import { buildImmutableSystemPrompt,classifyInboundText } from "../src/ai/policy.js";

describe("políticas de IA",()=>{
  it("prioriza opt-out explícito",()=>{
    const d=classifyInboundText("Por favor não me mande mais mensagens");
    expect(d.optOut).toBe(true);
    expect(d.nextState).toBe("NOT_INTERESTED");
  });

  it("detecta interesse comercial",()=>{
    const d=classifyInboundText("Tenho interesse, quanto custa?");
    expect(d.interest).toBe(true);
    expect(d.notInterested).toBe(false);
  });

  it("detecta pedido de humano",()=>{
    const d=classifyInboundText("Quero falar com uma pessoa");
    expect(d.humanRequested).toBe(true);
    expect(d.nextState).toBe("HUMAN_REQUIRED");
  });

  it("mantém regras imutáveis essenciais",()=>{
    const p=buildImmutableSystemPrompt();
    expect(p).toContain("Nunca invente");
    expect(p).toContain("não contato");
    expect(p).toContain("transparência");
  });
});
