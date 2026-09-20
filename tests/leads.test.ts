import { describe, expect, it } from "vitest";
import { normalizeBrazilPhone } from "../src/domain/phone.js";

describe("contrato de leads", () => {
  it("normaliza telefone antes de persistir", () => {
    const result = normalizeBrazilPhone("(13) 99142-4545");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("5513991424545");
  });

  it("rejeita telefone incompleto", () => {
    const result = normalizeBrazilPhone("1234");
    expect(result.valid).toBe(false);
    expect(result.normalized).toBeNull();
  });
});
