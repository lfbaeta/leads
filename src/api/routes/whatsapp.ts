import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth,requireRole } from "../../auth/http.js";
import { db } from "../../db/pool.js";
import { encryptSecret,decryptSecret } from "../../security/secrets.js";
import { whatsappProviderFactory,type WhatsAppProviderName } from "../../providers/factory.js";
import { persistNormalizedEvent,verifyWebhookSecret } from "../../whatsapp/webhook-service.js";

const createSchema=z.object({name:z.string().min(1).max(120),provider:z.enum(["EVOLUTION_API","EVOLUTION_GO"]),baseUrl:z.string().url(),apiKey:z.string().min(1).max(2000),instanceName:z.string().min(1).max(200),webhookSecret:z.string().min(16).max(500)});
const idSchema=z.object({id:z.string().uuid()});

export async function registerWhatsAppRoutes(app:FastifyInstance):Promise<void>{
 app.get("/instances",async request=>{
  const auth=await requireAuth(request);
  const r=await db.query(`SELECT id,name,provider,base_url,instance_name,provider_version,phone,status,active,last_seen_at,last_webhook_at,last_error,created_at FROM instances WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC`,[auth.organizationId]);return r.rows;
 });
 app.post("/instances",async(request,reply)=>{
  const auth=await requireAuth(request);requireRole(auth,["ADMIN"]);const p=createSchema.safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:"Configuração da instância inválida."}); const d=p.data;
  const hash=createHash("sha256").update(d.webhookSecret).digest("hex");
  const r=await db.query(`INSERT INTO instances(organization_id,name,provider,base_url,api_key_encrypted,webhook_secret_encrypted,webhook_secret_hash,instance_name)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,provider,base_url,instance_name,status,active,created_at`,
   [auth.organizationId,d.name,d.provider,d.baseUrl,encryptSecret(d.apiKey),encryptSecret(d.webhookSecret),hash,d.instanceName]);
  return reply.code(201).send(r.rows[0]);
 });
 app.post("/instances/:id/status",async(request,reply)=>{
  const auth=await requireAuth(request);const p=idSchema.safeParse(request.params);if(!p.success)return reply.code(400).send({error:"ID inválido."});
  const r=await db.query<{provider:WhatsAppProviderName;base_url:string;api_key_encrypted:string|null;instance_name:string}>(`SELECT provider,base_url,api_key_encrypted,instance_name FROM instances WHERE id=$1 AND organization_id=$2 AND active=true AND deleted_at IS NULL`,[p.data.id,auth.organizationId]);
  const x=r.rows[0];if(!x||!x.api_key_encrypted)return reply.code(404).send({error:"Instância não encontrada."});
  const provider=whatsappProviderFactory.create(x.provider,{baseUrl:x.base_url,apiKey:decryptSecret(x.api_key_encrypted),instanceExternalId:x.instance_name});
  const status=await provider.getStatus();await db.query("UPDATE instances SET status=$3,last_seen_at=now(),last_error=NULL WHERE id=$1 AND organization_id=$2",[p.data.id,auth.organizationId,status]);return {status};
 });
 app.post("/webhooks/whatsapp/:id",async(request,reply)=>{
  const p=idSchema.safeParse(request.params);if(!p.success)return reply.code(400).send({error:"ID inválido."});
  const r=await db.query<{organization_id:string;provider:WhatsAppProviderName;base_url:string;api_key_encrypted:string|null;instance_name:string;webhook_secret_hash:string|null}>(`SELECT organization_id,provider,base_url,api_key_encrypted,instance_name,webhook_secret_hash FROM instances WHERE id=$1 AND active=true AND deleted_at IS NULL`,[p.data.id]);
  const x=r.rows[0];if(!x||!x.api_key_encrypted)return reply.code(404).send({error:"Instância não encontrada."});
  const secret=typeof request.headers["x-webhook-secret"]==="string"?request.headers["x-webhook-secret"]:undefined;
  if(!verifyWebhookSecret(secret,x.webhook_secret_hash))return reply.code(401).send({error:"Webhook não autorizado."});
  const provider=whatsappProviderFactory.create(x.provider,{baseUrl:x.base_url,apiKey:decryptSecret(x.api_key_encrypted),instanceExternalId:x.instance_name});
  const event=await provider.normalizeEvent(request.body);const result=await persistNormalizedEvent({organizationId:x.organization_id,instanceId:p.data.id,event});return reply.code(202).send(result);
 });
}
