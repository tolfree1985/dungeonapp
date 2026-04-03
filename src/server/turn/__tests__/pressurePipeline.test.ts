import { describe, expect, it } from "vitest";
import { resolvePressureConsequences } from "@/lib/engine/resolvePressureConsequences";

describe("pressure pipeline integration", () => {
  it("hydrates canonical pressure and emits guard_alerted when noise crosses the threshold", () => {
    const previousState = {
      pressure: { noise: 2, suspicion: 0, time: 165, danger: 16 },
      stats: { noise: 2, suspicion: 0, time: 165, danger: 16 },
      flags: {},
    };
    const canonicalPressure = previousState.pressure;
    const currentPressureAdds = [{ kind: "pressure.add", domain: "noise", amount: 1 }];

    const consequences = resolvePressureConsequences({
      previousPressure: canonicalPressure,
      currentPressureAdds,
      stateFlags: previousState.flags,
    });

    const resolvedStateDeltas = [...currentPressureAdds, ...consequences.stateDeltas];
    const guardDelta = resolvedStateDeltas.find(
      (delta) => delta.kind === "flag.set" && delta.key === "guard_alerted",
    );

    expect(guardDelta).toBeDefined();
    expect(consequences.projectedPressure.noise).toBe(3);
    const totalNoise = canonicalPressure.noise +
      currentPressureAdds.reduce((sum, delta) => sum + (typeof delta.amount === "number" ? delta.amount : 0), 0);
    expect(totalNoise).toBe(3);
  });

  it("does not re-emit guard_alerted when it is already set", () => {
    const previousState = {
      pressure: { noise: 3, suspicion: 0, time: 165, danger: 16 },
      stats: { noise: 3, suspicion: 0, time: 165, danger: 16 },
      flags: { guard_alerted: true },
    };
    const canonicalPressure = previousState.pressure;
    const currentPressureAdds = [{ kind: "pressure.add", domain: "noise", amount: 1 }];

    const consequences = resolvePressureConsequences({
      previousPressure: canonicalPressure,
      currentPressureAdds,
      stateFlags: previousState.flags,
    });

    expect(consequences.stateDeltas).toEqual([]);
    expect(consequences.projectedPressure.noise).toBe(4);
  });
});
