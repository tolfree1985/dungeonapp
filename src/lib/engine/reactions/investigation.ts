import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { AdventureState } from "@/lib/engine/types/state";
import type { PendingReaction } from "./types";

const INVESTIGATION_FACT_ID = "investigation_imminent";

function determineInvestigationCause(args: {
  flags: Record<string, boolean>;
  stats: Record<string, unknown>;
}): { cause: string | null; severity: 1 | 2 | 3 } {
  const { flags, stats } = args;
  if (flags[WORLD_FLAGS.guard.searching]) {
    return { cause: WORLD_FLAGS.guard.searching, severity: 2 };
  }
  if (flags[WORLD_FLAGS.guard.alerted]) {
    return { cause: WORLD_FLAGS.guard.alerted, severity: 3 };
  }
  if (flags[WORLD_FLAGS.pressure.actionConstraint]) {
    return { cause: WORLD_FLAGS.pressure.actionConstraint, severity: 2 };
  }
  const noise = Number(stats.noise ?? 0);
  if (noise >= 4) {
    return { cause: "pressure.noise_high", severity: 2 };
  }
  if (noise >= 2) {
    return { cause: "pressure.noise_rising", severity: 2 };
  }
  return { cause: null, severity: 1 };
}

function causedThisTurn(cause: string, stateDeltas: Array<Record<string, unknown>>): boolean {
  return stateDeltas.some((delta) => {
    if (!delta || typeof delta !== "object") return false;
    const record = delta as Record<string, unknown>;
    const op = record.op;
    const kind = record.kind;
    const key = record.key;
    if (
      cause === "pressure.noise_high" ||
      cause === "pressure.noise_rising"
    ) {
      return op === "clock.inc";
    }
    if (
      (cause === WORLD_FLAGS.guard.alerted ||
        cause === WORLD_FLAGS.guard.searching ||
        cause === WORLD_FLAGS.pressure.actionConstraint) &&
      (op === "flag.set" || kind === "flag.set") &&
      key === cause &&
      record.value === true
    ) {
      return true;
    }
    return false;
  });
}

function reactionId(cause: string, locationId: string, turnIndex: number): string {
  return `investigation:${locationId}:${cause}:${turnIndex}`;
}

export function enqueuePendingInvestigationReactions(args: {
  state: AdventureState;
  turnIndex: number;
  canonicalIntent: string;
  flags: Record<string, boolean>;
  locationId: string;
  ledgerAdds: Array<Record<string, unknown>>;
  stateDeltas: Array<Record<string, unknown>>;
  pendingReactions: PendingReaction[];
}): PendingReaction[] {
  const { state, turnIndex, canonicalIntent, flags, locationId, ledgerAdds, stateDeltas, pendingReactions } = args;
  const { cause, severity } = determineInvestigationCause({ flags, stats: (state.stats as Record<string, unknown>) ?? {} });
  if (!cause) return pendingReactions;
  if (pendingReactions.some((reaction) => reaction.kind === "investigation")) return pendingReactions;
  if (!causedThisTurn(cause, stateDeltas)) return pendingReactions;
  const active = pendingReactions.some(
    (reaction) => !reaction.resolved && reaction.kind === "investigation" && reaction.locationId === locationId && reaction.cause === cause,
  );
  if (active) return pendingReactions;
  const id = reactionId(cause, locationId, turnIndex);
  const reaction: PendingReaction = {
    id,
    kind: "investigation",
    cause,
    sourceTurn: turnIndex,
    triggerAtTurn: turnIndex + severity,
    locationId,
    severity,
    resolved: false,
    metadata: {
      intent: canonicalIntent,
    },
  };
  const updated = [...pendingReactions, reaction];
  stateDeltas.push({
    op: "flag.set",
    kind: "flag.set",
    key: "reaction.investigation.pending",
    value: true,
    detail: `Anticipating an investigation near ${locationId}.`,
  });
  ledgerAdds.push({
    kind: "system.effect",
    cause: "reaction.investigation.queued",
    effect: `An investigation is forming near ${locationId}.`,
    detail: `Cause: ${cause}; action: ${canonicalIntent}`,
    refTurnIndex: turnIndex,
  });
  return updated;
}

export function resolveDueInvestigationReactions(args: {
  state: AdventureState;
  turnIndex: number;
  pendingReactions: PendingReaction[];
}): {
  pendingReactions: PendingReaction[];
  reactionDeltas: Array<Record<string, unknown>>;
  reactionLedgerAdds: Array<Record<string, unknown>>;
} {
  const { state, turnIndex, pendingReactions } = args;
  const pending = pendingReactions;
  const due = pending.filter((reaction) => reaction.triggerAtTurn === turnIndex);
  if (due.length === 0) {
    return {
      pendingReactions,
      reactionDeltas: [],
      reactionLedgerAdds: [],
    };
  }
  const nextPending = pending.filter((reaction) => reaction.triggerAtTurn !== turnIndex);
  state.pendingReactions = nextPending;
  const reactionDeltas: Array<Record<string, unknown>> = [];
  const reactionLedgerAdds: Array<Record<string, unknown>> = [];
  for (const reaction of due) {
    const escalateToAlert = reaction.severity >= 3;
    const escalateFlag = escalateToAlert ? WORLD_FLAGS.guard.alerted : WORLD_FLAGS.guard.searching;
    reactionDeltas.push({
      op: "flag.set",
      kind: "flag.set",
      key: escalateFlag,
      value: true,
      detail: `An investigation has focused on ${reaction.locationId} because of ${reaction.cause}.`,
    });
    if (reaction.severity >= 2) {
      reactionDeltas.push({
        op: "flag.set",
        kind: "flag.set",
        key: WORLD_FLAGS.status.exposed,
        value: true,
        detail: `The investigation sharpens the focus on your position at ${reaction.locationId}.`,
      });
    }
    reactionLedgerAdds.push({
      kind: "system.effect",
      cause: "reaction.investigation.resolved",
      effect: `The investigation near ${reaction.locationId} escalates.`,
      detail: `Cause: ${reaction.cause}; severity: ${reaction.severity}.`,
      refTurnIndex: turnIndex,
    });
  }
  reactionDeltas.push({
    op: "flag.set",
    kind: "flag.set",
    key: "reaction.investigation.pending",
    value: false,
    detail: "The pending investigation has resolved.",
  });
  return {
    pendingReactions: nextPending,
    reactionDeltas,
    reactionLedgerAdds,
  };
}

export function hasPendingInvestigations(state: AdventureState): boolean {
  return (state.pendingReactions ?? []).some((reaction) => reaction.kind === "investigation");
}
