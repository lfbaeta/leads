import { describe,expect,it } from "vitest";
import { assertSafeProviderUrl } from "../src/providers/factory.js";
import { verifyWebhookSecret } from "../src/whatsapp/webhook-auth.js";
import { createHash } from "node:crypto";
describe("WhatsApp",()=>{
 it("rejeita URL com credenciais",()=>expect(()=>assertSafeProviderUrl("https://user:pass@example.com")).toThrow());
 it("valida segredo webhook por hash",()=>{const s="segredo-forte-123456";const h=createHash("sha256").update(s).digest("hex");expect(verifyWebhookSecret(s,h)).toBe(true);expect(verifyWebhookSecret("errado",h)).toBe(false);});
});
