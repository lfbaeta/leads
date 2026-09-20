import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/http.js";
import {
  buildImportTemplateBuffer,
  IMPORT_TEMPLATE_FILENAME
} from "../../imports/template.js";

export async function registerImportTemplateRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/imports/template", async (request, reply) => {
    await requireAuth(request);
    const file = buildImportTemplateBuffer();

    return reply
      .header(
        "content-type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header(
        "content-disposition",
        `attachment; filename="${IMPORT_TEMPLATE_FILENAME}"`
      )
      .header("cache-control", "private, max-age=3600")
      .send(file);
  });
}
