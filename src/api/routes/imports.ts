import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/http.js";
import {
  confirmImportJob,
  enrichImportAnalysisFromDatabase,
  persistImportPreview,
  type ExistingImportStrategy
} from "../../imports/database.js";
import { analyzeSpreadsheetImport } from "../../imports/analyzer.js";
import { parseSpreadsheetBuffer } from "../../imports/spreadsheet.js";

const previewSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
  source: z.string().trim().max(120).optional()
});

const confirmSchema = z.object({
  strategy: z.enum(["IGNORE", "UPDATE", "MERGE"]).default("IGNORE")
});

const idSchema = z.object({ id: z.string().uuid() });

function decodeBase64(value: string): Buffer {
  const normalized = value.replace(/^data:[^;]+;base64,/, "").trim();
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) throw Object.assign(new Error("Arquivo vazio ou inválido."), { statusCode: 400 });
  return buffer;
}

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/imports/preview",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const auth = await requireAuth(request);
      const parsed = previewSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Arquivo ou parâmetros inválidos." });
      }

      const buffer = decodeBase64(parsed.data.contentBase64);
      const spreadsheet = parseSpreadsheetBuffer(buffer, parsed.data.fileName);
      let analysis = analyzeSpreadsheetImport(
        spreadsheet,
        parsed.data.source ? { source: parsed.data.source } : undefined
      );
      analysis = await enrichImportAnalysisFromDatabase(auth.organizationId, analysis);

      const importJobId = await persistImportPreview({
        organizationId: auth.organizationId,
        createdBy: auth.userId,
        fileName: parsed.data.fileName,
        analysis
      });

      return reply.code(201).send({
        importJobId,
        sheetName: analysis.sheetName,
        headers: analysis.headers,
        mapping: analysis.mapping,
        counts: analysis.counts,
        rows: analysis.rows.slice(0, 200),
        previewTruncated: analysis.rows.length > 200
      });
    }
  );

  app.get("/imports/:id", async (request, reply) => {
    const auth = await requireAuth(request);
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido." });

    const job = await import("../../db/pool.js").then(({ db }) =>
      db.query(
        `
        SELECT id,file_name,status,field_mapping,total_rows,valid_rows,
          invalid_rows,duplicate_rows,existing_rows,opt_out_rows,
          imported_rows,started_at,finished_at,created_at
        FROM import_jobs
        WHERE organization_id = $1 AND id = $2
        LIMIT 1
        `,
        [auth.organizationId, params.data.id]
      )
    );

    if (!job.rows[0]) return reply.code(404).send({ error: "Importação não encontrada." });
    return job.rows[0];
  });

  app.post("/imports/:id/confirm", async (request, reply) => {
    const auth = await requireAuth(request);
    const params = idSchema.safeParse(request.params);
    const body = confirmSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos." });
    }

    const result = await confirmImportJob({
      organizationId: auth.organizationId,
      importJobId: params.data.id,
      strategy: body.data.strategy as ExistingImportStrategy,
      userId: auth.userId
    });

    return { importJobId: params.data.id, status: "COMPLETED", ...result };
  });
}
