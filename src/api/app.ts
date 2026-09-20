import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAIRoutes } from "./routes/ai.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImportRoutes } from "./routes/imports.js";
import { registerLeadRoutes } from "./routes/leads.js";
import { registerWhatsAppRoutes } from "./routes/whatsapp.js";
import { registerImportTemplateRoutes } from "./routes/import-template.js";

type ErrorWithStatus = Error & {
  statusCode?: number;
};

function normalizeError(error: unknown): ErrorWithStatus {
  if (error instanceof Error) {
    return error as ErrorWithStatus;
  }

  return new Error("Erro desconhecido") as ErrorWithStatus;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.apiKey",
          "*.api_key",
          "*.password",
          "*.token",
          "*.secret"
        ],
        censor: "[REDACTED]"
      }
    },
    genReqId: () => crypto.randomUUID()
  });

  const allowedOrigins = env.APP_URL
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true
  });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute"
  });

  await registerHealthRoutes(app);
  await registerImportTemplateRoutes(app);
  await registerAuthRoutes(app);
  await registerAIRoutes(app);
  await registerCampaignRoutes(app);
  await registerConversationRoutes(app);
  await registerImportRoutes(app);
  await registerLeadRoutes(app);
  await registerWhatsAppRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = normalizeError(error);

    request.log.error(
      {
        err: normalizedError,
        requestId: request.id
      },
      "Erro nao tratado na API"
    );

    const statusCode = normalizedError.statusCode && normalizedError.statusCode >= 400
      ? normalizedError.statusCode
      : 500;

    return reply.code(statusCode).send({
      error: statusCode >= 500
        ? "Ocorreu um erro interno. Tente novamente."
        : normalizedError.message,
      requestId: request.id
    });
  });

  return app;
}
