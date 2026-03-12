import { describe, it, expect } from "vitest";
import { getTurnGuardVerdict } from "./getTurnGuardVerdict";

describe("getTurnGuardVerdict", () => {
  it("allows when no deny facts are present", () => {
    const v = getTurnGuardVerdict({
      userId: "u1",
      adventureId: "a1",
      flags: {},
      request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
      context: { adventureLocked: false, usageVerdict: null },
    });
    expect(v).toEqual({ allowed: true });
  });

  it("denies on soft-rate when provided as denied", () => {
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
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.code).toBe("SOFT_RATE");
      expect(v.retryAfterMs).toBe(2500);
      expect(v.reason).toContain("slow down");
    }
  });

  it("denies on adventureLocked when flagged true", () => {
    const v = getTurnGuardVerdict({
      userId: "u1",
      adventureId: "a1",
      flags: {},
      request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
      context: { adventureLocked: true, usageVerdict: null },
    });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.code).toBe("ADVENTURE_LOCKED");
  });

  it("denies on usageVerdict when provided as denied", () => {
    const v = getTurnGuardVerdict({
      userId: "u1",
      adventureId: "a1",
      flags: {},
      request: { inputChars: 10, idempotencyKey: "k1", softRate: null },
      context: { adventureLocked: false, usageVerdict: { allowed: false, retryAfterMs: 60000, reason: "limit hit" } },
    });
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.code).toBe("USAGE_LIMIT");
      expect(v.retryAfterMs).toBe(60000);
    }
  });
});
