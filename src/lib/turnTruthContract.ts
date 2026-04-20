import type { BlockedTruth } from "@/server/turn/blockedRules";
import type { PressureTruth } from "@/server/turn/pressureRules";
import type { OpportunityTruth } from "@/server/turn/opportunityRules";

export type CanonicalTurnTruthKind = "BLOCKED" | "PRESSURE" | "OPPORTUNITY" | "NEUTRAL";

type TruthLike = {
  blockedTruth?: BlockedTruth | null;
  pressureTruth?: PressureTruth | null;
  opportunityTruth?: OpportunityTruth | null;
};

type TruthEvidenceLike = TruthLike & {
  outcome?: string | null;
  stateDeltas?: unknown[];
  ledgerAdds?: unknown[];
};

function hasTriggeredRules(truth: { rulesTriggered?: unknown[] } | null | undefined): boolean {
  return Boolean(truth && Array.isArray(truth.rulesTriggered) && truth.rulesTriggered.length > 0);
}

function normalizeOutcome(outcome?: string | null): string {
  return typeof outcome === "string" ? outcome.trim().toUpperCase() : "";
}

function hasActionBlockedLedger(ledgerAdds: unknown[] | undefined): boolean {
  if (!Array.isArray(ledgerAdds)) return false;
  return ledgerAdds.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    return (entry as Record<string, unknown>).kind === "action.blocked";
  });
}

export function classifyTruthKind(turn: TruthLike): CanonicalTurnTruthKind {
  if (turn.blockedTruth) return "BLOCKED";
  if (hasTriggeredRules(turn.pressureTruth ?? null)) return "PRESSURE";
  if (hasTriggeredRules(turn.opportunityTruth ?? null)) return "OPPORTUNITY";
  return "NEUTRAL";
}

export function canonicalizeTurnTruths<T extends TruthLike>(turn: T): T {
  const kind = classifyTruthKind(turn);
  return {
    ...turn,
    blockedTruth: kind === "BLOCKED" ? turn.blockedTruth ?? null : null,
    pressureTruth: kind === "PRESSURE" ? turn.pressureTruth ?? null : null,
    opportunityTruth: kind === "OPPORTUNITY" ? turn.opportunityTruth ?? null : null,
  };
}

export function assertTurnTruthContract<T extends TruthEvidenceLike>(turn: T): T {
  const canonicalTurn = canonicalizeTurnTruths(turn);
  const kind = classifyTruthKind(canonicalTurn);
  const outcome = normalizeOutcome(canonicalTurn.outcome);
  const stateDeltas = Array.isArray(canonicalTurn.stateDeltas) ? canonicalTurn.stateDeltas : [];
  const ledgerAdds = Array.isArray(canonicalTurn.ledgerAdds) ? canonicalTurn.ledgerAdds : [];

  switch (kind) {
    case "BLOCKED":
      if (outcome !== "BLOCKED") {
        throw new Error("Blocked truth requires a BLOCKED outcome");
      }
      if (!hasActionBlockedLedger(ledgerAdds)) {
        throw new Error("Blocked truth requires an action.blocked ledger entry");
      }
      if (stateDeltas.length > 0) {
        throw new Error("Blocked truth must not produce state deltas");
      }
      break;
    case "PRESSURE":
      if (outcome !== "FAIL_FORWARD") {
        throw new Error("Pressure truth requires a FAIL_FORWARD outcome");
      }
      if (stateDeltas.length === 0) {
        throw new Error("Pressure truth requires supporting state deltas");
      }
      if (ledgerAdds.length === 0) {
        throw new Error("Pressure truth requires supporting ledger entries");
      }
      break;
    case "OPPORTUNITY":
      if (outcome === "BLOCKED") {
        throw new Error("Opportunity truth cannot coexist with BLOCKED outcome");
      }
      if (stateDeltas.length === 0 && ledgerAdds.length === 0) {
        throw new Error("Opportunity truth requires supporting state or ledger evidence");
      }
      break;
    case "NEUTRAL":
      break;
  }

  return canonicalTurn as T;
}
