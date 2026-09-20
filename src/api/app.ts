import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { registerHealthRoutes } from "./routes/health.js";

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
