export type RollTier = "success" | "mixed" | "fail";

export function roll2d6(mod = 0) {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const total = d1 + d2 + mod;

  let tier: RollTier;
  if (total >= 10) tier = "success";
  else if (total >= 7) tier = "mixed";
  else tier = "fail";

  return { d1, d2, mod, total, tier };
}
