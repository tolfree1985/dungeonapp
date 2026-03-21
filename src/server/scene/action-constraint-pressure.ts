import type { ActionConstraints } from "@/lib/action-constraints";

export type ActionConstraintPressureResult = {
  constraintPressure: number;
  activeConstraints: string[];
};

export function resolveActionConstraintPressure(actionConstraints: ActionConstraints): ActionConstraintPressureResult {
  const activeConstraints: string[] = [];
  let constraintPressure = 0;

  if (actionConstraints.stealthDisadvantage) {
    constraintPressure += 1;
    activeConstraints.push("stealthDisadvantage");
  }
  if (actionConstraints.deceptionDisadvantage) {
    constraintPressure += 1;
    activeConstraints.push("deceptionDisadvantage");
  }
  if (actionConstraints.mobilityDisadvantage) {
    constraintPressure += 1;
    activeConstraints.push("mobilityDisadvantage");
  }
  if (actionConstraints.coverLost) {
    constraintPressure += 1;
    activeConstraints.push("coverLost");
  }
  if (actionConstraints.attentionDrawn) {
    constraintPressure += 1;
    activeConstraints.push("attentionDrawn");
  }
  if (actionConstraints.searchPressure) {
    constraintPressure += 1;
    activeConstraints.push("searchPressure");
  }

  return {
    constraintPressure: Math.min(constraintPressure, 3),
    activeConstraints,
  };
}
