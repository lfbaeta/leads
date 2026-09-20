import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { registerHealthRoutes } from "./routes/health.js";

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
    request.log.error(
      {
        err: error,
        requestId: request.id
      },
      "Erro nao tratado na API"
    );

    const statusCode = error.statusCode && error.statusCode >= 400
      ? error.statusCode
      : 500;

    return reply.code(statusCode).send({
      error: statusCode >= 500
        ? "Ocorreu um erro interno. Tente novamente."
        : error.message,
      requestId: request.id
    });
  });

  return app;
}
