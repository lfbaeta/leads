import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireAuth } from "../../auth/http.js";
import {
  authenticateUser,
  revokeSession
} from "../../auth/repository.js";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(512)
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "E-mail ou senha em formato invalido."
        });
      }

      const result = await authenticateUser({
        email: parsed.data.email,
        password: parsed.data.password,
        userAgent: request.headers["user-agent"] ?? null,
        ipAddress: request.ip ?? null,
        sessionTtlHours: env.SESSION_TTL_HOURS
      });

      if (!result) {
        return reply.code(401).send({
          error: "E-mail ou senha invalidos."
        });
      }

      return reply.send(result);
    }
  );

  app.get("/auth/me", async (request) => {
    const context = await requireAuth(request);

    return {
      user: {
        id: context.userId,
        name: context.userName,
        email: context.email,
        role: context.role,
        organizationId: context.organizationId,
        organizationName: context.organizationName
      }
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const context = await requireAuth(request);

    await revokeSession(
      context.sessionId,
      context.organizationId,
      context.userId
    );

    return reply.code(204).send();
  });
}
