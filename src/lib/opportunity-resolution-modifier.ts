import type { OpportunityWindowState } from "@/lib/opportunity-window";

export type OpportunityResolutionModifier = "opportunity.reduced";

export function resolveOpportunityResolutionModifier(params: {
  opportunityTier: OpportunityWindowState["opportunityTier"];
}): OpportunityResolutionModifier | null {
  if (params.opportunityTier === "reduced") {
    return "opportunity.reduced";
  }
  return null;
}
