import { describe, expect, it } from "vitest";
import type { OutcomeTier, ResolvedTurn, StateDelta, LedgerEntry } from "../resolveTurnContract";
import { validateResolvedTurnContract } from "../validateResolvedTurnContract";

const progressDelta: StateDelta = { kind: "inventory.add", itemId: "artifact", quantity: 1 };
const costDelta: StateDelta = { kind: "pressure.add", domain: "noise", amount: 1 };
const timeCostDelta: StateDelta = { kind: "counter.add", key: "time", amount: 1 };
const progressFlagDelta: StateDelta = { kind: "flag.set", key: "observed.clue", value: true };

function buildLedgerEntry(deltas: StateDelta[]): LedgerEntry {
  return {
    kind: "state_change",
    cause: "test",
    effect: "state change",
    deltaKind: (deltas[0]?.kind ?? "flag.set") as StateDelta["kind"],
  };
}

function buildTurn(tier: OutcomeTier, deltas: StateDelta[]): ResolvedTurn {
  return {
    outcome: { tier, roll: null },
    stateDeltas: deltas,
    ledgerAdds: [buildLedgerEntry(deltas)],
    sceneUpdate: null,
    presentation: { sceneText: "scene", consequenceText: [] },
  };
}

describe("Validated turn tiers", () => {
  it("accepts success with progress-only deltas", () => {
    const turn = buildTurn("success", [progressDelta]);
    expect(validateResolvedTurnContract(turn)).toEqual([]);
  });

  it("accepts success_with_cost when progress and cost are present", () => {
    const turn = buildTurn("success_with_cost", [progressDelta, costDelta]);
    expect(validateResolvedTurnContract(turn)).toEqual([]);
  });

  it("accepts mixed when progress and cost appear", () => {
    const turn = buildTurn("mixed", [progressDelta, costDelta, progressFlagDelta]);
    expect(validateResolvedTurnContract(turn)).toEqual([]);
  });

  it("accepts failure_with_progress with progress and cost", () => {
    const turn = buildTurn("failure_with_progress", [progressDelta, timeCostDelta]);
    expect(validateResolvedTurnContract(turn)).toEqual([]);
  });

  it("accepts failure without progress", () => {
    const turn = buildTurn("failure", [costDelta]);
    expect(validateResolvedTurnContract(turn)).toEqual([]);
  });

  it("flags missing cost on mixed", () => {
    const turn = buildTurn("mixed", [progressDelta]);
    const issues = validateResolvedTurnContract(turn);
    expect(issues.some((issue) => issue.kind === "MissingCostDelta")).toBe(true);
  });
});
