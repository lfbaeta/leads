import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  application_name: "leads-crm"
});

db.on("error", (error) => {
  console.error("Erro inesperado no pool PostgreSQL", {
    name: error.name,
    message: error.message
  });
});

export async function closeDatabase(): Promise<void> {
  await db.end();
}
