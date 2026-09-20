import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth,requireRole } from "../../auth/http.js";
import { db } from "../../db/pool.js";

const settingsSchema=z.object({key:z.string().regex(/^[a-z0-9_.-]{2,100}$/i),value:z.unknown()});
export async function registerAdminRoutes(app:FastifyInstance):Promise<void>{
 app.get("/dashboard",async request=>{
  const a=await requireAuth(request);
  const r=await db.query(`SELECT
   (SELECT count(*)::int FROM leads WHERE organization_id=$1 AND deleted_at IS NULL) leads,
   (SELECT count(*)::int FROM leads WHERE organization_id=$1 AND status='INTERESTED' AND deleted_at IS NULL) interested,
   (SELECT count(*)::int FROM conversations WHERE organization_id=$1 AND closed_at IS NULL) conversations,
   (SELECT COALESCE(sum(unread_count),0)::int FROM conversations WHERE organization_id=$1 AND closed_at IS NULL) unread,
   (SELECT count(*)::int FROM campaigns WHERE organization_id=$1 AND status='RUNNING' AND deleted_at IS NULL) running_campaigns,
   (SELECT count(*)::int FROM message_jobs WHERE organization_id=$1 AND status IN ('PENDING','SCHEDULED','PROCESSING')) queued_jobs,
   (SELECT count(*)::int FROM message_jobs WHERE organization_id=$1 AND status='FAILED') failed_jobs`,[a.organizationId]);
  return r.rows[0];
 });
 app.get("/settings",async request=>{const a=await requireAuth(request);requireRole(a,["ADMIN"]);const r=await db.query("SELECT setting_key,setting_value,updated_at FROM system_settings WHERE organization_id=$1 ORDER BY setting_key",[a.organizationId]);return r.rows;});
 app.put("/settings",async(request,reply)=>{const a=await requireAuth(request);requireRole(a,["ADMIN"]);const p=settingsSchema.safeParse(request.body);if(!p.success)return reply.code(400).send({error:"Configuração inválida."});
  const r=await db.query(`INSERT INTO system_settings(organization_id,setting_key,setting_value,updated_by) VALUES($1,$2,$3::jsonb,$4)
   ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by
   RETURNING setting_key,setting_value,updated_at`,[a.organizationId,p.data.key,JSON.stringify(p.data.value),a.userId]);return r.rows[0];
 });
 app.get("/audit-logs",async request=>{const a=await requireAuth(request);requireRole(a,["ADMIN"]);const r=await db.query(`SELECT id,user_id,action,entity_type,entity_id,metadata,request_id,created_at FROM audit_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200`,[a.organizationId]);return r.rows;});
 app.get("/users",async request=>{const a=await requireAuth(request);requireRole(a,["ADMIN"]);const r=await db.query(`SELECT id,name,email,role,active,last_login_at,created_at FROM users WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY name`,[a.organizationId]);return r.rows;});
}
