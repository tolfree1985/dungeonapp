import { describe, expect, it } from "vitest";
import { resolvePressureConsequences } from "@/lib/engine/resolvePressureConsequences";

describe("resolvePressureConsequences", () => {
  it("emits guard_alerted when noise crosses threshold from 2 to 3", () => {
    const previousPressure = { noise: 2, suspicion: 0, time: 0, danger: 0 };
    const currentPressureAdds = [{ kind: "pressure.add", domain: "noise", amount: 1 }];

    const result = resolvePressureConsequences({
      previousPressure,
      currentPressureAdds,
      stateFlags: {},
    });

    expect(result.projectedPressure.noise).toBe(3);
    expect(result.stateDeltas).toEqual([
      { kind: "flag.set", key: "guard_alerted", value: true },
    ]);
  });

  it("does not re-emit guard_alerted when already present", () => {
    const previousPressure = { noise: 3, suspicion: 0, time: 0, danger: 0 };
    const currentPressureAdds = [{ kind: "pressure.add", domain: "noise", amount: 1 }];

    const result = resolvePressureConsequences({
      previousPressure,
      currentPressureAdds,
      stateFlags: { guard_alerted: true },
    });

    expect(result.stateDeltas).toEqual([]);
    expect(result.projectedPressure.noise).toBe(4);
  });

  it("emits position_compromised when danger crosses threshold from 2 to 3", () => {
    const previousPressure = { noise: 0, suspicion: 0, time: 0, danger: 2 };
    const currentPressureAdds = [{ kind: "pressure.add", domain: "danger", amount: 1 }];

    const result = resolvePressureConsequences({
      previousPressure,
      currentPressureAdds,
      stateFlags: {},
    });

    expect(result.projectedPressure.danger).toBe(3);
    expect(result.stateDeltas).toEqual([
      { kind: "flag.set", key: "position_compromised", value: true },
    ]);
  });

  it("does not re-emit position_compromised when already present", () => {
    const previousPressure = { noise: 0, suspicion: 0, time: 0, danger: 3 };
    const currentPressureAdds = [{ kind: "pressure.add", domain: "danger", amount: 1 }];

    const result = resolvePressureConsequences({
      previousPressure,
      currentPressureAdds,
      stateFlags: { position_compromised: true },
    });

    expect(result.stateDeltas).toEqual([]);
    expect(result.projectedPressure.danger).toBe(4);
  });
});
