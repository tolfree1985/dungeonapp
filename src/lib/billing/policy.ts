export type BillingTier = "NOMAD" | "TRAILBLAZOR" | "CHRONICLER" | "LOREMASTER";

type TierBudget = {
  maxTurnsPerMonth: number;
  maxTotalTokensPerMonth: number;
  maxOutputTokensPerTurn: number;
};

export const TIER_BUDGETS: Record<BillingTier, TierBudget> = {
  NOMAD: {
    maxTurnsPerMonth: 80,
    maxTotalTokensPerMonth: 100_000,
    maxOutputTokensPerTurn: 500,
  },
  TRAILBLAZOR: {
    maxTurnsPerMonth: 500,
    maxTotalTokensPerMonth: 500_000,
    maxOutputTokensPerTurn: 700,
  },
  CHRONICLER: {
    maxTurnsPerMonth: 1_500,
    maxTotalTokensPerMonth: 1_500_000,
    maxOutputTokensPerTurn: 900,
  },
  LOREMASTER: {
    maxTurnsPerMonth: 3_500,
    maxTotalTokensPerMonth: 4_000_000,
    maxOutputTokensPerTurn: 1_200,
  },
};

export function coerceTier(input: unknown): BillingTier {
  const raw = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (raw === "TRAILBLAZOR" || raw === "CHRONICLER" || raw === "LOREMASTER") {
    return raw;
  }
  return "NOMAD";
}

export function monthKeyUTC(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
