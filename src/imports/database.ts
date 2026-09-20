import type { PoolClient } from "pg";
import { db } from "../db/pool.js";
import {
  countImportRows,
  type ImportAnalysis,
  type ImportPreviewRow
} from "./analyzer.js";

export type ExistingImportStrategy = "IGNORE" | "UPDATE" | "MERGE";

type ExistingLeadLookup = {
  phone_normalized: string;
  opt_out: boolean;
};

type ImportJobRow = {
  id: string;
  status: string;
};

export async function enrichImportAnalysisFromDatabase(
  organizationId: string,
  analysis: ImportAnalysis
): Promise<ImportAnalysis> {
  const phones = analysis.rows
    .filter((row) => row.status === "VALID")
    .map((row) => row.lead.phoneNormalized)
    .filter((phone): phone is string => Boolean(phone));

  if (phones.length === 0) return analysis;

  const [existingResult, optOutResult] = await Promise.all([
    db.query<ExistingLeadLookup>(
      `
      SELECT phone_normalized, opt_out
      FROM leads
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND phone_normalized = ANY($2::text[])
      `,
      [organizationId, phones]
    ),
    db.query<{ phone_normalized: string }>(
      `
      SELECT phone_normalized
      FROM opt_outs
      WHERE organization_id = $1
        AND phone_normalized = ANY($2::text[])
      `,
      [organizationId, phones]
    )
  ]);

  const existingPhones = new Map(
    existingResult.rows.map((row) => [row.phone_normalized, row])
  );

  const optOutPhones = new Set(
    optOutResult.rows.map((row) => row.phone_normalized)
  );

  for (const row of existingResult.rows) {
    if (row.opt_out) optOutPhones.add(row.phone_normalized);
  }

  const rows: ImportPreviewRow[] = analysis.rows.map((row) => {
    const phone = row.lead.phoneNormalized;

    if (row.status !== "VALID" || !phone) return row;

    if (optOutPhones.has(phone)) {
      return {
        ...row,
        status: "OPT_OUT",
        errors: [...row.errors, "Telefone consta na lista de não contatar"]
      };
    }

    if (existingPhones.has(phone)) {
      return {
        ...row,
        status: "EXISTING",
        errors: [...row.errors, "Telefone já cadastrado no CRM"]
      };
    }

    return row;
  });

  return {
    ...analysis,
    rows,
    counts: countImportRows(rows)
  };
}

export async function persistImportPreview(input: {
  organizationId: string;
  createdBy?: string | null;
  fileName: string;
  analysis: ImportAnalysis;
}): Promise<string> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const jobResult = await client.query<{ id: string }>(
      `
      INSERT INTO import_jobs (
        organization_id,
        created_by,
        file_name,
        status,
        field_mapping,
        total_rows,
        valid_rows,
        invalid_rows,
        duplicate_rows,
        existing_rows,
        opt_out_rows,
        imported_rows
      )
      VALUES (
        $1, $2, $3, 'PREVIEWED', $4::jsonb,
        $5, $6, $7, $8, $9, $10, 0
      )
      RETURNING id
      `,
      [
        input.organizationId,
        input.createdBy ?? null,
        input.fileName,
        JSON.stringify(input.analysis.mapping),
        input.analysis.counts.total,
        input.analysis.counts.valid,
        input.analysis.counts.invalid,
        input.analysis.counts.duplicate,
        input.analysis.counts.existing,
        input.analysis.counts.optOut
      ]
    );

    const importJobId = jobResult.rows[0]?.id;
    if (!importJobId) {
      throw new Error("Falha ao criar registro da importação.");
    }

    if (input.analysis.rows.length > 0) {
      const rowsPayload = input.analysis.rows.map((row) => ({
        row_number: row.rowNumber,
        raw_data: row.rawData,
        mapped_data: row.lead,
        validation_status: row.status,
        phone_original: row.lead.phoneOriginal,
        phone_normalized: row.lead.phoneNormalized,
        validation_errors: row.errors
      }));

      await client.query(
        `
        INSERT INTO import_rows (
          organization_id,
          import_job_id,
          row_number,
          raw_data,
          mapped_data,
          validation_status,
          phone_original,
          phone_normalized,
          validation_errors
        )
        SELECT
          $1,
          $2,
          x.row_number,
          x.raw_data,
          x.mapped_data,
          x.validation_status,
          x.phone_original,
          x.phone_normalized,
          x.validation_errors
        FROM jsonb_to_recordset($3::jsonb) AS x(
          row_number integer,
          raw_data jsonb,
          mapped_data jsonb,
          validation_status text,
          phone_original text,
          phone_normalized text,
          validation_errors jsonb
        )
        `,
        [
          input.organizationId,
          importJobId,
          JSON.stringify(rowsPayload)
        ]
      );
    }

    await client.query("COMMIT");
    return importJobId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function lockImportJob(
  client: PoolClient,
  organizationId: string,
  importJobId: string
): Promise<ImportJobRow> {
  const result = await client.query<ImportJobRow>(
    `
    SELECT id, status
    FROM import_jobs
    WHERE id = $1
      AND organization_id = $2
    FOR UPDATE
    `,
    [importJobId, organizationId]
  );

  const job = result.rows[0];
  if (!job) throw new Error("Importação não encontrada.");
  if (job.status !== "PREVIEWED") {
    throw new Error("Esta importação já foi confirmada, cancelada ou não está pronta.");
  }

  return job;
}

async function importNewRows(
  client: PoolClient,
  organizationId: string,
  importJobId: string
): Promise<number> {
  const result = await client.query(
    `
    WITH candidates AS (
      SELECT
        ir.id AS import_row_id,
        ir.mapped_data,
        ir.phone_original,
        ir.phone_normalized
      FROM import_rows ir
      WHERE ir.organization_id = $1
        AND ir.import_job_id = $2
        AND ir.validation_status = 'VALID'
        AND ir.phone_normalized IS NOT NULL
    ),
    inserted AS (
      INSERT INTO leads (
        organization_id,
        name,
        company,
        phone_original,
        phone_normalized,
        address,
        email,
        website,
        city,
        source,
        notes,
        custom_fields,
        status,
        opt_out
      )
      SELECT
        $1,
        COALESCE(NULLIF(c.mapped_data->>'name', ''), NULLIF(c.mapped_data->>'company', '')),
        NULLIF(c.mapped_data->>'company', ''),
        c.phone_original,
        c.phone_normalized,
        NULLIF(c.mapped_data->>'address', ''),
        NULLIF(c.mapped_data->>'email', ''),
        NULLIF(c.mapped_data->>'website', ''),
        NULLIF(c.mapped_data->>'city', ''),
        COALESCE(NULLIF(c.mapped_data->>'source', ''), 'planilha'),
        NULLIF(c.mapped_data->>'notes', ''),
        COALESCE(c.mapped_data->'customFields', '{}'::jsonb),
        'NEW',
        false
      FROM candidates c
      WHERE NOT EXISTS (
        SELECT 1
        FROM opt_outs o
        WHERE o.organization_id = $1
          AND o.phone_normalized = c.phone_normalized
      )
      ON CONFLICT DO NOTHING
      RETURNING id, phone_normalized
    )
    UPDATE import_rows ir
    SET lead_id = i.id,
        validation_status = 'IMPORTED'
    FROM inserted i
    WHERE ir.organization_id = $1
      AND ir.import_job_id = $2
      AND ir.phone_normalized = i.phone_normalized
      AND ir.validation_status = 'VALID'
    `,
    [organizationId, importJobId]
  );

  return result.rowCount ?? 0;
}

async function handleExistingRows(
  client: PoolClient,
  organizationId: string,
  importJobId: string,
  strategy: ExistingImportStrategy
): Promise<number> {
  if (strategy === "IGNORE") {
    const skipped = await client.query(
      `
      UPDATE import_rows
      SET validation_status = 'SKIPPED_EXISTING'
      WHERE organization_id = $1
        AND import_job_id = $2
        AND validation_status = 'EXISTING'
      `,
      [organizationId, importJobId]
    );

    return skipped.rowCount ?? 0;
  }

  const isUpdate = strategy === "UPDATE";

  const result = await client.query(
    `
    WITH source_rows AS (
      SELECT
        ir.id AS import_row_id,
        ir.mapped_data,
        ir.phone_normalized
      FROM import_rows ir
      WHERE ir.organization_id = $1
        AND ir.import_job_id = $2
        AND ir.validation_status = 'EXISTING'
        AND ir.phone_normalized IS NOT NULL
    ),
    updated AS (
      UPDATE leads l
      SET
        name = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'name', ''), l.name)
          ELSE COALESCE(l.name, NULLIF(s.mapped_data->>'name', ''))
        END,
        company = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'company', ''), l.company)
          ELSE COALESCE(l.company, NULLIF(s.mapped_data->>'company', ''))
        END,
        address = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'address', ''), l.address)
          ELSE COALESCE(l.address, NULLIF(s.mapped_data->>'address', ''))
        END,
        email = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'email', ''), l.email)
          ELSE COALESCE(l.email, NULLIF(s.mapped_data->>'email', ''))
        END,
        website = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'website', ''), l.website)
          ELSE COALESCE(l.website, NULLIF(s.mapped_data->>'website', ''))
        END,
        city = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'city', ''), l.city)
          ELSE COALESCE(l.city, NULLIF(s.mapped_data->>'city', ''))
        END,
        notes = CASE
          WHEN $3::boolean THEN COALESCE(NULLIF(s.mapped_data->>'notes', ''), l.notes)
          ELSE COALESCE(l.notes, NULLIF(s.mapped_data->>'notes', ''))
        END,
        custom_fields = CASE
          WHEN $3::boolean
            THEN l.custom_fields || COALESCE(s.mapped_data->'customFields', '{}'::jsonb)
          ELSE COALESCE(s.mapped_data->'customFields', '{}'::jsonb) || l.custom_fields
        END
      FROM source_rows s
      WHERE l.organization_id = $1
        AND l.deleted_at IS NULL
        AND l.phone_normalized = s.phone_normalized
        AND l.opt_out = false
      RETURNING l.id, l.phone_normalized
    )
    UPDATE import_rows ir
    SET
      lead_id = u.id,
      validation_status = CASE WHEN $3::boolean THEN 'UPDATED' ELSE 'MERGED' END
    FROM updated u
    WHERE ir.organization_id = $1
      AND ir.import_job_id = $2
      AND ir.phone_normalized = u.phone_normalized
      AND ir.validation_status = 'EXISTING'
    `,
    [organizationId, importJobId, isUpdate]
  );

  return result.rowCount ?? 0;
}

async function markRaceConflicts(
  client: PoolClient,
  organizationId: string,
  importJobId: string
): Promise<number> {
  const result = await client.query(
    `
    UPDATE import_rows ir
    SET
      validation_status = 'SKIPPED_EXISTING',
      lead_id = l.id,
      validation_errors =
        COALESCE(ir.validation_errors, '[]'::jsonb)
        || '["Contato passou a existir antes da confirmação"]'::jsonb
    FROM leads l
    WHERE ir.organization_id = $1
      AND ir.import_job_id = $2
      AND ir.validation_status = 'VALID'
      AND l.organization_id = $1
      AND l.deleted_at IS NULL
      AND l.phone_normalized = ir.phone_normalized
    `,
    [organizationId, importJobId]
  );

  return result.rowCount ?? 0;
}

export async function confirmImportJob(input: {
  organizationId: string;
  importJobId: string;
  strategy: ExistingImportStrategy;
  userId?: string | null;
}): Promise<{
  imported: number;
  existingHandled: number;
  raceSkipped: number;
}> {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await lockImportJob(client, input.organizationId, input.importJobId);

    const imported = await importNewRows(
      client,
      input.organizationId,
      input.importJobId
    );

    const existingHandled = await handleExistingRows(
      client,
      input.organizationId,
      input.importJobId,
      input.strategy
    );

    const raceSkipped = await markRaceConflicts(
      client,
      input.organizationId,
      input.importJobId
    );

    const countResult = await client.query<{ count: string }>(
      `
      SELECT count(*)::text AS count
      FROM import_rows
      WHERE organization_id = $1
        AND import_job_id = $2
        AND validation_status IN ('IMPORTED', 'UPDATED', 'MERGED')
      `,
      [input.organizationId, input.importJobId]
    );

    const importedRows = Number(countResult.rows[0]?.count ?? 0);

    await client.query(
      `
      UPDATE import_jobs
      SET
        status = 'COMPLETED',
        imported_rows = $3,
        finished_at = now(),
        updated_at = now()
      WHERE id = $1
        AND organization_id = $2
      `,
      [input.importJobId, input.organizationId, importedRows]
    );

    await client.query(
      `
      INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        after_data
      )
      VALUES (
        $1,
        $2,
        'IMPORT_CONFIRMED',
        'import_job',
        $3,
        $4::jsonb
      )
      `,
      [
        input.organizationId,
        input.userId ?? null,
        input.importJobId,
        JSON.stringify({
          strategy: input.strategy,
          imported,
          existingHandled,
          raceSkipped
        })
      ]
    );

    await client.query("COMMIT");

    return {
      imported,
      existingHandled,
      raceSkipped
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
