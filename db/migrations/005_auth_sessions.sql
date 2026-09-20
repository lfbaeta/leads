-- Fase 03 - autenticacao, sessoes e hardening do banco

ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX auth_sessions_org_active_idx
  ON auth_sessions (organization_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_files_attachment_id_idx ON ai_files (attachment_id);
CREATE INDEX IF NOT EXISTS ai_files_organization_id_idx ON ai_files (organization_id);
CREATE INDEX IF NOT EXISTS ai_prompts_created_by_idx ON ai_prompts (created_by);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS campaigns_created_by_idx ON campaigns (created_by);
CREATE INDEX IF NOT EXISTS conversations_lead_id_idx ON conversations (lead_id);
CREATE INDEX IF NOT EXISTS import_jobs_attachment_id_idx ON import_jobs (attachment_id);
CREATE INDEX IF NOT EXISTS import_jobs_created_by_idx ON import_jobs (created_by);
CREATE INDEX IF NOT EXISTS import_rows_lead_id_idx ON import_rows (lead_id);
CREATE INDEX IF NOT EXISTS leads_preferred_instance_id_idx ON leads (preferred_instance_id);
CREATE INDEX IF NOT EXISTS message_attachments_attachment_id_idx ON message_attachments (attachment_id);
CREATE INDEX IF NOT EXISTS message_jobs_message_id_idx ON message_jobs (message_id);
CREATE INDEX IF NOT EXISTS messages_instance_id_idx ON messages (instance_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_message_id_idx ON messages (reply_to_message_id);
CREATE INDEX IF NOT EXISTS opt_outs_lead_id_idx ON opt_outs (lead_id);
CREATE INDEX IF NOT EXISTS system_settings_updated_by_idx ON system_settings (updated_by);
