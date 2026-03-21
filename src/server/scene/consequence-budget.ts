import type { OutcomeSeverity } from "@/server/scene/outcome-severity";

export type ConsequenceBudget = {
  extraCostCount: number;
};

export function resolveConsequenceBudget(params: { outcomeSeverity: OutcomeSeverity }): ConsequenceBudget {
  switch (params.outcomeSeverity) {
    case "harsh":
      return { extraCostCount: 2 };
    case "strained":
      return { extraCostCount: 1 };
    default:
      return { extraCostCount: 0 };
  }
}
