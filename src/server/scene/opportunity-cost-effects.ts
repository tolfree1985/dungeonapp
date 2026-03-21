import type { OpportunityCost } from "@/lib/opportunity-cost";

export type OpportunityCostEffect = {
  riskLevelDelta: number;
  costBudgetDelta: number;
};

export function resolveOpportunityCostEffect(params: {
  opportunityCost: OpportunityCost | null;
}): OpportunityCostEffect {
  if (params.opportunityCost === "reduced-margin") {
    return { riskLevelDelta: 1, costBudgetDelta: 0 };
  }
  return { riskLevelDelta: 0, costBudgetDelta: 0 };
}
