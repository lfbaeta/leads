import { createHash,timingSafeEqual } from "node:crypto";
import { db } from "../db/pool.js";
import { normalizeBrazilPhone } from "../domain/phone.js";
import type { NormalizedWhatsAppEvent } from "../providers/contracts.js";
import { registerInboundForAI } from "../ai/service.js";

function hashSecret(value:string){return createHash("sha256").update(value).digest();}

export function verifyWebhookSecret(provided:string|undefined,storedHash:string|null):boolean{
  if(!storedHash||!provided) return false;
  const a=hashSecret(provided);
  let b:Buffer;
  try{b=Buffer.from(storedHash,"hex");}catch{return false;}
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function persistNormalizedEvent(input:{
  organizationId:string;instanceId:string;event:NormalizedWhatsAppEvent;
}){
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const inserted=await client.query<{id:string}>(
      `INSERT INTO webhook_events (
        organization_id,instance_id,provider,external_event_id,event_type,payload
       )
       SELECT $1,$2,i.provider,$3,$4,$5::jsonb FROM instances i
       WHERE i.id=$2 AND i.organization_id=$1 AND i.active=true AND i.deleted_at IS NULL
       ON CONFLICT (instance_id,external_event_id) DO NOTHING RETURNING id`,
      [input.organizationId,input.instanceId,input.event.externalEventId,input.event.eventType,JSON.stringify(input.event.payload)]
    );
    if(!inserted.rows[0]){await client.query("COMMIT");return {duplicate:true};}
    await client.query("UPDATE instances SET last_webhook_at=now() WHERE id=$1 AND organization_id=$2",[input.instanceId,input.organizationId]);

    if(input.event.eventType!=="MESSAGE_RECEIVED"||!input.event.phone){
      await client.query("UPDATE webhook_events SET processed_at=now() WHERE id=$1",[inserted.rows[0].id]);
      await client.query("COMMIT"); return {duplicate:false,handled:false};
    }

    const phone=normalizeBrazilPhone(input.event.phone);
    if(!phone.valid||!phone.normalized){
      await client.query("UPDATE webhook_events SET processed_at=now(),error_message='Telefone inbound inválido' WHERE id=$1",[inserted.rows[0].id]);
      await client.query("COMMIT"); return {duplicate:false,handled:false};
    }
    const lead=await client.query<{id:string}>(
      "SELECT id FROM leads WHERE organization_id=$1 AND phone_normalized=$2 AND deleted_at IS NULL LIMIT 1",
      [input.organizationId,phone.normalized]
    );
    if(!lead.rows[0]){
      await client.query("UPDATE webhook_events SET processed_at=now(),error_message='Lead não encontrado' WHERE id=$1",[inserted.rows[0].id]);
      await client.query("COMMIT"); return {duplicate:false,handled:false};
    }
    const conversation=await client.query<{id:string}>(
      `INSERT INTO conversations (organization_id,lead_id,instance_id,state,mode)
       VALUES ($1,$2,$3,'QUALIFYING','AI')
       ON CONFLICT (organization_id,lead_id)
       DO UPDATE SET instance_id=EXCLUDED.instance_id,last_message_at=now(),unread_count=conversations.unread_count+1
       RETURNING id`,
      [input.organizationId,lead.rows[0].id,input.instanceId]
    );
    const text=typeof input.event.payload.text==="string"?input.event.payload.text:"";
    const message=await client.query<{id:string}>(
      `INSERT INTO messages (
        organization_id,conversation_id,lead_id,instance_id,direction,message_type,origin,
        content,status,provider,external_message_id,received_at,metadata
       ) SELECT $1,$2,$3,$4,'INBOUND','TEXT','CUSTOMER',$5,'RECEIVED',i.provider,$6,now(),$7::jsonb
         FROM instances i WHERE i.id=$4
       RETURNING id`,
      [input.organizationId,conversation.rows[0]!.id,lead.rows[0].id,input.instanceId,text,
       input.event.externalMessageId??null,JSON.stringify({externalEventId:input.event.externalEventId})]
    );
    await client.query("UPDATE leads SET last_reply_at=now() WHERE id=$1",[lead.rows[0].id]);
    await client.query("UPDATE webhook_events SET processed_at=now() WHERE id=$1",[inserted.rows[0].id]);
    await client.query("COMMIT");

    if(text) await registerInboundForAI({
      organizationId:input.organizationId,conversationId:conversation.rows[0]!.id,
      leadId:lead.rows[0].id,messageId:message.rows[0]!.id,text
    });
    return {duplicate:false,handled:true};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
