import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL nao definida. Copie .env.example para .env e configure a conexao.");
}

const sslEnabled = !["0", "false", "no", "off"].includes(
  (process.env.DATABASE_SSL ?? "true").toLowerCase()
);

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  application_name: "leads-migrations"
});

const currentFile = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [file]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(
          `Migration ${file} foi alterada depois de aplicada. Crie uma nova migration em vez de editar a antiga.`
        );
      }
      console.log(`skip  ${file}`);
      continue;
    }

    console.log(`apply ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [file, checksum]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("Migrations concluidas.");
} finally {
  await client.end();
}
