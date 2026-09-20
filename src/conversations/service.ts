import { db } from "../db/pool.js";

export async function listConversations(input:{
  organizationId:string;search?:string;mode?:string;state?:string;page:number;pageSize:number;
}) {
  const offset=(input.page-1)*input.pageSize;
  const values:unknown[]=[input.organizationId];
  const where=["c.organization_id=$1","c.closed_at IS NULL","l.deleted_at IS NULL"];
  if(input.search){values.push(`%${input.search}%`);where.push(`(l.name ILIKE $${values.length} OR l.phone_normalized ILIKE $${values.length} OR COALESCE(l.company,'') ILIKE $${values.length})`);}
  if(input.mode){values.push(input.mode);where.push(`c.mode=$${values.length}`);}
  if(input.state){values.push(input.state);where.push(`c.state=$${values.length}`);}
  values.push(input.pageSize,offset);
  const result=await db.query(
    `SELECT c.id,c.lead_id,c.instance_id,c.state,c.mode,c.ai_paused,c.unread_count,
       c.last_message_at,c.created_at,l.name AS lead_name,l.phone_normalized,l.company,l.status AS lead_status,
       m.content AS last_message,m.direction AS last_direction,m.message_type AS last_message_type
     FROM conversations c
     JOIN leads l ON l.id=c.lead_id AND l.organization_id=c.organization_id
     LEFT JOIN LATERAL (
       SELECT content,direction,message_type FROM messages
       WHERE conversation_id=c.id AND organization_id=c.organization_id
       ORDER BY created_at DESC LIMIT 1
     ) m ON true
     WHERE ${where.join(" AND ")}
     ORDER BY c.last_message_at DESC NULLS LAST,c.created_at DESC
     LIMIT $${values.length-1} OFFSET $${values.length}`,
    values
  );
  return {page:input.page,pageSize:input.pageSize,items:result.rows};
}

export async function getConversation(organizationId:string,id:string){
  const result=await db.query(
    `SELECT c.*,l.name AS lead_name,l.phone_original,l.phone_normalized,l.company,l.city,l.status AS lead_status,
       i.name AS instance_name,i.provider AS instance_provider
     FROM conversations c
     JOIN leads l ON l.id=c.lead_id AND l.organization_id=c.organization_id
     LEFT JOIN instances i ON i.id=c.instance_id AND i.organization_id=c.organization_id
     WHERE c.id=$1 AND c.organization_id=$2 AND l.deleted_at IS NULL`,
    [id,organizationId]
  );
  return result.rows[0]??null;
}

export async function listMessages(input:{organizationId:string;conversationId:string;before?:string;limit:number}){
  const exists=await db.query("SELECT 1 FROM conversations WHERE id=$1 AND organization_id=$2",[input.conversationId,input.organizationId]);
  if(!exists.rows[0]) throw Object.assign(new Error("Conversa não encontrada."),{statusCode:404});
  const values:unknown[]=[input.organizationId,input.conversationId];
  let cursor="";
  if(input.before){values.push(input.before);cursor=` AND m.created_at < $${values.length}::timestamptz`;}
  values.push(input.limit);
  const result=await db.query(
    `SELECT * FROM (
       SELECT m.id,m.direction,m.message_type,m.origin,m.content,m.status,m.provider,
        m.external_message_id,m.sent_at,m.delivered_at,m.read_at,m.received_at,m.created_at,
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',a.id,'name',a.original_name,'mimeType',a.mime_type,'sizeBytes',a.size_bytes
        )) FILTER (WHERE a.id IS NOT NULL),'[]'::jsonb) AS attachments
       FROM messages m
       LEFT JOIN message_attachments ma ON ma.message_id=m.id
       LEFT JOIN attachments a ON a.id=ma.attachment_id AND a.organization_id=m.organization_id AND a.deleted_at IS NULL
       WHERE m.organization_id=$1 AND m.conversation_id=$2 ${cursor}
       GROUP BY m.id ORDER BY m.created_at DESC LIMIT $${values.length}
     ) x ORDER BY created_at ASC`,
    values
  );
  return result.rows;
}

export async function markConversationRead(organizationId:string,id:string){
  const result=await db.query(
    "UPDATE conversations SET unread_count=0 WHERE id=$1 AND organization_id=$2 RETURNING id,unread_count",
    [id,organizationId]
  );
  return result.rows[0]??null;
}

export async function queueHumanText(input:{
  organizationId:string;conversationId:string;userId:string;text:string;
}){
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const conv=await client.query<{lead_id:string;instance_id:string|null}>(
      `SELECT lead_id,instance_id FROM conversations
       WHERE id=$1 AND organization_id=$2 AND closed_at IS NULL FOR UPDATE`,
      [input.conversationId,input.organizationId]
    );
    const current=conv.rows[0];
    if(!current) throw Object.assign(new Error("Conversa não encontrada."),{statusCode:404});
    const lead=await client.query<{opt_out:boolean;status:string}>(
      "SELECT opt_out,status FROM leads WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL",
      [current.lead_id,input.organizationId]
    );
    if(!lead.rows[0] || lead.rows[0].opt_out || lead.rows[0].status==="DO_NOT_CONTACT"){
      throw Object.assign(new Error("Contato bloqueado por não contatar."),{statusCode:409});
    }
    if(!current.instance_id) throw Object.assign(new Error("Conversa sem instância de WhatsApp vinculada."),{statusCode:409});

    const message=await client.query<{id:string}>(
      `INSERT INTO messages (
        organization_id,conversation_id,lead_id,instance_id,direction,message_type,origin,content,status
       ) VALUES ($1,$2,$3,$4,'OUTBOUND','TEXT','HUMAN',$5,'QUEUED') RETURNING id`,
      [input.organizationId,input.conversationId,current.lead_id,current.instance_id,input.text]
    );
    const messageId=message.rows[0]!.id;
    await client.query(
      `INSERT INTO message_jobs (
        organization_id,job_type,lead_id,conversation_id,instance_id,message_id,status,
        idempotency_key,payload,available_at
       ) VALUES ($1,'WHATSAPP_SEND',$2,$3,$4,$5,'PENDING',$6,$7::jsonb,now())`,
      [input.organizationId,current.lead_id,input.conversationId,current.instance_id,messageId,
       `human:message:${messageId}`,JSON.stringify({type:"TEXT",text:input.text})]
    );
    await client.query(
      `UPDATE conversations SET mode='HUMAN',ai_paused=true,human_takeover_at=COALESCE(human_takeover_at,now()),
       last_message_at=now() WHERE id=$1 AND organization_id=$2`,
      [input.conversationId,input.organizationId]
    );
    await client.query(
      `INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id)
       VALUES ($1,$2,'HUMAN_MESSAGE_QUEUED','conversation',$3)`,
      [input.organizationId,input.userId,input.conversationId]
    );
    await client.query("COMMIT");
    return {messageId,status:"QUEUED"};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
