import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionActor = {
  id: string;
  displayName?: string;
  authMethod: "session";
};

type SessionPayload = {
  sub: string;
  name?: string;
  iat: number;
  exp: number;
};

type SessionCookieOptions = {
  maxAge?: number;
};

const DEFAULT_COOKIE_NAME = "dungeonpp_session";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEV_SESSION_SECRET = "dev_session_secret_change_me";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const chunk of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = chunk.split("=");
    const name = rawName?.trim();
    if (!name) continue;
    values.set(name, rawValue.join("=").trim());
  }
  return values;
}

function sessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return DEV_SESSION_SECRET;
  return "";
}

function sessionTtlSeconds(): number {
  const raw = Number(process.env.AUTH_SESSION_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.floor(raw);
}

export function sessionCookieName(): string {
  return process.env.AUTH_SESSION_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCredentialsConfig(): Map<string, string> {
  const parsed = new Map<string, string>();
  const raw = process.env.AUTH_CREDENTIALS?.trim() || "";
  if (!raw) return parsed;

  for (const entry of raw.split(/[\n,]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const username = trimmed.slice(0, separator).trim();
    const password = trimmed.slice(separator + 1).trim();
    if (!username || !password) continue;
    parsed.set(username, password);
  }
  return parsed;
}

export function validateAuthCredentials(username: string, password: string): SessionActor | null {
  const credentials = parseCredentialsConfig();
  if (credentials.size === 0) return null;
  const expectedPassword = credentials.get(username.trim());
  if (!expectedPassword || password !== expectedPassword) return null;
  return {
    id: username.trim(),
    displayName: username.trim(),
    authMethod: "session",
  };
}

export function sessionAuthConfigured(): boolean {
  return parseCredentialsConfig().size > 0;
}

export function createSessionCookieValue(actor: { id: string; displayName?: string }, options: SessionCookieOptions = {}): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is required");
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = options.maxAge && options.maxAge > 0 ? Math.floor(options.maxAge) : sessionTtlSeconds();
  const payload: SessionPayload = {
    sub: actor.id,
    ...(actor.displayName ? { name: actor.displayName } : {}),
    iat: now,
    exp: now + maxAge,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function readSessionActor(headers: Headers): SessionActor | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const cookieHeader = headers.get("cookie") ?? headers.get("Cookie") ?? "";
  if (!cookieHeader) return null;

  const cookies = parseCookieHeader(cookieHeader);
  const rawValue = cookies.get(sessionCookieName());
  if (!rawValue) return null;

  const separator = rawValue.lastIndexOf(".");
  if (separator <= 0) return null;
  const encodedPayload = rawValue.slice(0, separator);
  const signature = rawValue.slice(separator + 1);
  const expectedSignature = sign(encodedPayload, secret);

  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const payloadJson = fromBase64Url(encodedPayload);
  if (!payloadJson) return null;

  try {
    const payload = JSON.parse(payloadJson) as SessionPayload;
    if (!payload || typeof payload.sub !== "string" || !payload.sub.trim()) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return {
      id: payload.sub.trim(),
      displayName: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.sub.trim(),
      authMethod: "session",
    };
  } catch {
    return null;
  }
}

