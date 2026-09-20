-- Fase 08 - WhatsApp providers e webhooks

ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS webhook_secret_hash text,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS instances_org_provider_active_idx
  ON instances (organization_id, provider, active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS webhook_events_instance_created_idx
  ON webhook_events (instance_id, created_at DESC);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_origin_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_origin_check
  CHECK (origin IN ('CAMPAIGN','AI','HUMAN','SYSTEM','CUSTOMER'));
