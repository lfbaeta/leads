import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword
} from "../src/auth/password.js";
import {
  createSessionToken,
  hashSessionToken
} from "../src/auth/session.js";

describe("autenticacao", () => {
  it("gera hash e valida a senha correta", async () => {
    const hash = await hashPassword("Senha-forte-123");

    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Senha-forte-123", hash)).toBe(true);
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("nao gera hashes iguais para a mesma senha", async () => {
    const one = await hashPassword("Senha-forte-123");
    const two = await hashPassword("Senha-forte-123");

    expect(one).not.toBe(two);
  });

  it("gera token opaco e armazena somente seu hash", () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(token.length).toBeGreaterThan(30);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });
});
