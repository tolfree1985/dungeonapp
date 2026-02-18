import { Tier } from "@/generated/prisma";

export type BillingTier = (typeof Tier)[keyof typeof Tier];
const testCap = process.env.BILLING_TEST_CAP ? Number(process.env.BILLING_TEST_CAP) : null;

export type TierLimits = {
  monthlyTotalCap: number;
  maxOutputTokensPerTurn: number;
  maxConcurrentLeases: number;
  maxConcurrentHolds: number;
  leaseTtlMs: number;
  holdTtlMs: number;
};

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  NOMAD: {
    monthlyTotalCap: testCap ?? 60_000,
    maxOutputTokensPerTurn: 500,
    maxConcurrentLeases: 1,
    maxConcurrentHolds: 1,
    leaseTtlMs: 15_000,
    holdTtlMs: 30_000,
  },
  TRAILBLAZOR: {
    monthlyTotalCap: 450_000,
    maxOutputTokensPerTurn: 700,
    maxConcurrentLeases: 2,
    maxConcurrentHolds: 2,
    leaseTtlMs: 20_000,
    holdTtlMs: 40_000,
  },
  CHRONICLER: {
    monthlyTotalCap: 1_400_000,
    maxOutputTokensPerTurn: 900,
    maxConcurrentLeases: 3,
    maxConcurrentHolds: 3,
    leaseTtlMs: 25_000,
    holdTtlMs: 45_000,
  },
  LOREMASTER: {
    monthlyTotalCap: 2_000_000,
    maxOutputTokensPerTurn: 1200,
    maxConcurrentLeases: 5,
    maxConcurrentHolds: 5,
    leaseTtlMs: 30_000,
    holdTtlMs: 60_000,
  },
};

export function __debugCaps() {
  return {
    BILLING_TEST_CAP: process.env.BILLING_TEST_CAP ?? null,
    testCap: process.env.BILLING_TEST_CAP ? Number(process.env.BILLING_TEST_CAP) : null,
  };
}

export function coerceTier(input: unknown): BillingTier {
  const s = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (s === "TRAILBLAZOR") return Tier.TRAILBLAZOR;
  if (s === "CHRONICLER") return Tier.CHRONICLER;
  if (s === "LOREMASTER") return Tier.LOREMASTER;
  return Tier.NOMAD;
}
