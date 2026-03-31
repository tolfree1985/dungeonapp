import { describe, expect, it } from "vitest";
import { classifyResolvedTurnDeltas } from "../classifyResolvedTurnDeltas";
import type { StateDelta } from "../resolveTurnContract";

const progressDelta: StateDelta = { kind: "inventory.add", itemId: "key", quantity: 1 };
const discoveryFlag: StateDelta = { kind: "flag.set", key: "observed.intel", value: true };
const costDelta: StateDelta = { kind: "pressure.add", domain: "noise", amount: 1 };
const timeDelta: StateDelta = { kind: "counter.add", key: "time", amount: 1 };
const dangerFlag: StateDelta = { kind: "flag.set", key: "alert.danger", value: true };
const relationShift: StateDelta = { kind: "relation.shift", actorId: "npc", metric: "trust", amount: -1 };

describe("classifyResolvedTurnDeltas", () => {
  it("sees progress from inventory and discovery", () => {
    const classification = classifyResolvedTurnDeltas([progressDelta, discoveryFlag]);
    expect(classification.hasProgress).toBe(true);
    expect(classification.hasCost).toBe(false);
  });

  it("sees cost from pressure, time, and danger flags", () => {
    const classification = classifyResolvedTurnDeltas([costDelta, timeDelta, dangerFlag]);
    expect(classification.hasCost).toBe(true);
    expect(classification.hasProgress).toBe(false);
  });

  it("counts relation shifts as progress or cost", () => {
    const positive = classifyResolvedTurnDeltas([{ kind: "relation.shift", actorId: "npc", metric: "trust", amount: 1 }]);
    const negative = classifyResolvedTurnDeltas([relationShift]);
    expect(positive.hasProgress).toBe(true);
    expect(positive.hasCost).toBe(false);
    expect(negative.hasCost).toBe(true);
  });
});
