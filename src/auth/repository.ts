import { db } from "../db/pool.js";
import type { AuthContext, UserRole } from "./types.js";
import { createSessionToken, hashSessionToken } from "./session.js";
import { verifyPassword } from "./password.js";

type LoginUserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  organization_name: string;
};

export type LoginResult = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organizationId: string;
    organizationName: string;
  };
};

export async function authenticateUser(input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  sessionTtlHours: number;
}): Promise<LoginResult | null> {
  const result = await db.query<LoginUserRow>(
    `
    SELECT
      u.id, u.organization_id, u.name, u.email,
      u.password_hash, u.role, o.name AS organization_name
    FROM users u
    JOIN organizations o ON o.id = u.organization_id
    WHERE lower(u.email) = lower($1)
      AND u.active = true
      AND u.deleted_at IS NULL
      AND o.active = true
    LIMIT 1
    `,
    [input.email.trim()]
  );

  const user = result.rows[0];
  if (!user) return null;

  if (!(await verifyPassword(input.password, user.password_hash))) {
    return null;
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + input.sessionTtlHours * 3600000);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO auth_sessions (
        organization_id, user_id, token_hash,
        user_agent, ip_address, expires_at
      )
      VALUES ($1, $2, $3, $4, $5::inet, $6)
      `,
      [
        user.organization_id,
        user.id,
        tokenHash,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        expiresAt
      ]
    );

    await client.query(
      "UPDATE users SET last_login_at = now() WHERE id = $1",
      [user.id]
    );

    await client.query(
      `
      INSERT INTO audit_logs (
        organization_id, user_id, action,
        entity_type, entity_id, metadata, ip_address
      )
      VALUES (
        $1, $2, 'AUTH_LOGIN_SUCCESS',
        'user', $2, $3::jsonb, $4::inet
      )
      `,
      [
        user.organization_id,
        user.id,
        JSON.stringify({ userAgent: input.userAgent ?? null }),
        input.ipAddress ?? null
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      organizationName: user.organization_name
    }
  };
}

export async function resolveSession(token: string): Promise<AuthContext | null> {
  const result = await db.query<{
    session_id: string;
    user_id: string;
    organization_id: string;
    user_name: string;
    email: string;
    role: UserRole;
    organization_name: string;
  }>(
    `
    SELECT
      s.id AS session_id,
      u.id AS user_id,
      u.organization_id,
      u.name AS user_name,
      u.email,
      u.role,
      o.name AS organization_name
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN organizations o ON o.id = u.organization_id
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.active = true
      AND u.deleted_at IS NULL
      AND o.active = true
    LIMIT 1
    `,
    [hashSessionToken(token)]
  );

  const row = result.rows[0];
  if (!row) return null;

  void db.query(
    `
    UPDATE auth_sessions
    SET last_seen_at = now()
    WHERE id = $1
      AND last_seen_at < now() - interval '5 minutes'
    `,
    [row.session_id]
  ).catch(() => {});

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    userName: row.user_name,
    email: row.email,
    role: row.role,
    organizationName: row.organization_name
  };
}

export async function revokeSession(
  sessionId: string,
  organizationId: string,
  userId: string
): Promise<void> {
  await db.query(
    `
    UPDATE auth_sessions
    SET revoked_at = now()
    WHERE id = $1
      AND organization_id = $2
      AND user_id = $3
      AND revoked_at IS NULL
    `,
    [sessionId, organizationId, userId]
  );
}
