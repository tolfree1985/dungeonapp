import test from "node:test";
import assert from "node:assert/strict";
import { getTurnGuardVerdict } from "./getTurnGuardVerdict";

test("allows when no deny facts are present", () => {
  const v = getTurnGuardVerdict({
    userId: "u1",
    adventureId: "a1",
    flags: {},
    request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
    context: { adventureLocked: false, usageVerdict: null },
  });
  assert.deepEqual(v, { allowed: true });
});

test("denies SOFT_RATE", () => {
  const v = getTurnGuardVerdict({
    userId: "u1",
    adventureId: "a1",
    flags: {},
    request: {
      inputChars: 10,
      idempotencyKey: "k1",
      softRate: { allowed: false, retryAfterMs: 2500, reason: "slow down" },
    },
    context: { adventureLocked: false, usageVerdict: null },
  });

  assert.equal(v.allowed, false);
  if (!v.allowed) {
    assert.equal(v.code, "SOFT_RATE");
    assert.equal(v.retryAfterMs, 2500);
    assert.match(v.reason, /slow down|too fast|wait/i);
  }
});

test("denies ADVENTURE_LOCKED", () => {
  const v = getTurnGuardVerdict({
    userId: "u1",
    adventureId: "a1",
    flags: {},
    request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
    context: { adventureLocked: true, usageVerdict: null },
  });

  assert.equal(v.allowed, false);
  if (!v.allowed) assert.equal(v.code, "ADVENTURE_LOCKED");
});

test("denies USAGE_LIMIT", () => {
  const v = getTurnGuardVerdict({
    userId: "u1",
    adventureId: "a1",
    flags: {},
    request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
    context: { adventureLocked: false, usageVerdict: { allowed: false, retryAfterMs: 60000, reason: "limit hit" } },
  });

  assert.equal(v.allowed, false);
  if (!v.allowed) {
    assert.equal(v.code, "USAGE_LIMIT");
    assert.equal(v.retryAfterMs, 60000);
  }
});
