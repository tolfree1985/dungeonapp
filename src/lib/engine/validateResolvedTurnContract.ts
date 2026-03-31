import type { ResolvedTurn, OutcomeTier } from "./resolveTurnContract";
import { classifyResolvedTurnDeltas } from "./classifyResolvedTurnDeltas";

export type ValidatedDeltaIssue = {
  kind: "MissingCostDelta" | "MissingProgressDelta" | "LedgerOutcomeMismatch" | "PresentationMissing";
  tier: OutcomeTier;
  message: string;
};

export function validateResolvedTurnContract(turn: ResolvedTurn): ValidatedDeltaIssue[] {
  const issues: ValidatedDeltaIssue[] = [];
  const classification = classifyResolvedTurnDeltas(turn.stateDeltas);
  const { hasCost, hasProgress } = classification;
  const costRequired = turn.outcome.tier === "success_with_cost" || turn.outcome.tier === "mixed";
  const progressRequired = turn.outcome.tier === "failure_with_progress" || turn.outcome.tier === "mixed";

  if (costRequired && !hasCost) {
    issues.push({
      kind: "MissingCostDelta",
      tier: turn.outcome.tier,
      message: `Outcome tier ${turn.outcome.tier} requires at least one cost delta`,
    });
  }

  if (progressRequired && !hasProgress) {
    issues.push({
      kind: "MissingProgressDelta",
      tier: turn.outcome.tier,
      message: `Outcome tier ${turn.outcome.tier} requires at least one progress delta`,
    });
  }

  switch (turn.outcome.tier) {
    case "success":
      if (!hasProgress) {
        issues.push({
          kind: "MissingProgressDelta",
          tier: turn.outcome.tier,
          message: "Success outcomes should include progress deltas",
        });
      }
      break;
    case "success_with_cost":
    case "mixed":
      if (!hasProgress || !hasCost) {
        issues.push({
          kind: "MissingCostDelta",
          tier: turn.outcome.tier,
          message: `Outcome tier ${turn.outcome.tier} requires both progress and cost`,
        });
      }
      break;
    case "failure_with_progress":
      if (!hasProgress) {
        issues.push({
          kind: "MissingProgressDelta",
          tier: turn.outcome.tier,
          message: "Failure_with_progress must include progress deltas",
        });
      }
      break;
    case "failure":
      if (hasProgress && !hasCost) {
        issues.push({
          kind: "MissingCostDelta",
          tier: turn.outcome.tier,
          message: "Failures should not be purely progress without cost",
        });
      }
      break;
  }

  for (const entry of turn.ledgerAdds) {
    if (entry.kind !== "state_change") continue;
    if (entry.effect.toLowerCase().includes("outcome")) {
      issues.push({
        kind: "LedgerOutcomeMismatch",
        tier: turn.outcome.tier,
        message: `Ledger entry references outcome text while tier is ${turn.outcome.tier}`,
      });
      break;
    }
  }

  if (!turn.presentation.sceneText?.trim()) {
    issues.push({
      kind: "PresentationMissing",
      tier: turn.outcome.tier,
      message: "Presentation.sceneText is empty despite a resolved turn",
    });
  }

  return issues;
}
