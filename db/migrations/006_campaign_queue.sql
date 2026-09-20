-- Fase 05 - campanhas e fila persistente

ALTER TABLE campaign_leads
  ADD CONSTRAINT campaign_leads_status_check
  CHECK (status IN (
    'PENDING',
    'SCHEDULED',
    'PROCESSING',
    'WAITING_REPLY',
    'RESPONDED',
    'SKIPPED',
    'FAILED',
    'CANCELLED'
  ));

CREATE UNIQUE INDEX campaign_leads_one_initial_send_idx
  ON campaign_leads (campaign_id, lead_id)
  WHERE sent_at IS NOT NULL;

CREATE INDEX campaign_leads_campaign_schedule_idx
  ON campaign_leads (campaign_id, status, scheduled_at);

CREATE INDEX campaigns_org_created_desc_idx
  ON campaigns (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX message_jobs_org_status_available_idx
  ON message_jobs (organization_id, status, available_at)
  WHERE status IN ('PENDING', 'SCHEDULED');
