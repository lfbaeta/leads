import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/http.js";
import { normalizeBrazilPhone } from "../../domain/phone.js";
import {
  archiveLead,
  createLead,
  getLead,
  listLeads,
  updateLead
} from "../../leads/repository.js";

const leadStatuses = [
  "NEW","CONTACTED","WAITING_REPLY","INTERESTED","NOT_INTERESTED",
  "IN_SERVICE","CONVERTED","DO_NOT_CONTACT","INVALID","ARCHIVED"
] as const;

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(leadStatuses).optional(),
  city: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(8).max(40),
  company: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  source: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional()
});

const updateSchema = createSchema
  .omit({ phone: true })
  .partial()
  .extend({ status: z.enum(leadStatuses).optional() });

const idSchema = z.object({ id: z.string().uuid() });

export async function registerLeadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leads", async (request, reply) => {
    const auth = await requireAuth(request);
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Filtros inválidos." });
    return listLeads(auth.organizationId, parsed.data);
  });

  app.get("/leads/:id", async (request, reply) => {
    const auth = await requireAuth(request);
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido." });

    const lead = await getLead(auth.organizationId, params.data.id);
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado." });
    return lead;
  });

  app.post("/leads", async (request, reply) => {
    const auth = await requireAuth(request);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Dados do lead inválidos." });

    const phone = normalizeBrazilPhone(parsed.data.phone);
    if (!phone.valid || !phone.normalized) {
      return reply.code(400).send({ error: phone.reason ?? "Telefone inválido." });
    }

    const lead = await createLead({
      organizationId: auth.organizationId,
      userId: auth.userId,
      name: parsed.data.name,
      phoneOriginal: parsed.data.phone,
      phoneNormalized: phone.normalized,
      company: parsed.data.company,
      address: parsed.data.address,
      email: parsed.data.email,
      website: parsed.data.website,
      city: parsed.data.city,
      source: parsed.data.source,
      notes: parsed.data.notes
    });

    return reply.code(201).send(lead);
  });

  app.patch("/leads/:id", async (request, reply) => {
    const auth = await requireAuth(request);
    const params = idSchema.safeParse(request.params);
    const body = updateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Dados inválidos." });
    }

    const lead = await updateLead({
      organizationId: auth.organizationId,
      leadId: params.data.id,
      userId: auth.userId,
      ...body.data
    });
    if (!lead) return reply.code(404).send({ error: "Lead não encontrado." });
    return lead;
  });

  app.delete("/leads/:id", async (request, reply) => {
    const auth = await requireAuth(request);
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido." });

    const archived = await archiveLead(auth.organizationId, params.data.id, auth.userId);
    if (!archived) return reply.code(404).send({ error: "Lead não encontrado." });
    return reply.code(204).send();
  });
}
