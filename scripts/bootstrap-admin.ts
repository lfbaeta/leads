import "dotenv/config";
import { hashPassword } from "../src/auth/password.js";
import { db, closeDatabase } from "../src/db/pool.js";

const organizationName = process.env.INITIAL_ORG_NAME?.trim() || "Leads";
const organizationSlug = process.env.INITIAL_ORG_SLUG?.trim() || "leads";
const adminName = process.env.INITIAL_ADMIN_NAME?.trim();
const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim();
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!adminName || !adminEmail || !adminPassword) {
  throw new Error(
    "Defina INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD no .env."
  );
}

const passwordHash = await hashPassword(adminPassword);
const client = await db.connect();

try {
  await client.query("BEGIN");

  const orgResult = await client.query<{ id: string }>(
    `
    INSERT INTO organizations (name, slug)
    VALUES ($1, $2)
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    RETURNING id
    `,
    [organizationName, organizationSlug]
  );

  const organizationId = orgResult.rows[0]?.id;
  if (!organizationId) throw new Error("Falha ao criar organizacao.");

  const existing = await client.query<{ id: string }>(
    `
    SELECT id
    FROM users
    WHERE organization_id = $1
      AND lower(email) = lower($2)
      AND deleted_at IS NULL
    LIMIT 1
    `,
    [organizationId, adminEmail]
  );

  if (existing.rows[0]) {
    throw new Error(
      "O administrador ja existe. O bootstrap nao altera senhas existentes."
    );
  }

  await client.query(
    `
    INSERT INTO users (
      organization_id,
      name,
      email,
      password_hash,
      role,
      active
    )
    VALUES ($1, $2, $3, $4, 'ADMIN', true)
    `,
    [organizationId, adminName, adminEmail, passwordHash]
  );

  await client.query("COMMIT");
  console.log("Administrador inicial criado com sucesso.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await closeDatabase();
}
