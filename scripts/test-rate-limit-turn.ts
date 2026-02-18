import assert from "node:assert/strict";

// IMPORTANT: relative import (no @/ alias at runtime)
import { POST as TurnPOST } from "../app/api/turn/route";

// Ensure env is set BEFORE the module executes its limiter config.
// (This script is the entrypoint, so we're safe.)
process.env.SOFT_RATE_LIMIT_TURN_POST_PER_MIN ??= "1";
// Make sure we are not in production for local deterministic tests.
process.env.NODE_ENV ??= "test";

async function postTurn(userId: string, adventureId: string, playerText: string) {
  const req = new Request("http://local/api/turn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Do NOT set x-smoke-bypass-soft-rate-limit
    },
    body: JSON.stringify({
      adventureId,
      playerText,
      userId,
      tier: "FREE",
      idempotencyKey: `rl_${userId}_${Math.random().toString(16).slice(2)}`,
    }),
  });

  const res = await TurnPOST(req);
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function main() {
  const userId = `rate_limit_user_${Date.now()}`;
  const adventureId = "adv_rate_limit_test";
  const playerText = "rate limit probe";

  // First request should not be rate limited (it might 200, 400, or 429 due to other guards,
  // but we expect the limiter NOT to trigger on the first request at limit=1/min).
  const r1 = await postTurn(userId, adventureId, playerText);
  assert.notEqual(r1.res.status, 429, `first request unexpectedly rate limited: ${JSON.stringify(r1.json)}`);

  // Second request should be rate limited at 1/min
  const r2 = await postTurn(userId, adventureId, playerText);
  assert.equal(r2.res.status, 429, `second request expected 429, got ${r2.res.status}: ${JSON.stringify(r2.json)}`);
  assert.equal(r2.json?.error, "RATE_LIMITED");

  const retryAfter = r2.res.headers.get("Retry-After");
  assert.ok(retryAfter, "Retry-After header missing");
  const retryAfterNum = Number(retryAfter);
  assert.ok(Number.isFinite(retryAfterNum) && retryAfterNum > 0, `Retry-After not positive int: ${retryAfter}`);

  console.log("RATE LIMIT TURN OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
