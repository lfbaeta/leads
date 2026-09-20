import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";

let cachedLoginPage: string | null = null;

async function getLoginPage(): Promise<string> {
  if (cachedLoginPage) return cachedLoginPage;

  const path = resolve(process.cwd(), "frontend", "index.html");
  cachedLoginPage = await readFile(path, "utf8");
  return cachedLoginPage;
}

export async function registerFrontendRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    const html = await getLoginPage();

    return reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .send(html);
  });
}
