import { describe, expect, it } from "vitest";
import { createInitialStateV1, DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { AdventureState } from "@/lib/engine/types/state";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";

type PressureStage = "calm" | "tension" | "danger" | "crisis";

const PRESSURE_STAGE_RANK: Record<PressureStage, number> = {
  calm: 0,
  tension: 1,
  danger: 2,
  crisis: 3,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function makePressureSeed(): AdventureState {
  const state = createInitialStateV1();
  const world = state.world as Record<string, unknown>;
  const flags = (world.flags as Record<string, unknown>) ?? {};
  flags[WORLD_FLAGS.guard.searching] = true;
  flags[WORLD_FLAGS.status.exposed] = true;
  world.flags = flags;
  world.clocks = {
    ...(world.clocks as Record<string, unknown>),
    [DEFAULT_NOISE_CLOCK_ID]: {
      ...(asRecord((world.clocks as Record<string, unknown>)[DEFAULT_NOISE_CLOCK_ID]) ?? {}),
      id: DEFAULT_NOISE_CLOCK_ID,
      value: 0,
    },
    [DEFAULT_ALERT_CLOCK_ID]: {
      ...(asRecord((world.clocks as Record<string, unknown>)[DEFAULT_ALERT_CLOCK_ID]) ?? {}),
      id: DEFAULT_ALERT_CLOCK_ID,
      value: 0,
    },
  };
  state.stats = {
    ...(state.stats as Record<string, unknown>),
    heat: 5,
    noise: 0,
    alert: 0,
  };
  return state;
}

function pressureStageOf(turn: ReturnType<typeof resolveDeterministicTurn>): PressureStage {
  const stats = asRecord(turn.nextState.stats) ?? {};
  return (typeof stats.pressureStage === "string" ? stats.pressureStage : "calm") as PressureStage;
}

function summarizeDelta(delta: Record<string, unknown>) {
  return {
    op: delta.op ?? delta.kind ?? null,
    kind: delta.kind ?? null,
    key: delta.key ?? null,
    domain: delta.domain ?? null,
    id: delta.id ?? null,
    value: delta.value ?? null,
    amount: delta.amount ?? null,
    by: delta.by ?? null,
    to: delta.to ?? null,
  };
}

function summarizeLedger(entry: Record<string, unknown>) {
  return {
    kind: entry.kind ?? null,
    cause: entry.cause ?? null,
    effect: entry.effect ?? null,
    blockedRuleId: entry.blockedRuleId ?? null,
    detail: entry.detail ?? null,
  };
}

function summarizeTurn(turn: ReturnType<typeof resolveDeterministicTurn>) {
  const facts = turn.mechanicFacts;
  return {
    outcome: turn.outcome,
    stage: pressureStageOf(turn),
    stateDeltas: turn.stateDeltas.map(summarizeDelta),
    ledgerAdds: turn.ledgerAdds.map((entry) => summarizeLedger(entry as Record<string, unknown>)),
    pressureTruth: turn.pressureTruth?.rulesTriggered.map((rule) => ({
      ruleId: rule.ruleId,
      matchedConditions: rule.matchedConditions,
      effects: rule.effects,
    })) ?? null,
    mechanicFacts: facts
      ? {
          achieved: facts.achieved.map((fact) => fact.id),
          world: facts.world.map((fact) => fact.id),
          costs: facts.costs.map((fact) => fact.id),
          turnChanges: facts.turnChanges.map((fact) => fact.id),
          careNow: facts.careNow.map((fact) => fact.id),
          opportunities: facts.opportunities.map((fact) => fact.id),
        }
      : null,
  };
}

function runTurns(playerTexts: string[], initialStateFactory: () => AdventureState) {
  let state = initialStateFactory();
  const turns = playerTexts.map((playerText, index) => {
    const turn = resolveDeterministicTurn({
      playerText,
      previousState: state,
      turnIndex: 400 + index,
      mode: "DO",
    });
    state = turn.nextState as AdventureState;
    return turn;
  });
  return turns;
}

describe("pressure evolution contract", () => {
  it("WAIT x3 evolves pressure predictably and replays identically", () => {
    const inputs = ["wait", "wait", "wait"];
    const firstRun = runTurns(inputs, makePressureSeed);
    const secondRun = runTurns(inputs, makePressureSeed);

    const firstSummary = firstRun.map(summarizeTurn);
    const secondSummary = secondRun.map(summarizeTurn);

    expect(firstSummary).toEqual(secondSummary);

    const stages = firstSummary.map((turn) => turn.stage);
    expect(
      stages.every((stage, index, all) => PRESSURE_STAGE_RANK[stage] >= PRESSURE_STAGE_RANK[all[index - 1] ?? stage]),
    ).toBe(true);
    expect(PRESSURE_STAGE_RANK[stages[0]]).toBeGreaterThanOrEqual(PRESSURE_STAGE_RANK.danger);
    expect(stages[stages.length - 1]).toBe("crisis");
    expect(firstSummary.every((turn) => turn.outcome === "FAIL_FORWARD")).toBe(true);
    expect(firstSummary.every((turn) => (turn.pressureTruth?.length ?? 0) > 0)).toBe(true);
    expect(firstSummary.some((turn) => turn.ledgerAdds.some((entry) => entry.cause === "pressure"))).toBe(true);
    expect(firstSummary[2].mechanicFacts?.careNow.some((id) => id === "alert-energy-shifts")).toBe(true);
  });

  it("noisy action raises pressure from calm to tension", () => {
    const result = resolveDeterministicTurn({
      playerText: "smash the crate loudly",
      previousState: createInitialStateV1(),
      turnIndex: 500,
      mode: "DO",
    });

    expect(pressureStageOf(result)).toBe("tension");
    expect(pressureStageOf(result)).not.toBe("calm");
    expect((result.pressureTruth?.rulesTriggered.length ?? 0) > 0).toBe(true);
    expect(result.ledgerAdds.some((entry) => (entry as Record<string, unknown>).cause === "action.crate_smash_loud")).toBe(true);
    expect(
      result.stateDeltas.some(
        (delta) =>
          delta &&
          typeof delta === "object" &&
          (delta as Record<string, unknown>).kind === "flag.set" &&
          (delta as Record<string, unknown>).key === WORLD_FLAGS.status.exposed,
      ),
    ).toBe(true);
  });

  it("stealth action does not raise pressure from calm", () => {
    const result = resolveDeterministicTurn({
      playerText: "hide in the room",
      previousState: createInitialStateV1(),
      turnIndex: 501,
      mode: "DO",
    });

    expect(pressureStageOf(result)).toBe("calm");
    expect(
      result.stateDeltas.some(
        (delta) => delta && typeof delta === "object" && (delta as Record<string, unknown>).kind === "pressure.add",
      ),
    ).toBe(false);
    expect((result.pressureTruth?.rulesTriggered.length ?? 0) === 0 || result.pressureTruth == null).toBe(true);
    expect(result.mechanicFacts?.costs.some((fact) => fact.id === "noise_care")).toBe(false);
  });

  it("mixed pressure sequence advances stages monotonically", () => {
    const inputs = ["wait", "smash the crate loudly", "wait"];
    const firstRun = runTurns(inputs, makePressureSeed);
    const secondRun = runTurns(inputs, makePressureSeed);

    const firstSummary = firstRun.map(summarizeTurn);
    const secondSummary = secondRun.map(summarizeTurn);

    expect(firstSummary).toEqual(secondSummary);
    expect(firstSummary.map((turn) => turn.stage)).toEqual(["crisis", "crisis", "crisis"]);
    expect(firstSummary.every((turn, index, all) => PRESSURE_STAGE_RANK[turn.stage] >= PRESSURE_STAGE_RANK[all[index - 1]?.stage ?? turn.stage])).toBe(true);
    expect(firstSummary[0].outcome).toBe("FAIL_FORWARD");
    expect(firstSummary[2].outcome).toBe("FAIL_FORWARD");
    expect(firstSummary[1].mechanicFacts?.careNow.some((id) => id === "alert-energy-shifts")).toBe(true);
  });
});
