-- Fase 07 - Conversas e chat
CREATE INDEX IF NOT EXISTS conversations_org_mode_last_message_idx
  ON conversations (organization_id, mode, last_message_at DESC NULLS LAST)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS conversations_org_state_last_message_idx
  ON conversations (organization_id, state, last_message_at DESC NULLS LAST)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_org_conversation_created_desc_idx
  ON messages (organization_id, conversation_id, created_at DESC);
