import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { db } from "../../db/pool.js";

type ComponentStatus = "UP" | "DOWN" | "NOT_CONFIGURED";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    let database: ComponentStatus = "DOWN";
    let worker: ComponentStatus = "DOWN";
    let workerLastHeartbeat: string | null = null;
    let databaseError: string | null = null;

    try {
      await db.query("SELECT 1");
      database = "UP";

      const heartbeat = await db.query<{ last_heartbeat_at: Date }>(
        `
        SELECT last_heartbeat_at
        FROM worker_heartbeats
        WHERE last_heartbeat_at >= now() - ($1 * interval '1 second')
        ORDER BY last_heartbeat_at DESC
        LIMIT 1
        `,
        [env.WORKER_STALE_AFTER_SECONDS]
      );

      if (heartbeat.rows[0]) {
        worker = "UP";
        workerLastHeartbeat = heartbeat.rows[0].last_heartbeat_at.toISOString();
      }
    } catch (error) {
      databaseError = error instanceof Error ? error.message : "Falha desconhecida no banco";
    }

    const status = database === "UP" && worker === "UP" ? "ok" : "degraded";

    const payload = {
      status,
      timestamp: new Date().toISOString(),
      components: {
        api: "UP" as const,
        database,
        worker,
        workerLastHeartbeat,
        storage: "NOT_CONFIGURED" as const,
        whatsapp: "NOT_CONFIGURED" as const,
        ai: "NOT_CONFIGURED" as const
      },
      ...(databaseError ? { databaseError } : {})
    };

    return reply.code(database === "UP" ? 200 : 503).send(payload);
  });
}
