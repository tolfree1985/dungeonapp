import type { BlockedTruth } from "@/server/turn/blockedRules";
import type { OpportunityTruth } from "@/server/turn/opportunityRules";
import type { PressureTruth } from "@/server/turn/pressureRules";

export type CanonicalTurnTruthKind = "BLOCKED" | "PRESSURE" | "OPPORTUNITY" | "NEUTRAL";

export type TurnTruthContractInput = {
  action?: string | null;
  outcome?: string | null;
  resolution?: { outcome?: string | null } | null;
  stateDeltas?: Array<Record<string, unknown>> | null;
  ledgerAdds?: Array<Record<string, unknown>> | null;
  blockedTruth?: BlockedTruth | null;
  pressureTruth?: PressureTruth | null;
  opportunityTruth?: OpportunityTruth | null;
};

function hasTriggeredRules(truth: { rulesTriggered?: unknown[] } | null | undefined): boolean {
  return Boolean(truth && Array.isArray(truth.rulesTriggered) && truth.rulesTriggered.length > 0);
}

function readOutcome(input: TurnTruthContractInput): string | null {
  if (typeof input.outcome === "string" && input.outcome.trim()) {
    return input.outcome.trim();
  }
  if (input.resolution && typeof input.resolution.outcome === "string" && input.resolution.outcome.trim()) {
    return input.resolution.outcome.trim();
  }
  return null;
}

export function classifyTruthKind(turn: TurnTruthContractInput): CanonicalTurnTruthKind {
  if (turn.blockedTruth) return "BLOCKED";
  if (hasTriggeredRules(turn.pressureTruth ?? null)) return "PRESSURE";
  if (hasTriggeredRules(turn.opportunityTruth ?? null)) return "OPPORTUNITY";
  return "NEUTRAL";
}

function countPresentTruthKinds(turn: TurnTruthContractInput): number {
  return [
    turn.blockedTruth ? 1 : 0,
    hasTriggeredRules(turn.pressureTruth ?? null) ? 1 : 0,
    hasTriggeredRules(turn.opportunityTruth ?? null) ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function hasActionBlockedLedger(ledgerAdds: Array<Record<string, unknown>>): boolean {
  return ledgerAdds.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return entry.kind === "action.blocked";
  });
}

function hasLedgerOrDeltaEvidence(turn: TurnTruthContractInput): boolean {
  return Boolean((turn.stateDeltas?.length ?? 0) > 0 || (turn.ledgerAdds?.length ?? 0) > 0);
}

function hasOpportunityBenefitEvidence(turn: TurnTruthContractInput): boolean {
  const stateDeltas = turn.stateDeltas ?? [];
  const ledgerAdds = turn.ledgerAdds ?? [];
  return Boolean(
    stateDeltas.some((delta) => {
      if (!delta || typeof delta !== "object") return false;
      const record = delta as Record<string, unknown>;
      return (
        record.kind === "flag.set" &&
        typeof record.key === "string" &&
        record.key === "opportunity.hidden_strike_advantage"
      );
    }) ||
      ledgerAdds.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const record = entry as Record<string, unknown>;
        return record.kind === "opportunity.used";
      }),
  );
}

export function assertTurnTruthContract(turn: TurnTruthContractInput): void {
  const truthCount = countPresentTruthKinds(turn);
  if (truthCount > 1) {
    throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: multiple truth families present");
  }

  const outcome = readOutcome(turn);
  if (process.env.TURN_TRUTH_DEBUG === "1") {
    // eslint-disable-next-line no-console
      console.log("TURN_TRUTH_CONTRACT_DEBUG", {
      action: turn.action ?? null,
      outcome,
      rawOutcome: turn.outcome ?? null,
      resolutionOutcome: turn.resolution?.outcome ?? null,
      blocked: Boolean(turn.blockedTruth),
      pressure: hasTriggeredRules(turn.pressureTruth ?? null),
      opportunity: hasTriggeredRules(turn.opportunityTruth ?? null),
      stateDeltas: turn.stateDeltas?.length ?? 0,
      ledgerAdds: turn.ledgerAdds?.length ?? 0,
    });
  }

  if (turn.blockedTruth) {
    if (outcome !== "BLOCKED") {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: blocked truth requires BLOCKED outcome");
    }
    if (!hasActionBlockedLedger(turn.ledgerAdds ?? [])) {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: blocked truth requires action.blocked ledger evidence");
    }
    if ((turn.stateDeltas?.length ?? 0) !== 0) {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: blocked truth requires zero state deltas");
    }
  }

  if (hasTriggeredRules(turn.pressureTruth ?? null)) {
    if (turn.action === "WAIT" && outcome !== "FAIL_FORWARD") {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: wait pressure truth requires FAIL_FORWARD outcome");
    }
    if (outcome === "BLOCKED") {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: pressure truth cannot coexist with BLOCKED outcome");
    }
    if (!hasLedgerOrDeltaEvidence(turn)) {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: pressure truth requires ledger or state delta evidence");
    }
  }

  if (hasTriggeredRules(turn.opportunityTruth ?? null)) {
    if (outcome === "BLOCKED") {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: opportunity truth cannot coexist with BLOCKED outcome");
    }
    if (!hasLedgerOrDeltaEvidence(turn)) {
      throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: opportunity truth requires ledger or state delta evidence");
    }
    if (turn.opportunityTruth && "benefit" in turn.opportunityTruth && turn.opportunityTruth.benefit) {
      if (!hasOpportunityBenefitEvidence(turn)) {
        throw new Error("TURN_TRUTH_CONTRACT_VIOLATION: opportunity benefit requires explicit ledger or state delta evidence");
      }
    }
  }
}
