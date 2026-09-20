-- Fase 02 - persistencia do preview de importacao

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS opt_out_rows integer NOT NULL DEFAULT 0
    CHECK (opt_out_rows >= 0);

ALTER TABLE import_rows
  ADD COLUMN IF NOT EXISTS mapped_data jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS import_rows_phone_idx
  ON import_rows (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;
