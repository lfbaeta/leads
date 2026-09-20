import { randomInt } from "node:crypto";
import { db } from "../db/pool.js";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "FINISHED"
  | "CANCELLED"
  | "ERROR";

export function renderInitialMessage(
  template: string,
  lead: { name: string; company: string | null; city: string | null }
): string {
  const fallbackName = lead.name?.trim() || "cliente";
  return template
    .replaceAll("{{nome}}", fallbackName)
    .replaceAll("{{name}}", fallbackName)
    .replaceAll("{{empresa}}", lead.company?.trim() || "")
    .replaceAll("{{company}}", lead.company?.trim() || "")
    .replaceAll("{{cidade}}", lead.city?.trim() || "")
    .replaceAll("{{city}}", lead.city?.trim() || "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function nextIntervalSeconds(input: {
  min: number;
  max: number;
  fixed: number | null;
}): number {
  if (input.fixed !== null) return input.fixed;
  if (input.max <= input.min) return input.min;
  return randomInt(input.min, input.max + 1);
}

function weekdayInTimezone(date: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short"
  }).format(date);
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const)[short as "Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"];
}

function minutesInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function withinCampaignWindow(
  date: Date,
  campaign: {
    timezone: string;
    allowed_weekdays: number[];
    send_window_start: string | null;
    send_window_end: string | null;
  }
): boolean {
  if (!campaign.allowed_weekdays.includes(weekdayInTimezone(date, campaign.timezone))) return false;
  const start = parseTime(campaign.send_window_start);
  const end = parseTime(campaign.send_window_end);
  if (start === null || end === null) return true;
  const current = minutesInTimezone(date, campaign.timezone);
  return start <= end
    ? current >= start && current <= end
    : current >= start || current <= end;
}

function advanceToAllowedWindow(
  proposed: Date,
  campaign: {
    timezone: string;
    allowed_weekdays: number[];
    send_window_start: string | null;
    send_window_end: string | null;
  }
): Date {
  if (withinCampaignWindow(proposed, campaign)) return proposed;

  // Avança em minutos, limitado a oito dias, para encontrar a próxima janela.
  const candidate = new Date(proposed);
  for (let i = 0; i < 8 * 24 * 60; i += 1) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    if (withinCampaignWindow(candidate, campaign)) return candidate;
  }
  throw new Error("Não foi possível encontrar uma janela válida de envio.");
}

export async function createCampaign(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string | null | undefined;
  initialMessage: string;
  instanceId?: string | null | undefined;
  startsAt?: Date | null | undefined;
  timezone: string;
  allowedWeekdays: number[];
  sendWindowStart?: string | null | undefined;
  sendWindowEnd?: string | null | undefined;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  fixedIntervalSeconds?: number | null | undefined;
  leadIds: string[];
}) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (input.instanceId) {
      const instance = await client.query(
        `SELECT 1 FROM instances
         WHERE id=$1 AND organization_id=$2 AND active=true AND deleted_at IS NULL`,
        [input.instanceId, input.organizationId]
      );
      if (!instance.rowCount) {
        throw Object.assign(new Error("Instância não encontrada na organização."), { statusCode: 400 });
      }
    }

    const campaignResult = await client.query(
      `
      INSERT INTO campaigns (
        organization_id,name,description,initial_message,status,instance_id,
        created_by,starts_at,timezone,allowed_weekdays,send_window_start,
        send_window_end,min_interval_seconds,max_interval_seconds,
        fixed_interval_seconds,target_count
      )
      VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0)
      RETURNING *
      `,
      [
        input.organizationId,input.name,input.description ?? null,input.initialMessage,
        input.instanceId ?? null,input.userId,input.startsAt ?? null,input.timezone,
        input.allowedWeekdays,input.sendWindowStart ?? null,input.sendWindowEnd ?? null,
        input.minIntervalSeconds,input.maxIntervalSeconds,input.fixedIntervalSeconds ?? null
      ]
    );
    const campaign = campaignResult.rows[0];

    if (input.leadIds.length) {
      await client.query(
        `
        INSERT INTO campaign_leads (organization_id,campaign_id,lead_id)
        SELECT $1,$2,l.id
        FROM leads l
        WHERE l.organization_id=$1
          AND l.id=ANY($3::uuid[])
          AND l.deleted_at IS NULL
          AND l.opt_out=false
          AND l.status <> 'DO_NOT_CONTACT'
          AND NOT EXISTS (
            SELECT 1 FROM opt_outs o
            WHERE o.organization_id=l.organization_id
              AND o.phone_normalized=l.phone_normalized
          )
        ON CONFLICT (campaign_id,lead_id) DO NOTHING
        `,
        [input.organizationId,campaign.id,input.leadIds]
      );
    }

    await client.query(
      `
      UPDATE campaigns
      SET target_count=(SELECT count(*) FROM campaign_leads WHERE campaign_id=$1)
      WHERE id=$1
      `,
      [campaign.id]
    );

    await client.query(
      `INSERT INTO audit_logs
       (organization_id,user_id,action,entity_type,entity_id,after_data)
       VALUES ($1,$2,'CAMPAIGN_CREATED','campaign',$3,$4::jsonb)`,
      [input.organizationId,input.userId,campaign.id,JSON.stringify({name:input.name,requestedLeadCount:input.leadIds.length})]
    );

    await client.query("COMMIT");
    return campaign;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function scheduleCampaign(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
}) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id:string; initial_message:string; starts_at:Date|null; timezone:string;
      allowed_weekdays:number[]; send_window_start:string|null; send_window_end:string|null;
      min_interval_seconds:number; max_interval_seconds:number; fixed_interval_seconds:number|null;
      status:CampaignStatus; instance_id:string|null;
    }>(
      `SELECT id,initial_message,starts_at,timezone,allowed_weekdays,
       send_window_start::text,send_window_end::text,min_interval_seconds,
       max_interval_seconds,fixed_interval_seconds,status,instance_id
       FROM campaigns
       WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL
       FOR UPDATE`,
      [input.campaignId,input.organizationId]
    );
    const campaign=result.rows[0];
    if (!campaign) throw Object.assign(new Error("Campanha não encontrada."),{statusCode:404});
    if (!["DRAFT","PAUSED","SCHEDULED"].includes(campaign.status)) {
      throw Object.assign(new Error("Campanha não pode ser iniciada neste estado."),{statusCode:409});
    }
    if (!campaign.instance_id) {
      throw Object.assign(new Error("Selecione uma instância antes de iniciar a campanha."),{statusCode:409});
    }

    const leads=await client.query<{
      campaign_lead_id:string; lead_id:string; name:string; company:string|null;
      city:string|null; phone_normalized:string;
    }>(
      `
      SELECT cl.id campaign_lead_id,l.id lead_id,l.name,l.company,l.city,l.phone_normalized
      FROM campaign_leads cl
      JOIN leads l ON l.id=cl.lead_id AND l.organization_id=cl.organization_id
      WHERE cl.organization_id=$1 AND cl.campaign_id=$2
        AND cl.status='PENDING' AND cl.sent_at IS NULL
        AND l.deleted_at IS NULL AND l.opt_out=false AND l.status <> 'DO_NOT_CONTACT'
        AND NOT EXISTS (
          SELECT 1 FROM opt_outs o
          WHERE o.organization_id=l.organization_id AND o.phone_normalized=l.phone_normalized
        )
      ORDER BY cl.created_at,cl.id
      FOR UPDATE OF cl SKIP LOCKED
      `,
      [input.organizationId,input.campaignId]
    );

    let cursor=campaign.starts_at && campaign.starts_at>new Date()
      ? new Date(campaign.starts_at)
      : new Date();

    let scheduled=0;
    for (const lead of leads.rows) {
      cursor=advanceToAllowedWindow(cursor,campaign);
      const rendered=renderInitialMessage(campaign.initial_message,lead);
      const idempotencyKey=`campaign:${campaign.id}:lead:${lead.lead_id}:initial:v1`;

      const conversation=await client.query<{id:string}>(
        `
        INSERT INTO conversations (organization_id,lead_id,instance_id,state,mode,ai_paused)
        VALUES ($1,$2,$3,'PRESENTATION','AI',false)
        ON CONFLICT (organization_id,lead_id)
        DO UPDATE SET instance_id=COALESCE(conversations.instance_id,EXCLUDED.instance_id)
        RETURNING id
        `,
        [input.organizationId,lead.lead_id,campaign.instance_id]
      );

      const message=await client.query<{id:string}>(
        `
        INSERT INTO messages (
          organization_id,conversation_id,lead_id,instance_id,
          direction,message_type,origin,content,status,metadata
        )
        VALUES ($1,$2,$3,$4,'OUTBOUND','TEXT','CAMPAIGN',$5,'QUEUED',$6::jsonb)
        RETURNING id
        `,
        [input.organizationId,conversation.rows[0]!.id,lead.lead_id,campaign.instance_id,rendered,
         JSON.stringify({campaignId:campaign.id,campaignLeadId:lead.campaign_lead_id})]
      );

      await client.query(
        `
        INSERT INTO message_jobs (
          organization_id,job_type,lead_id,campaign_id,conversation_id,
          instance_id,message_id,status,idempotency_key,payload,
          scheduled_at,available_at,max_attempts
        )
        VALUES ($1,'WHATSAPP_SEND',$2,$3,$4,$5,$6,'SCHEDULED',$7,$8::jsonb,$9,$9,3)
        ON CONFLICT (organization_id,idempotency_key) DO NOTHING
        `,
        [input.organizationId,lead.lead_id,campaign.id,conversation.rows[0]!.id,
         campaign.instance_id,message.rows[0]!.id,idempotencyKey,
         JSON.stringify({kind:"CAMPAIGN_INITIAL",to:lead.phone_normalized,text:rendered,campaignLeadId:lead.campaign_lead_id}),
         cursor]
      );

      await client.query(
        `UPDATE campaign_leads
         SET status='SCHEDULED',initial_message_rendered=$2,scheduled_at=$3
         WHERE id=$1 AND sent_at IS NULL`,
        [lead.campaign_lead_id,rendered,cursor]
      );
      scheduled+=1;
      cursor=new Date(cursor.getTime()+nextIntervalSeconds({
        min:campaign.min_interval_seconds,max:campaign.max_interval_seconds,
        fixed:campaign.fixed_interval_seconds
      })*1000);
    }

    await client.query(
      `UPDATE campaigns
       SET status=CASE WHEN $3::int>0 THEN 'RUNNING' ELSE status END,
           started_at=COALESCE(started_at,CASE WHEN $3::int>0 THEN now() ELSE started_at END)
       WHERE id=$1 AND organization_id=$2`,
      [campaign.id,input.organizationId,scheduled]
    );

    await client.query(
      `INSERT INTO audit_logs
       (organization_id,user_id,action,entity_type,entity_id,metadata)
       VALUES ($1,$2,'CAMPAIGN_SCHEDULED','campaign',$3,$4::jsonb)`,
      [input.organizationId,input.userId,campaign.id,JSON.stringify({scheduled})]
    );

    await client.query("COMMIT");
    return {scheduled};
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setCampaignStatus(input:{
  organizationId:string; campaignId:string; userId:string;
  action:"pause"|"resume"|"cancel";
}) {
  const client=await db.connect();
  try {
    await client.query("BEGIN");
    const current=await client.query<{status:CampaignStatus}>(
      `SELECT status FROM campaigns WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [input.campaignId,input.organizationId]
    );
    if(!current.rows[0]) throw Object.assign(new Error("Campanha não encontrada."),{statusCode:404});

    if(input.action==="pause"){
      if(!["RUNNING","SCHEDULED"].includes(current.rows[0].status)) throw Object.assign(new Error("Campanha não pode ser pausada."),{statusCode:409});
      await client.query(`UPDATE campaigns SET status='PAUSED',paused_at=now() WHERE id=$1`,[input.campaignId]);
      await client.query(`UPDATE message_jobs SET status='SCHEDULED' WHERE campaign_id=$1 AND status='PENDING'`,[input.campaignId]);
    } else if(input.action==="resume"){
      if(current.rows[0].status!=="PAUSED") throw Object.assign(new Error("Campanha não está pausada."),{statusCode:409});
      await client.query(`UPDATE campaigns SET status='RUNNING',paused_at=NULL WHERE id=$1`,[input.campaignId]);
    } else {
      if(["FINISHED","CANCELLED"].includes(current.rows[0].status)) throw Object.assign(new Error("Campanha já foi encerrada."),{statusCode:409});
      await client.query(`UPDATE campaigns SET status='CANCELLED',finished_at=now() WHERE id=$1`,[input.campaignId]);
      await client.query(`UPDATE message_jobs SET status='CANCELLED',finished_at=now() WHERE campaign_id=$1 AND status IN ('PENDING','SCHEDULED')`,[input.campaignId]);
      await client.query(`UPDATE campaign_leads SET status='CANCELLED' WHERE campaign_id=$1 AND status IN ('PENDING','SCHEDULED')`,[input.campaignId]);
    }

    await client.query(
      `INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id)
       VALUES ($1,$2,$3,'campaign',$4)`,
      [input.organizationId,input.userId,`CAMPAIGN_${input.action.toUpperCase()}`,input.campaignId]
    );
    await client.query("COMMIT");
  } catch(error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}

export async function listCampaigns(organizationId:string){
  const result=await db.query(
    `SELECT id,name,description,status,starts_at,timezone,target_count,
      processed_count,responded_count,interested_count,error_count,
      started_at,paused_at,finished_at,created_at,updated_at
     FROM campaigns
     WHERE organization_id=$1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return result.rows;
}
