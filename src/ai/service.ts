import { db } from "../db/pool.js";
import type { AIProvider } from "../providers/contracts.js";
import { buildImmutableSystemPrompt, classifyInboundText } from "./policy.js";

type AISettingsRow = {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  debounce_seconds: number;
  max_retries: number;
  fallback_to_human: boolean;
  max_history_messages: number;
};

export async function registerInboundForAI(input:{
  organizationId:string;
  conversationId:string;
  leadId:string;
  messageId:string;
  text:string;
}) {
  const decision=classifyInboundText(input.text);
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const conversation=await client.query<{mode:"AI"|"HUMAN";ai_paused:boolean}>(
      `SELECT mode,ai_paused FROM conversations
       WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.conversationId,input.organizationId]
    );
    if(!conversation.rows[0]) throw Object.assign(new Error("Conversa não encontrada."),{statusCode:404});

    if(decision.optOut){
      const phone=await client.query<{phone_normalized:string}>(
        "SELECT phone_normalized FROM leads WHERE id=$1 AND organization_id=$2",
        [input.leadId,input.organizationId]
      );
      const normalized=phone.rows[0]?.phone_normalized;
      if(normalized){
        await client.query(
          `INSERT INTO opt_outs (organization_id,lead_id,phone_normalized,reason,source)
           VALUES ($1,$2,$3,'Pedido explícito na conversa','AI_POLICY')
           ON CONFLICT (organization_id,phone_normalized) DO NOTHING`,
          [input.organizationId,input.leadId,normalized]
        );
      }
      await client.query(
        `UPDATE leads SET opt_out=true,opt_out_at=now(),status='DO_NOT_CONTACT'
         WHERE id=$1 AND organization_id=$2`,
        [input.leadId,input.organizationId]
      );
    } else if(decision.interest){
      await client.query("UPDATE leads SET status='INTERESTED' WHERE id=$1 AND organization_id=$2",[input.leadId,input.organizationId]);
    } else if(decision.notInterested){
      await client.query("UPDATE leads SET status='NOT_INTERESTED' WHERE id=$1 AND organization_id=$2",[input.leadId,input.organizationId]);
    }

    if(decision.humanRequested){
      await client.query(
        `UPDATE conversations
         SET mode='HUMAN',ai_paused=true,state='HUMAN_REQUIRED',human_takeover_at=now(),ai_debounce_until=NULL
         WHERE id=$1 AND organization_id=$2`,
        [input.conversationId,input.organizationId]
      );
    } else {
      const settings=await client.query<AISettingsRow>(
        "SELECT * FROM ai_settings WHERE organization_id=$1",
        [input.organizationId]
      );
      const config=settings.rows[0];
      if(config?.enabled && !decision.optOut && !decision.notInterested &&
         conversation.rows[0].mode==="AI" && !conversation.rows[0].ai_paused){
        await client.query(
          `UPDATE conversations
           SET state=$3,ai_debounce_until=now()+make_interval(secs=>$4)
           WHERE id=$1 AND organization_id=$2`,
          [input.conversationId,input.organizationId,decision.nextState,config.debounce_seconds]
        );
        await client.query(
          `INSERT INTO message_jobs (
             organization_id,job_type,lead_id,conversation_id,message_id,
             status,idempotency_key,payload,scheduled_at,available_at,max_attempts
           )
           VALUES ($1,'AI_REPLY',$2,$3,$4,'SCHEDULED',$5,$6::jsonb,
             now()+make_interval(secs=>$7),now()+make_interval(secs=>$7),$8)
           ON CONFLICT (organization_id,idempotency_key)
           DO UPDATE SET scheduled_at=EXCLUDED.scheduled_at,available_at=EXCLUDED.available_at,
             payload=EXCLUDED.payload,status=CASE
               WHEN message_jobs.status IN ('SENT','PROCESSING') THEN message_jobs.status
               ELSE 'SCHEDULED' END`,
          [input.organizationId,input.leadId,input.conversationId,input.messageId,
           `ai:conversation:${input.conversationId}`,
           JSON.stringify({triggerMessageId:input.messageId}),config.debounce_seconds,Math.max(1,config.max_retries)]
        );
      }
    }

    await client.query("COMMIT");
    return decision;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function generateAIReply(input:{
  organizationId:string;
  conversationId:string;
  provider:AIProvider;
}) {
  const settingsResult=await db.query<AISettingsRow>(
    "SELECT * FROM ai_settings WHERE organization_id=$1 AND enabled=true",
    [input.organizationId]
  );
  const settings=settingsResult.rows[0];
  if(!settings) throw Object.assign(new Error("IA desativada para a organização."),{statusCode:409});

  const conversation=await db.query<{lead_id:string;mode:"AI"|"HUMAN";ai_paused:boolean}>(
    `SELECT lead_id,mode,ai_paused FROM conversations
     WHERE id=$1 AND organization_id=$2 AND closed_at IS NULL`,
    [input.conversationId,input.organizationId]
  );
  const current=conversation.rows[0];
  if(!current || current.mode!=="AI" || current.ai_paused) {
    throw Object.assign(new Error("Conversa não está disponível para IA."),{statusCode:409});
  }

  const prompts=await db.query<{prompt_kind:"SYSTEM"|"COMMERCIAL";prompt:string;version:number}>(
    `SELECT prompt_kind,prompt,version FROM ai_prompts
     WHERE organization_id=$1 AND active=true
       AND scope_type IN ('GLOBAL','ORGANIZATION')
     ORDER BY CASE scope_type WHEN 'ORGANIZATION' THEN 0 ELSE 1 END,version DESC`,
    [input.organizationId]
  );
  const commercial=prompts.rows.find((p)=>p.prompt_kind==="COMMERCIAL");
  const systemExtension=prompts.rows.find((p)=>p.prompt_kind==="SYSTEM");

  const history=await db.query<{direction:"INBOUND"|"OUTBOUND";content:string|null}>(
    `SELECT direction,content FROM (
       SELECT direction,content,created_at FROM messages
       WHERE organization_id=$1 AND conversation_id=$2 AND content IS NOT NULL
       ORDER BY created_at DESC LIMIT $3
     ) h ORDER BY created_at ASC`,
    [input.organizationId,input.conversationId,settings.max_history_messages]
  );

  const result=await input.provider.generateReply({
    systemPrompt:[buildImmutableSystemPrompt(),systemExtension?.prompt ?? ""].filter(Boolean).join("\n\n"),
    commercialPrompt:commercial?.prompt ?? "",
    conversationHistory:history.rows.map((m)=>({
      role:m.direction==="INBOUND"?"user" as const:"assistant" as const,
      content:m.content ?? ""
    }))
  });

  return {
    ...result,
    promptVersion:commercial?.version ?? null
  };
}

export async function setConversationMode(input:{
  organizationId:string;conversationId:string;userId:string;mode:"AI"|"HUMAN";
}) {
  const result=await db.query(
    `UPDATE conversations
     SET mode=$3,ai_paused=($3='HUMAN'),
       human_takeover_at=CASE WHEN $3='HUMAN' THEN now() ELSE human_takeover_at END,
       ai_resumed_at=CASE WHEN $3='AI' THEN now() ELSE ai_resumed_at END,
       ai_debounce_until=NULL
     WHERE id=$1 AND organization_id=$2 AND closed_at IS NULL
     RETURNING id,mode,ai_paused,state`,
    [input.conversationId,input.organizationId,input.mode]
  );
  if(!result.rows[0]) throw Object.assign(new Error("Conversa não encontrada."),{statusCode:404});
  await db.query(
    `INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id)
     VALUES ($1,$2,$3,'conversation',$4)`,
    [input.organizationId,input.userId,input.mode==="HUMAN"?"CONVERSATION_TAKEOVER":"CONVERSATION_RETURN_AI",input.conversationId]
  );
  return result.rows[0];
}
