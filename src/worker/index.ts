import { env } from "../config/env.js";
import { closeDatabase, db } from "../db/pool.js";
import { claimNextMessageJob,markJobFailed,markJobSucceeded,recoverStaleJobs,type MessageJob } from "../queue/repository.js";
import { decryptSecret } from "../security/secrets.js";
import { whatsappProviderFactory,type WhatsAppProviderName } from "../providers/factory.js";

let shuttingDown=false; const startedAt=new Date();

async function heartbeat(){
 await db.query(`INSERT INTO worker_heartbeats(worker_name,started_at,last_heartbeat_at,metadata)
 VALUES($1,$2,now(),$3::jsonb) ON CONFLICT(worker_name) DO UPDATE SET started_at=EXCLUDED.started_at,last_heartbeat_at=now(),metadata=EXCLUDED.metadata`,
 [env.WORKER_NAME,startedAt,JSON.stringify({pid:process.pid,dryRun:env.DRY_RUN,version:"0.4.0"})]);
}
function retryAt(attempt:number){return new Date(Date.now()+Math.min(300,15*2**Math.max(0,attempt-1))*1000);}
async function processWhatsApp(job:MessageJob){
 if(!job.instance_id||!job.message_id||!job.lead_id) throw new Error("Job WhatsApp incompleto.");
 const row=await db.query<{provider:WhatsAppProviderName;base_url:string;api_key_encrypted:string|null;instance_name:string;phone_normalized:string;content:string|null}>(
  `SELECT i.provider,i.base_url,i.api_key_encrypted,i.instance_name,l.phone_normalized,m.content
   FROM instances i JOIN leads l ON l.id=$2 AND l.organization_id=i.organization_id
   JOIN messages m ON m.id=$3 AND m.organization_id=i.organization_id
   WHERE i.id=$1 AND i.organization_id=$4 AND i.active=true AND i.deleted_at IS NULL`,
  [job.instance_id,job.lead_id,job.message_id,job.organization_id]
 );
 const x=row.rows[0]; if(!x||!x.api_key_encrypted||!x.content) throw new Error("Provider, credencial ou mensagem indisponível.");
 const provider=whatsappProviderFactory.create(x.provider,{baseUrl:x.base_url,apiKey:decryptSecret(x.api_key_encrypted),instanceExternalId:x.instance_name});
 const sent=await provider.sendText(x.phone_normalized,x.content);
 const client=await db.connect();
 try{
  await client.query("BEGIN");
  await client.query(`UPDATE messages SET status='SENT',external_message_id=$2,provider=$3,sent_at=now(),metadata=metadata||$4::jsonb WHERE id=$1 AND organization_id=$5`,
   [job.message_id,sent.externalMessageId,x.provider,JSON.stringify(sent.rawMetadata??{}),job.organization_id]);
  await markJobSucceeded(client,job.id);
  if(job.campaign_id){
   await client.query(`UPDATE campaign_leads SET status='WAITING_REPLY',sent_at=now()
    WHERE campaign_id=$1 AND lead_id=$2 AND organization_id=$3 AND sent_at IS NULL`,[job.campaign_id,job.lead_id,job.organization_id]);
   await client.query(`UPDATE campaigns SET processed_count=processed_count+1 WHERE id=$1 AND organization_id=$2`,[job.campaign_id,job.organization_id]);
  }
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
async function cycle(){
 await heartbeat(); await recoverStaleJobs(env.WORKER_STALE_AFTER_SECONDS);
 if(env.DRY_RUN) return;
 const job=await claimNextMessageJob(env.WORKER_NAME,["WHATSAPP_SEND"]);
 if(!job) return;
 try{await processWhatsApp(job);}catch(error){
  const message=error instanceof Error?error.message:"Falha desconhecida";
  await markJobFailed(job.id,message,job.attempts<job.max_attempts?retryAt(job.attempts):null);
 }
}
async function shutdown(signal:string){if(shuttingDown)return;shuttingDown=true;console.info("[worker] encerrando por "+signal);await closeDatabase();process.exit(0);}
process.once("SIGTERM",()=>void shutdown("SIGTERM"));process.once("SIGINT",()=>void shutdown("SIGINT"));
console.info("[worker] "+env.WORKER_NAME+" iniciado. DRY_RUN="+env.DRY_RUN);
try{
 await cycle();
 setInterval(()=>{if(!shuttingDown)void cycle().catch(e=>console.error("[worker] ciclo falhou",e));},env.WORKER_POLL_MS);
}catch(error){console.error("[worker] falha ao iniciar",error);await closeDatabase();process.exit(1);}
