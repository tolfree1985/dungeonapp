import type { ComplicationTierResult } from "@/server/scene/complication-tier";

export type ComplicationSelectionPolicy = {
  forcedComplicationCount: number;
};

export function resolveComplicationSelectionPolicy(
  tier: ComplicationTierResult
): ComplicationSelectionPolicy {
  if (tier.complicationTier === "heavy") {
    return { forcedComplicationCount: 2 };
  }
  if (tier.complicationTier === "light") {
    return { forcedComplicationCount: 1 };
  }
  return { forcedComplicationCount: 0 };
}
