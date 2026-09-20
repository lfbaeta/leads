import type { PoolClient } from "pg";
import { db } from "../db/pool.js";

export type MessageJob = {
  id: string;
  organization_id: string;
  job_type: string;
  lead_id: string | null;
  campaign_id: string | null;
  conversation_id: string | null;
  instance_id: string | null;
  message_id: string | null;
  status: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  scheduled_at: Date | null;
  available_at: Date;
};

export async function claimNextMessageJob(
  workerName: string,
  acceptedJobTypes: readonly string[]
): Promise<MessageJob | null> {
  if (acceptedJobTypes.length === 0) return null;

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<MessageJob>(
      `
      SELECT
        id, organization_id, job_type, lead_id, campaign_id,
        conversation_id, instance_id, message_id, status,
        idempotency_key, payload, attempts, max_attempts,
        scheduled_at, available_at
      FROM message_jobs
      WHERE status IN ('PENDING', 'SCHEDULED')
        AND available_at <= now()
        AND (
          campaign_id IS NULL OR EXISTS (
            SELECT 1 FROM campaigns c
            WHERE c.id = message_jobs.campaign_id
              AND c.organization_id = message_jobs.organization_id
              AND c.status = 'RUNNING'
          )
        )
        AND job_type = ANY($1::text[])
        AND attempts < max_attempts
      ORDER BY available_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `,
      [acceptedJobTypes]
    );

    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
      UPDATE message_jobs
      SET status = 'PROCESSING',
          attempts = attempts + 1,
          locked_at = now(),
          locked_by = $2,
          updated_at = now()
      WHERE id = $1
      `,
      [job.id, workerName]
    );

    await client.query("COMMIT");

    return {
      ...job,
      status: "PROCESSING",
      attempts: job.attempts + 1
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markJobSucceeded(
  client: PoolClient,
  jobId: string
): Promise<void> {
  await client.query(
    `
    UPDATE message_jobs
    SET status = 'SENT',
        finished_at = now(),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = now()
    WHERE id = $1 AND status = 'PROCESSING'
    `,
    [jobId]
  );
}

export async function markJobFailed(
  jobId: string,
  sanitizedError: string,
  retryAt: Date | null
): Promise<void> {
  await db.query(
    `
    UPDATE message_jobs
    SET status = CASE
          WHEN $3::timestamptz IS NULL OR attempts >= max_attempts THEN 'FAILED'
          ELSE 'PENDING'
        END,
        available_at = COALESCE($3::timestamptz, available_at),
        last_error = $2,
        locked_at = NULL,
        locked_by = NULL,
        finished_at = CASE
          WHEN $3::timestamptz IS NULL OR attempts >= max_attempts THEN now()
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = $1
    `,
    [jobId, sanitizedError.slice(0, 1000), retryAt]
  );
}

export async function recoverStaleJobs(staleAfterSeconds: number): Promise<number> {
  const result = await db.query(
    `
    UPDATE message_jobs
    SET status = 'PENDING',
        locked_at = NULL,
        locked_by = NULL,
        available_at = now() + interval '30 seconds',
        last_error = COALESCE(last_error, 'Job recuperado apos worker interrompido'),
        updated_at = now()
    WHERE status = 'PROCESSING'
      AND locked_at < now() - ($1 * interval '1 second')
      AND attempts < max_attempts
    `,
    [staleAfterSeconds]
  );

  return result.rowCount ?? 0;
}
