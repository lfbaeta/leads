import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === undefined ? undefined : ["1", "true", "yes", "on"].includes(value.toLowerCase()));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().default("http://localhost:5173"),
  BACKEND_URL: z.string().default("http://localhost:3001"),
  TIMEZONE: z.string().default("America/Sao_Paulo"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL e obrigatoria"),
  DATABASE_SSL: booleanFromString.default(true),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  WORKER_NAME: z.string().min(1).default("worker-1"),
  WORKER_HEARTBEAT_SECONDS: z.coerce.number().int().min(5).default(15),
  WORKER_STALE_AFTER_SECONDS: z.coerce.number().int().min(15).default(60),
  WORKER_POLL_MS: z.coerce.number().int().min(250).default(2000),
  DRY_RUN: booleanFromString.default(true),
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  STORAGE_PROVIDER: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  EVOLUTION_API_BASE_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_GO_BASE_URL: z.string().optional(),
  EVOLUTION_GO_API_KEY: z.string().optional()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Configuracao de ambiente invalida: ${details}`);
}

export const env = parsed.data;
export type Env = typeof env;
