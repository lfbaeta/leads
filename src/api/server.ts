import { buildApp } from "./app.js";
import { env } from "../config/env.js";
import { closeDatabase } from "../db/pool.js";

const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Encerrando API");
  await app.close();
  await closeDatabase();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({
    port: env.PORT,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  await closeDatabase();
  process.exit(1);
}
