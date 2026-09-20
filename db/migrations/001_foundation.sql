-- Leads CRM - Fundacao do banco
-- PostgreSQL portavel: funciona no Supabase e pode ser migrado para outro PostgreSQL.
-- Nenhum dado ficticio de producao e inserido por esta migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  locale text NOT NULL DEFAULT 'pt-BR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'ATTENDANT'
    CHECK (role IN ('ADMIN', 'ATTENDANT')),
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX users_org_email_unique
  ON users (organization_id, lower(email))
  WHERE deleted_at IS NULL;

CREATE TABLE instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  provider text NOT NULL
    CHECK (provider IN ('EVOLUTION_API', 'EVOLUTION_GO')),
  base_url text NOT NULL,
  api_key_encrypted text,
  webhook_secret_encrypted text,
  instance_name text NOT NULL,
  provider_version text,
  phone text,
  status text NOT NULL DEFAULT 'DISCONNECTED',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX instances_org_provider_name_unique
  ON instances (organization_id, provider, instance_name)
  WHERE deleted_at IS NULL;

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  phone_original text NOT NULL,
  phone_normalized text NOT NULL,
  company text,
  city text,
  source text,
  notes text,
  status text NOT NULL DEFAULT 'NEW',
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  preferred_instance_id uuid REFERENCES instances(id) ON DELETE SET NULL,
  ai_enabled boolean NOT NULL DEFAULT true,
  opt_out boolean NOT NULL DEFAULT false,
  opt_out_at timestamptz,
  consent_basis text,
  consent_at timestamptz,
  last_message_at timestamptz,
  last_response_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX leads_org_phone_unique
  ON leads (organization_id, phone_normalized)
  WHERE deleted_at IS NULL;

CREATE INDEX leads_org_status_idx ON leads (organization_id, status);
CREATE INDEX leads_org_created_idx ON leads (organization_id, created_at DESC);
CREATE INDEX leads_phone_idx ON leads (phone_normalized);
CREATE INDEX leads_assigned_user_idx ON leads (assigned_user_id);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX tags_org_name_unique
  ON tags (organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE TABLE lead_tags (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX lead_tags_org_idx ON lead_tags (organization_id);
CREATE INDEX lead_tags_tag_idx ON lead_tags (tag_id);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  initial_message text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'FINISHED', 'CANCELLED', 'ERROR')),
  instance_id uuid REFERENCES instances(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  allowed_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  send_window_start time,
  send_window_end time,
  min_interval_seconds integer NOT NULL DEFAULT 25 CHECK (min_interval_seconds >= 0),
  max_interval_seconds integer NOT NULL DEFAULT 80 CHECK (max_interval_seconds >= 0),
  fixed_interval_seconds integer CHECK (fixed_interval_seconds IS NULL OR fixed_interval_seconds >= 0),
  target_count integer NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  responded_count integer NOT NULL DEFAULT 0 CHECK (responded_count >= 0),
  interested_count integer NOT NULL DEFAULT 0 CHECK (interested_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  started_at timestamptz,
  paused_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (max_interval_seconds >= min_interval_seconds)
);

CREATE INDEX campaigns_org_status_idx ON campaigns (organization_id, status);
CREATE INDEX campaigns_instance_idx ON campaigns (instance_id);

CREATE TABLE campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING',
  initial_message_rendered text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX campaign_leads_org_status_idx ON campaign_leads (organization_id, status);
CREATE INDEX campaign_leads_lead_idx ON campaign_leads (lead_id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES instances(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'PRESENTATION',
  mode text NOT NULL DEFAULT 'AI'
    CHECK (mode IN ('AI', 'HUMAN')),
  ai_paused boolean NOT NULL DEFAULT false,
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, lead_id)
);

CREATE INDEX conversations_org_last_message_idx
  ON conversations (organization_id, last_message_at DESC NULLS LAST);
CREATE INDEX conversations_instance_idx ON conversations (instance_id);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX attachments_org_storage_key_unique
  ON attachments (organization_id, storage_provider, storage_key)
  WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES instances(id) ON DELETE SET NULL,
  reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  message_type text NOT NULL DEFAULT 'TEXT'
    CHECK (message_type IN ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'PDF', 'LINK', 'LOCATION', 'UNKNOWN')),
  origin text NOT NULL DEFAULT 'SYSTEM'
    CHECK (origin IN ('CAMPAIGN', 'AI', 'HUMAN', 'SYSTEM')),
  content text,
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'RECEIVED', 'FAILED')),
  provider text,
  external_message_id text,
  provider_timestamp timestamptz,
  ai_model text,
  ai_prompt_version integer,
  ai_input_tokens integer,
  ai_output_tokens integer,
  ai_estimated_cost numeric(14,6),
  ai_latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX messages_external_id_unique
  ON messages (organization_id, instance_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX messages_conversation_created_idx
  ON messages (conversation_id, created_at ASC);
CREATE INDEX messages_lead_idx ON messages (lead_id);
CREATE INDEX messages_status_idx ON messages (organization_id, status);

CREATE TABLE message_attachments (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, attachment_id)
);

CREATE TABLE message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_type text NOT NULL DEFAULT 'WHATSAPP_SEND',
  lead_id uuid REFERENCES leads(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE RESTRICT,
  conversation_id uuid REFERENCES conversations(id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES instances(id) ON DELETE RESTRICT,
  message_id uuid REFERENCES messages(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED')),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX message_jobs_poll_idx
  ON message_jobs (status, available_at, created_at)
  WHERE status IN ('PENDING', 'SCHEDULED');
CREATE INDEX message_jobs_campaign_idx ON message_jobs (campaign_id);
CREATE INDEX message_jobs_conversation_idx ON message_jobs (conversation_id);
CREATE INDEX message_jobs_instance_idx ON message_jobs (instance_id);
CREATE INDEX message_jobs_lead_idx ON message_jobs (lead_id);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, external_event_id)
);

CREATE INDEX webhook_events_status_idx
  ON webhook_events (organization_id, status, created_at);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'UPLOADED',
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  duplicate_rows integer NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  existing_rows integer NOT NULL DEFAULT 0 CHECK (existing_rows >= 0),
  imported_rows integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_jobs_org_created_idx
  ON import_jobs (organization_id, created_at DESC);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  validation_status text NOT NULL DEFAULT 'PENDING',
  phone_original text,
  phone_normalized text,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, row_number)
);

CREATE INDEX import_rows_job_status_idx
  ON import_rows (import_job_id, validation_status);

CREATE TABLE ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  provider text,
  model text,
  enabled boolean NOT NULL DEFAULT false,
  debounce_seconds integer NOT NULL DEFAULT 7 CHECK (debounce_seconds BETWEEN 1 AND 120),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 20),
  fallback_to_human boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_kind text NOT NULL CHECK (prompt_kind IN ('SYSTEM', 'COMMERCIAL')),
  scope_type text NOT NULL DEFAULT 'GLOBAL'
    CHECK (scope_type IN ('GLOBAL', 'ORGANIZATION', 'CAMPAIGN', 'INSTANCE')),
  scope_id uuid,
  version integer NOT NULL CHECK (version >= 1),
  prompt text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, prompt_kind, scope_type, scope_id, version)
);

CREATE INDEX ai_prompts_active_idx
  ON ai_prompts (organization_id, active, prompt_kind);

CREATE TABLE ai_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  file_kind text NOT NULL CHECK (file_kind IN ('KNOWLEDGE', 'SENDABLE')),
  name text NOT NULL,
  description text,
  category text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  when_to_send text,
  when_not_to_send text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  phone_normalized text NOT NULL,
  reason text,
  source text NOT NULL DEFAULT 'MANUAL',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone_normalized)
);

CREATE INDEX opt_outs_phone_idx ON opt_outs (phone_normalized);

CREATE TABLE system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, setting_key)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_created_idx
  ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx
  ON audit_logs (entity_type, entity_id);

CREATE TABLE worker_heartbeats (
  worker_name text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER instances_updated_at
BEFORE UPDATE ON instances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER leads_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tags_updated_at
BEFORE UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaign_leads_updated_at
BEFORE UPDATE ON campaign_leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER messages_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER message_jobs_updated_at
BEFORE UPDATE ON message_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER import_jobs_updated_at
BEFORE UPDATE ON import_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ai_settings_updated_at
BEFORE UPDATE ON ai_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ai_files_updated_at
BEFORE UPDATE ON ai_files
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
