import { env } from "../config/env.js";
import { closeDatabase, db } from "../db/pool.js";
import { recoverStaleJobs } from "../queue/repository.js";

let shuttingDown = false;
const startedAt = new Date();

async function heartbeat(): Promise<void> {
  await db.query(
    `
    INSERT INTO worker_heartbeats (
      worker_name,
      started_at,
      last_heartbeat_at,
      metadata
    )
    VALUES ($1, $2, now(), $3::jsonb)
    ON CONFLICT (worker_name)
    DO UPDATE SET
      started_at = EXCLUDED.started_at,
      last_heartbeat_at = now(),
      metadata = EXCLUDED.metadata
    `,
    [
      env.WORKER_NAME,
      startedAt,
      JSON.stringify({
        pid: process.pid,
        dryRun: env.DRY_RUN,
        version: "0.1.0"
      })
    ]
  );
}

async function maintenanceCycle(): Promise<void> {
  await heartbeat();

  const recovered = await recoverStaleJobs(env.WORKER_STALE_AFTER_SECONDS);
  if (recovered > 0) {
    console.warn("[worker] " + recovered + " job(s) travado(s) recuperado(s)");
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("[worker] encerrando por " + signal);
  await closeDatabase();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.info(
  "[worker] " + env.WORKER_NAME + " iniciado. DRY_RUN=" + env.DRY_RUN + ". " +
  "O processamento real de WhatsApp sera habilitado somente na etapa de providers."
);

try {
  await maintenanceCycle();

  setInterval(() => {
    if (shuttingDown) return;

    void maintenanceCycle().catch((error) => {
      console.error("[worker] falha no ciclo de manutencao", error);
    });
  }, env.WORKER_HEARTBEAT_SECONDS * 1000);
} catch (error) {
  console.error("[worker] falha ao iniciar", error);
  await closeDatabase();
  process.exit(1);
}
