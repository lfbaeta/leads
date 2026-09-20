-- Fase 06 - IA e atendimento automatico

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_debounce_until timestamptz,
  ADD COLUMN IF NOT EXISTS human_takeover_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_resumed_at timestamptz;

ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS temperature numeric(4,3) CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2)),
  ADD COLUMN IF NOT EXISTS max_history_messages integer NOT NULL DEFAULT 30 CHECK (max_history_messages BETWEEN 1 AND 200);

CREATE UNIQUE INDEX IF NOT EXISTS ai_prompts_one_active_scope_idx
  ON ai_prompts (
    organization_id,
    prompt_kind,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE active = true;

CREATE INDEX IF NOT EXISTS conversations_ai_debounce_idx
  ON conversations (organization_id, ai_debounce_until)
  WHERE mode = 'AI' AND ai_paused = false AND closed_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_conversation_received_idx
  ON messages (conversation_id, received_at DESC)
  WHERE direction = 'INBOUND';

CREATE INDEX IF NOT EXISTS ai_files_org_kind_active_idx
  ON ai_files (organization_id, file_kind, active)
  WHERE deleted_at IS NULL;
