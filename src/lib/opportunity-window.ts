import type { FinalizedEffectSummary } from "@/lib/finalized-effects";

export type OpportunityWindowState = {
  windowNarrowed: boolean;
  opportunityTier: "normal" | "reduced";
};

export function resolveOpportunityWindow(params: {
  effectSummaries: FinalizedEffectSummary[];
  sceneClock: number;
}): OpportunityWindowState {
  if (params.effectSummaries.includes("objective.window-narrowed")) {
    return { windowNarrowed: true, opportunityTier: "reduced" };
  }

  return { windowNarrowed: false, opportunityTier: "normal" };
}
