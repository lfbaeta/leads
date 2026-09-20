import { describe, expect, it } from "vitest";
import { normalizeBrazilPhone } from "../src/domain/phone.js";

describe("normalizeBrazilPhone", () => {
  it("preserva o original e normaliza celular com DDD", () => {
    const result = normalizeBrazilPhone("(13) 99142-4545");

    expect(result.original).toBe("(13) 99142-4545");
    expect(result.normalized).toBe("5513991424545");
    expect(result.valid).toBe(true);
  });

  it("mantem numero que ja possui codigo do Brasil", () => {
    const result = normalizeBrazilPhone("+55 13 99142-4545");

    expect(result.normalized).toBe("5513991424545");
    expect(result.valid).toBe(true);
  });

  it("aceita telefone fixo brasileiro", () => {
    const result = normalizeBrazilPhone("13 3864-1234");

    expect(result.normalized).toBe("551338641234");
    expect(result.valid).toBe(true);
  });

  it("rejeita numero incompleto", () => {
    const result = normalizeBrazilPhone("99142-4545");

    expect(result.valid).toBe(false);
    expect(result.normalized).toBeNull();
  });
});
