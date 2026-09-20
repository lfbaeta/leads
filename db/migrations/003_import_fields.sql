-- Fase 02 - campos flexiveis para importacao de agendas/planilhas

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS leads_org_company_idx
  ON leads (organization_id, lower(company))
  WHERE deleted_at IS NULL AND company IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_org_city_idx
  ON leads (organization_id, lower(city))
  WHERE deleted_at IS NULL AND city IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_org_email_idx
  ON leads (organization_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

COMMENT ON COLUMN leads.custom_fields IS
  'Campos adicionais vindos de importacoes sem perda do dado original. Nao usar para segredos.';
