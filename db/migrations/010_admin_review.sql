-- Fase 09 - painel e revisão
CREATE INDEX IF NOT EXISTS audit_logs_org_action_created_idx ON audit_logs (organization_id,action,created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_org_unread_idx ON conversations (organization_id,unread_count) WHERE closed_at IS NULL AND unread_count > 0;
