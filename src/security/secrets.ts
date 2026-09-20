import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import { env } from "../config/env.js";

function key():Buffer{
  if(!env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY é obrigatória para credenciais.");
  return createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}
export function encryptSecret(value:string):string{
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key(),iv);
  const body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),body.toString("base64")].join(".");
}
export function decryptSecret(value:string):string{
  const [version,iv,tag,body]=value.split(".");
  if(version!=="v1"||!iv||!tag||!body) throw new Error("Segredo criptografado inválido.");
  const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(body,"base64")),decipher.final()]).toString("utf8");
}
