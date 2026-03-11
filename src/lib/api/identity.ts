import { createHash } from "node:crypto";
import { readSessionActor } from "@/lib/auth/session";

export type AuthenticatedUser = {
  id: string;
  displayName?: string;
  authMethod: "session" | "api_key";
};

export class IdentityError extends Error {
  status: number;
  code: string;

  constructor(message = "UNAUTHORIZED", status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.name = "IdentityError";
    this.status = status;
    this.code = code;
  }
}

function readApiKey(headers: Headers): string {
  const headerKey = headers.get("x-api-key") ?? headers.get("X-API-KEY");
  if (headerKey?.trim()) return headerKey.trim();

  const authHeader = headers.get("authorization") ?? headers.get("Authorization");
  if (!authHeader) return "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function stableActorId(requiredApiKey: string): string {
  const configured = process.env.API_KEY_ACTOR_ID?.trim();
  if (configured) return configured;
  return `api_${createHash("sha256").update(requiredApiKey).digest("hex").slice(0, 12)}`;
}

export function getOptionalUser(input: Request | Headers): AuthenticatedUser | null {
  const headers = input instanceof Headers ? input : input.headers;
  const sessionUser = readSessionActor(headers);
  if (sessionUser) return sessionUser;

  const required = process.env.API_KEY?.trim() || "";
  if (!required) return null;

  const provided = readApiKey(headers);
  if (!provided) return null;

  if (provided !== required) return null;
  return {
    id: stableActorId(required),
    authMethod: "api_key",
  };
}

export function requireUser(input: Request | Headers): AuthenticatedUser {
  const user = getOptionalUser(input);
  if (!user) {
    throw new IdentityError();
  }
  return user;
}

export function isIdentityError(error: unknown): error is IdentityError {
  return error instanceof IdentityError;
}
