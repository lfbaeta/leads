import { db } from "../db/pool.js";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "WAITING_REPLY"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "IN_SERVICE"
  | "CONVERTED"
  | "DO_NOT_CONTACT"
  | "INVALID"
  | "ARCHIVED";

export type LeadListFilters = {
  search?: string;
  status?: LeadStatus;
  city?: string;
  page: number;
  pageSize: number;
};

export async function listLeads(
  organizationId: string,
  filters: LeadListFilters
) {
  const values: unknown[] = [organizationId];
  const where = [
    "l.organization_id = $1",
    "l.deleted_at IS NULL"
  ];

  if (filters.status) {
    values.push(filters.status);
    where.push(`l.status = $${values.length}`);
  }

  if (filters.city) {
    values.push(`%${filters.city.trim()}%`);
    where.push(`l.city ILIKE $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search.trim()}%`);
    const p = values.length;
    where.push(
      `(l.name ILIKE $${p} OR l.company ILIKE $${p} OR l.phone_original ILIKE $${p} OR l.phone_normalized ILIKE $${p} OR l.email ILIKE $${p})`
    );
  }

  values.push(filters.pageSize);
  const limitParam = values.length;
  values.push((filters.page - 1) * filters.pageSize);
  const offsetParam = values.length;

  const result = await db.query(
    `
    SELECT
      l.id, l.name, l.company, l.phone_original, l.phone_normalized,
      l.address, l.email, l.website, l.city, l.source, l.status,
      l.opt_out, l.notes, l.custom_fields, l.last_contact_at,
      l.last_reply_at, l.created_at, l.updated_at,
      count(*) OVER()::int AS total_count
    FROM leads l
    WHERE ${where.join(" AND ")}
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT $${limitParam}
    OFFSET $${offsetParam}
    `,
    values
  );

  return {
    items: result.rows.map(({ total_count: _total, ...row }) => row),
    total: Number(result.rows[0]?.total_count ?? 0),
    page: filters.page,
    pageSize: filters.pageSize
  };
}

export async function getLead(
  organizationId: string,
  leadId: string
) {
  const result = await db.query(
    `
    SELECT
      id, name, company, phone_original, phone_normalized,
      address, email, website, city, source, status,
      opt_out, notes, custom_fields, last_contact_at,
      last_reply_at, created_at, updated_at
    FROM leads
    WHERE organization_id = $1
      AND id = $2
      AND deleted_at IS NULL
    LIMIT 1
    `,
    [organizationId, leadId]
  );

  return result.rows[0] ?? null;
}

export async function createLead(input: {
  organizationId: string;
  name: string;
  phoneOriginal: string;
  phoneNormalized: string;
  company?: string | null;
  address?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  source?: string | null;
  notes?: string | null;
  userId: string;
}) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const blocked = await client.query(
      `
      SELECT 1 FROM opt_outs
      WHERE organization_id = $1 AND phone_normalized = $2
      LIMIT 1
      `,
      [input.organizationId, input.phoneNormalized]
    );
    if (blocked.rowCount) {
      throw Object.assign(new Error("Telefone consta na lista de não contatar."), { statusCode: 409 });
    }

    const result = await client.query(
      `
      INSERT INTO leads (
        organization_id, name, company, phone_original, phone_normalized,
        address, email, website, city, source, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        input.organizationId, input.name, input.company ?? null,
        input.phoneOriginal, input.phoneNormalized, input.address ?? null,
        input.email ?? null, input.website ?? null, input.city ?? null,
        input.source ?? "manual", input.notes ?? null
      ]
    );

    const lead = result.rows[0];

    await client.query(
      `
      INSERT INTO audit_logs (
        organization_id,user_id,action,entity_type,entity_id,after_data
      ) VALUES ($1,$2,'LEAD_CREATED','lead',$3,$4::jsonb)
      `,
      [input.organizationId, input.userId, lead.id, JSON.stringify({ name: input.name, phoneNormalized: input.phoneNormalized })]
    );

    await client.query("COMMIT");
    return lead;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw Object.assign(new Error("Já existe um lead com este telefone."), { statusCode: 409 });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLead(input: {
  organizationId: string;
  leadId: string;
  userId: string;
  name?: string;
  company?: string | null;
  address?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: LeadStatus;
}) {
  const fields: string[] = [];
  const values: unknown[] = [input.organizationId, input.leadId];

  const assign = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (input.name !== undefined) assign("name", input.name);
  if (input.company !== undefined) assign("company", input.company);
  if (input.address !== undefined) assign("address", input.address);
  if (input.email !== undefined) assign("email", input.email);
  if (input.website !== undefined) assign("website", input.website);
  if (input.city !== undefined) assign("city", input.city);
  if (input.source !== undefined) assign("source", input.source);
  if (input.notes !== undefined) assign("notes", input.notes);
  if (input.status !== undefined) assign("status", input.status);

  if (!fields.length) return getLead(input.organizationId, input.leadId);

  const result = await db.query(
    `
    UPDATE leads
    SET ${fields.join(", ")}
    WHERE organization_id = $1
      AND id = $2
      AND deleted_at IS NULL
    RETURNING *
    `,
    values
  );

  const lead = result.rows[0] ?? null;
  if (lead) {
    await db.query(
      `
      INSERT INTO audit_logs (
        organization_id,user_id,action,entity_type,entity_id,after_data
      ) VALUES ($1,$2,'LEAD_UPDATED','lead',$3,$4::jsonb)
      `,
      [input.organizationId, input.userId, input.leadId, JSON.stringify(input)]
    );
  }
  return lead;
}

export async function archiveLead(
  organizationId: string,
  leadId: string,
  userId: string
) {
  const result = await db.query(
    `
    UPDATE leads
    SET deleted_at = now(), status = 'ARCHIVED'
    WHERE organization_id = $1
      AND id = $2
      AND deleted_at IS NULL
    RETURNING id
    `,
    [organizationId, leadId]
  );

  if (!result.rows[0]) return false;

  await db.query(
    `
    INSERT INTO audit_logs (
      organization_id,user_id,action,entity_type,entity_id
    ) VALUES ($1,$2,'LEAD_ARCHIVED','lead',$3)
    `,
    [organizationId, userId, leadId]
  );

  return true;
}
