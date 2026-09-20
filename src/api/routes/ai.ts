import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../auth/http.js";
import { db } from "../../db/pool.js";
import { setConversationMode } from "../../ai/service.js";

const settingsSchema=z.object({
  enabled:z.boolean(),
  provider:z.string().trim().max(100).nullable().optional(),
  model:z.string().trim().max(150).nullable().optional(),
  debounceSeconds:z.number().int().min(1).max(120).default(7),
  maxRetries:z.number().int().min(0).max(20).default(3),
  fallbackToHuman:z.boolean().default(true),
  maxHistoryMessages:z.number().int().min(1).max(200).default(30)
});

const promptSchema=z.object({
  kind:z.enum(["SYSTEM","COMMERCIAL"]),
  prompt:z.string().trim().min(1).max(30000)
});

const idSchema=z.object({id:z.string().uuid()});

export async function registerAIRoutes(app:FastifyInstance):Promise<void>{
  app.get("/ai/settings",async(request)=>{
    const auth=await requireAuth(request);
    const result=await db.query(
      `SELECT enabled,provider,model,debounce_seconds,max_retries,
       fallback_to_human,max_history_messages,updated_at
       FROM ai_settings WHERE organization_id=$1`,
      [auth.organizationId]
    );
    return result.rows[0] ?? {
      enabled:false,provider:null,model:null,debounce_seconds:7,
      max_retries:3,fallback_to_human:true,max_history_messages:30
    };
  });

  app.put("/ai/settings",async(request,reply)=>{
    const auth=await requireAuth(request); requireRole(auth,["ADMIN"]);
    const parsed=settingsSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"Configuração de IA inválida."});
    const d=parsed.data;
    const result=await db.query(
      `INSERT INTO ai_settings (
        organization_id,enabled,provider,model,debounce_seconds,max_retries,
        fallback_to_human,max_history_messages
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (organization_id) DO UPDATE SET
        enabled=EXCLUDED.enabled,provider=EXCLUDED.provider,model=EXCLUDED.model,
        debounce_seconds=EXCLUDED.debounce_seconds,max_retries=EXCLUDED.max_retries,
        fallback_to_human=EXCLUDED.fallback_to_human,
        max_history_messages=EXCLUDED.max_history_messages
       RETURNING enabled,provider,model,debounce_seconds,max_retries,
        fallback_to_human,max_history_messages,updated_at`,
      [auth.organizationId,d.enabled,d.provider??null,d.model??null,d.debounceSeconds,
       d.maxRetries,d.fallbackToHuman,d.maxHistoryMessages]
    );
    return result.rows[0];
  });

  app.get("/ai/prompts",async(request)=>{
    const auth=await requireAuth(request);
    const result=await db.query(
      `SELECT id,prompt_kind,scope_type,version,prompt,active,created_at
       FROM ai_prompts WHERE organization_id=$1
       ORDER BY prompt_kind,version DESC`,
      [auth.organizationId]
    );
    return result.rows;
  });

  app.post("/ai/prompts",async(request,reply)=>{
    const auth=await requireAuth(request); requireRole(auth,["ADMIN"]);
    const parsed=promptSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"Prompt inválido."});
    const client=await db.connect();
    try{
      await client.query("BEGIN");
      await client.query(
        "UPDATE ai_prompts SET active=false WHERE organization_id=$1 AND prompt_kind=$2 AND scope_type='ORGANIZATION' AND active=true",
        [auth.organizationId,parsed.data.kind]
      );
      const version=await client.query<{next:number}>(
        `SELECT COALESCE(max(version),0)+1 AS next FROM ai_prompts
         WHERE organization_id=$1 AND prompt_kind=$2 AND scope_type='ORGANIZATION'`,
        [auth.organizationId,parsed.data.kind]
      );
      const result=await client.query(
        `INSERT INTO ai_prompts (
          organization_id,prompt_kind,scope_type,version,prompt,active,created_by
         ) VALUES ($1,$2,'ORGANIZATION',$3,$4,true,$5)
         RETURNING id,prompt_kind,version,prompt,active,created_at`,
        [auth.organizationId,parsed.data.kind,version.rows[0]?.next??1,parsed.data.prompt,auth.userId]
      );
      await client.query("COMMIT");
      return reply.code(201).send(result.rows[0]);
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  });

  app.post("/conversations/:id/takeover",async(request,reply)=>{
    const auth=await requireAuth(request);
    const params=idSchema.safeParse(request.params);
    if(!params.success) return reply.code(400).send({error:"ID inválido."});
    return setConversationMode({organizationId:auth.organizationId,conversationId:params.data.id,userId:auth.userId,mode:"HUMAN"});
  });

  app.post("/conversations/:id/return-to-ai",async(request,reply)=>{
    const auth=await requireAuth(request);
    const params=idSchema.safeParse(request.params);
    if(!params.success) return reply.code(400).send({error:"ID inválido."});
    return setConversationMode({organizationId:auth.organizationId,conversationId:params.data.id,userId:auth.userId,mode:"AI"});
  });
}
