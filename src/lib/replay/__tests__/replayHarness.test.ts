import { describe, expect, it } from "vitest";
import { createInitialStateV1 } from "@/lib/game/bootstrap";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { resolvePositionState } from "@/lib/engine/positionState";
import { checksumReplayRun, checksumReplayState } from "@/lib/replay/checksumReplayRun";
import { runReplayCase } from "@/lib/replay/runReplayCase";
import {
  ritualFirePressure001,
  ritualFirePressure001ExpectedChecksums,
} from "@/lib/replay/replayFixtures/ritual_fire_pressure_001";
import {
  waitOnlyDrift001,
  waitOnlyDrift001ExpectedChecksums,
} from "@/lib/replay/replayFixtures/wait_only_drift_001";
import {
  concealmentInvalidatesUnderExposure001,
  concealmentInvalidatesUnderExposure001ExpectedChecksums,
} from "@/lib/replay/replayFixtures/concealment_invalidates_under_exposure_001";
import type { ReplayCase, ReplayRunResult } from "@/lib/replay/replayTypes";
import { resolveReplayTurn } from "@/server/turn/resolveReplayTurn";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getMergedFlags(state: unknown): Record<string, unknown> {
  const record = asRecord(state);
  const world = asRecord(record?.world);
  return {
    ...(asRecord(record?.flags) ?? {}),
    ...(asRecord(world?.flags) ?? {}),
  };
}

function countActivePositionStates(state: unknown): number {
  return resolvePositionState(getMergedFlags(state)) ? 1 : 0;
}

function assertNoDuplicateTerminalEvents(run: ReplayRunResult) {
  const burnouts = run.steps
    .flatMap((step) => step.stateDeltas)
    .filter(
      (delta) =>
        delta &&
        typeof delta === "object" &&
        (delta as Record<string, unknown>).kind === "hazard.set" &&
        asRecord((delta as Record<string, unknown>).value)?.status === "burned_out",
    );

  expect(burnouts).toHaveLength(1);
}

function getOpportunityId(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const type = typeof record.type === "string" ? record.type : null;
  const createdTurnIndex =
    typeof record.createdTurnIndex === "number"
      ? record.createdTurnIndex
      : typeof record.createdAtTurn === "number"
        ? record.createdAtTurn
        : null;
  if (!type || createdTurnIndex == null) return null;
  return `${type}:${createdTurnIndex}`;
}

function assertSinglePositionState(run: ReplayRunResult) {
  run.steps.forEach((step) => {
    expect(countActivePositionStates(step.finalState)).toBe(1);
  });
}

function assertOpportunityLifecycle(replayCase: ReplayCase, run: ReplayRunResult) {
  const createdIds = [
    getOpportunityId(replayCase.initialState.opportunityWindow ?? null),
    ...run.steps.flatMap((step) =>
      step.ledgerAdds
        .filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            (entry as Record<string, unknown>).kind === "opportunity.window" &&
            (entry as Record<string, unknown>).cause === "opportunity.created",
        )
        .map((entry) => {
          const data = asRecord((entry as Record<string, unknown>).data);
          return typeof data?.opportunityId === "string" ? data.opportunityId : null;
        }),
    ),
  ].filter((id): id is string => typeof id === "string");

  const invalidatedIds = run.steps.flatMap((step) =>
    step.ledgerAdds
      .filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).kind === "opportunity.window" &&
          (entry as Record<string, unknown>).cause === "opportunity.invalidated",
      )
      .map((entry) => {
        const data = asRecord((entry as Record<string, unknown>).data);
        return typeof data?.opportunityId === "string" ? data.opportunityId : null;
      }),
  ).filter((id): id is string => typeof id === "string");

  expect(invalidatedIds.length).toBe(1);
  invalidatedIds.forEach((id) => {
    expect(createdIds).toContain(id);
  });
  expect(run.finalState.opportunityWindow ?? null).toBeNull();
}

describe("replay harness", () => {
  it("replays the same case identically", () => {
    const runA = runReplayCase(ritualFirePressure001);
    const runB = runReplayCase(ritualFirePressure001);

    expect(runA).toEqual(runB);
    expect(checksumReplayRun(runA)).toBe(checksumReplayRun(runB));
  });

  it("matches the deterministic resolver for a single turn", () => {
    const state = createInitialStateV1();
    const replay = resolveReplayTurn({
      state,
      input: { mode: "DO", text: "splash oil" },
      seed: 12345,
      engineVersion: ENGINE_VERSION,
      scenarioHash: "ashen-estate-v1",
      turnIndex: 1,
    });
    const direct = resolveDeterministicTurn({
      previousState: state,
      playerText: "splash oil",
      turnIndex: 1,
      mode: "DO",
    });

    expect(replay.outcome).toBe(direct.outcome);
    expect(replay.stateDeltas).toEqual(direct.stateDeltas);
    expect(replay.ledgerAdds).toEqual(direct.ledgerAdds);
    expect(replay.nextState).toEqual(direct.nextState);
    expect(replay.mechanicFacts).toEqual(direct.mechanicFacts);
  });

  it("locks the ritual fire-pressure replay checksum", () => {
    const run = runReplayCase(ritualFirePressure001);

    expect(checksumReplayRun(run)).toBe(ritualFirePressure001ExpectedChecksums.fullRun);
    expect(checksumReplayState(run.finalState)).toBe(ritualFirePressure001ExpectedChecksums.finalState);
  });

  it("locks the wait-only drift replay checksum", () => {
    const run = runReplayCase(waitOnlyDrift001);

    expect(checksumReplayRun(run)).toBe(waitOnlyDrift001ExpectedChecksums.fullRun);
    expect(checksumReplayState(run.finalState)).toBe(waitOnlyDrift001ExpectedChecksums.finalState);
  });

  it("locks the concealment invalidation replay checksum", () => {
    const run = runReplayCase(concealmentInvalidatesUnderExposure001);

    expect(checksumReplayRun(run)).toBe(concealmentInvalidatesUnderExposure001ExpectedChecksums.fullRun);
    expect(checksumReplayState(run.finalState)).toBe(concealmentInvalidatesUnderExposure001ExpectedChecksums.finalState);
  });

  it("asserts fire terminal events and concealment lifecycle invariants", () => {
    const fireRun = runReplayCase(ritualFirePressure001);
    const concealmentRun = runReplayCase(concealmentInvalidatesUnderExposure001);

    assertNoDuplicateTerminalEvents(fireRun);
    assertSinglePositionState(concealmentRun);
    assertOpportunityLifecycle(concealmentInvalidatesUnderExposure001, concealmentRun);
  });
});
