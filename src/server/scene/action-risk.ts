import type { ActionConstraintPressureResult } from "@/server/scene/action-constraint-pressure";

export type ActionRiskResult = {
  actionRiskDelta: number;
  riskTier: "none" | "elevated" | "high";
};

export function resolveActionRisk(pressure: ActionConstraintPressureResult): ActionRiskResult {
  const { constraintPressure } = pressure;
  if (constraintPressure >= 2) {
    return { actionRiskDelta: 2, riskTier: "high" };
  }
  if (constraintPressure === 1) {
    return { actionRiskDelta: 1, riskTier: "elevated" };
  }
  return { actionRiskDelta: 0, riskTier: "none" };
}
