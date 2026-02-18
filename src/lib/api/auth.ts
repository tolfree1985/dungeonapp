import { NextRequest } from "next/server";

export function requireApiKey(req: NextRequest) {
  const required = process.env.API_KEY || "";

  // dev convenience: if unset, allow
  if (!required) return { ok: true as const, actorId: "dev" };

  const gotLower = req.headers.get("x-api-key");
  const gotUpper = req.headers.get("X-API-KEY");
  const got = ((gotLower || gotUpper || "") as string).trim();

  // dev convenience: allow the default placeholder key in non-production
  if (process.env.NODE_ENV !== "production" && got === "dev_local_key_change_me") {
    return { ok: true as const, actorId: "dev" };
  }

  if (got !== required) return { ok: false as const };
  return { ok: true as const, actorId: "keyholder" };
}
