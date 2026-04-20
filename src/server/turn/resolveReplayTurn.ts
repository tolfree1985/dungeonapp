import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";
import { applyTurnStateDeltas } from "@/server/scene/apply-turn-state-deltas";
import type { AdventureState } from "@/lib/engine/types/state";
import type { LedgerEntry, StateDelta } from "@/lib/engine/resolveTurnContract";
import type { MechanicFacts } from "@/lib/engine/presentation/mechanicFacts";
import { deriveMechanicFacts } from "@/lib/engine/presentation/mechanicFacts";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import { settleOpportunityWindowValidity } from "@/lib/opportunity-window-state";
import type { ReplayTurnInput } from "@/lib/replay/replayTypes";

export type ResolveReplayTurnArgs = {
  state: AdventureState;
  input: ReplayTurnInput;
  seed: number;
  engineVersion: string;
  scenarioHash: string;
  turnIndex: number;
};

export type ResolveReplayTurnResult = {
  outcome: string;
  stateDeltas: StateDelta[];
  ledgerAdds: LedgerEntry[];
  nextState: AdventureState;
  mechanicFacts: MechanicFacts;
};

function cloneReplayState(state: AdventureState): AdventureState {
  return structuredClone(state);
}

function requireMechanicFacts(mechanicFacts: MechanicFacts | null): MechanicFacts {
  if (!mechanicFacts) {
    throw new Error("Replay resolver produced no mechanicFacts");
  }
  return mechanicFacts;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function deriveReplayMechanicFacts(
  nextState: AdventureState,
  stateDeltas: StateDelta[],
  ledgerAdds: LedgerEntry[],
): MechanicFacts {
  const mergedFlags = {
    ...(asRecord(nextState.flags) ?? {}),
    ...(asRecord(asRecord(nextState.world)?.flags) ?? {}),
  };
  const normalizedState: Record<string, unknown> = {
    ...nextState,
    flags: mergedFlags,
    world: {
      ...(asRecord(nextState.world) ?? {}),
      flags: mergedFlags,
    },
  };
  const facts = deriveMechanicFacts({
    stateFlags: normalizedState,
    stateDeltas,
    ledgerAdds,
    stats: asRecord(nextState.stats) ?? {},
    blockedActions: asRecord(nextState.blockedActions ?? null),
    pendingReactions: Array.isArray(nextState.pendingReactions) ? nextState.pendingReactions : [],
    opportunityWindow: nextState.opportunityWindow ?? null,
    currentTurnIndex: asRecord(nextState)?.latestTurnIndex ?? null,
  });
  return requireMechanicFacts(facts);
}

function settleReplayOpportunityWindow(params: {
  nextState: AdventureState;
  turnIndex: number;
}): { nextState: AdventureState; stateDeltas: StateDelta[]; ledgerAdds: LedgerEntry[] } {
  const { nextState, turnIndex } = params;
  const hadOpportunityWindow = nextState.opportunityWindow != null;
  const mergedFlags = {
    ...(asRecord(nextState.flags) ?? {}),
    ...(asRecord(asRecord(nextState.world)?.flags) ?? {}),
  };
  const settlementState: AdventureState = {
    ...nextState,
    flags: mergedFlags,
    world: {
      ...(asRecord(nextState.world) ?? {}),
      flags: mergedFlags,
    },
  } as AdventureState;
  const settlement = settleOpportunityWindowValidity({
    opportunityWindow: nextState.opportunityWindow ?? null,
    state: settlementState,
    sceneClock: turnIndex,
  });

  if (!settlement.ledgerAdds.length && settlement.opportunityWindow === nextState.opportunityWindow) {
    return { nextState, stateDeltas: [], ledgerAdds: [] };
  }

  const stateDeltas: StateDelta[] = [];
  const ledgerAdds: LedgerEntry[] = [...settlement.ledgerAdds];

  if (nextState.opportunityWindow && settlement.opportunityWindow === null) {
    const settledWindow = nextState.opportunityWindow;
    const invalidationDelta: StateDelta = {
      kind: "opportunity.invalidate",
      opportunityType: settledWindow.type,
      opportunityId: `${settledWindow.type}:${settledWindow.createdTurnIndex}`,
      reason:
        (asRecord(nextState.flags)?.[WORLD_FLAGS.status.exposed] ??
          asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.status.exposed] ??
          asRecord(nextState.flags)?.[WORLD_FLAGS.guard.searching] ??
          asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.guard.searching] ??
          asRecord(nextState.flags)?.[WORLD_FLAGS.player.revealed] ??
          asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.player.revealed])
          ? "state.exposed"
          : "state.changed",
    };
    stateDeltas.push(invalidationDelta);
    applyTurnStateDeltas(nextState as Record<string, unknown>, [invalidationDelta]);
    nextState.opportunityWindow = null;
    const existingCooldowns = asRecord(nextState.opportunityCooldowns ?? null) ?? {};
    nextState.opportunityCooldowns = {
      ...existingCooldowns,
      [settledWindow.type]: {
        reason: settlement.transition === "expired" ? "expired" : "invalidated",
        atTurn: turnIndex,
        expiresAtTurn: turnIndex + 1,
        blockingConditions:
          settledWindow.type === "shadow_hide"
            ? {
                [WORLD_FLAGS.guard.searching]: Boolean(
                  asRecord(nextState.flags)?.[WORLD_FLAGS.guard.searching] ??
                    asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.guard.searching],
                ),
                [WORLD_FLAGS.status.exposed]: Boolean(
                  asRecord(nextState.flags)?.[WORLD_FLAGS.status.exposed] ??
                    asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.status.exposed],
                ),
                [WORLD_FLAGS.player.revealed]: Boolean(
                  asRecord(nextState.flags)?.[WORLD_FLAGS.player.revealed] ??
                    asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.player.revealed],
                ),
                [WORLD_FLAGS.guard.alerted]: Boolean(
                  asRecord(nextState.flags)?.[WORLD_FLAGS.guard.alerted] ??
                    asRecord(asRecord(nextState.world)?.flags)?.[WORLD_FLAGS.guard.alerted],
                ),
              }
            : {},
      },
    };
  } else if ((hadOpportunityWindow && settlement.opportunityWindow === null) || settlement.opportunityWindow != null) {
    nextState.opportunityWindow = settlement.opportunityWindow;
  }

  return { nextState, stateDeltas, ledgerAdds };
}

export function resolveReplayTurn(args: ResolveReplayTurnArgs): ResolveReplayTurnResult {
  const clonedState = cloneReplayState(args.state);
  const result = resolveDeterministicTurn({
    previousState: clonedState,
    playerText: args.input.text,
    turnIndex: args.turnIndex,
    mode: args.input.mode,
  });
  const nextState = cloneReplayState(result.nextState as AdventureState);
  const settlement = settleReplayOpportunityWindow({
    nextState,
    turnIndex: args.turnIndex,
  });
  const stateDeltas = [...result.stateDeltas, ...settlement.stateDeltas];
  const ledgerAdds = [...result.ledgerAdds, ...settlement.ledgerAdds];
  const mechanicFacts = deriveReplayMechanicFacts(nextState, stateDeltas as StateDelta[], ledgerAdds as LedgerEntry[]);

  return {
    outcome: result.outcome,
    stateDeltas: stateDeltas as StateDelta[],
    ledgerAdds: ledgerAdds as LedgerEntry[],
    nextState,
    mechanicFacts,
  };
}
