import type { ComplicationWeightResult } from "@/server/scene/complication-weight";

export type ComplicationTier = "none" | "light" | "heavy";

export type ComplicationTierResult = {
  complicationTier: ComplicationTier;
};

export function resolveComplicationTier(weight: ComplicationWeightResult): ComplicationTierResult {
  if (weight.complicationWeightDelta >= 2) {
    return { complicationTier: "heavy" };
  }
  if (weight.complicationWeightDelta === 1) {
    return { complicationTier: "light" };
  }
  return { complicationTier: "none" };
}
