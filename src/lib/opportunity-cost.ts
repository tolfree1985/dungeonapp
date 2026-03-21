import type { OpportunityResolutionModifier } from "@/lib/opportunity-resolution-modifier";

export type OpportunityCost = "reduced-margin";

export function resolveOpportunityCost(params: {
  opportunityResolutionModifier: OpportunityResolutionModifier | null;
  deltaKind: string;
  encounterPhase: string;
}): OpportunityCost | null {
  if (params.opportunityResolutionModifier === "opportunity.reduced") {
    return "reduced-margin";
  }
  return null;
}
