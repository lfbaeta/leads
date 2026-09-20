import type { FastifyRequest } from "fastify";
import { resolveSession } from "./repository.js";
import type { AuthContext, UserRole } from "./types.js";

export class AuthenticationError extends Error {
  statusCode = 401;
}

export class AuthorizationError extends Error {
  statusCode = 403;
}

export async function requireAuth(
  request: FastifyRequest
): Promise<AuthContext> {
  const authorization = request.headers.authorization;
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token || token.length < 20) {
    throw new AuthenticationError("Sessao ausente ou invalida.");
  }

  const context = await resolveSession(token);
  if (!context) {
    throw new AuthenticationError("Sessao expirada, revogada ou invalida.");
  }

  return context;
}

export function requireRole(
  context: AuthContext,
  roles: readonly UserRole[]
): void {
  if (!roles.includes(context.role)) {
    throw new AuthorizationError("Usuario sem permissao para esta operacao.");
  }
}
