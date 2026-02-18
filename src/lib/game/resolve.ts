import { d6 } from "./rng";

export type RollTier = "fail" | "cost" | "hit" | "crit";

export type Resolution = {
  check: "2d6";
  dice: [number, number];
  mod: number;
  total: number;
  tier: RollTier;
  notes?: string;
};

export function tierFor2d6(total: number): RollTier {
  if (total <= 6) return "fail";
  if (total <= 8) return "cost";
  if (total <= 11) return "hit";
  return "crit";
}

export function roll2d6(rng: () => number, mod = 0): Resolution {
  const a = d6(rng);
  const b = d6(rng);
  const total = a + b + mod;
  const tier = tierFor2d6(total);

  return {
    check: "2d6",
    dice: [a, b],
    mod,
    total,
    tier,
  };
}
