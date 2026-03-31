import { describe, expect, it } from "vitest";
import {
  buildLedgerFromDeltas,
  resolveOutcomeTier,
  type StateDelta,
} from "@/lib/engine/resolveTurnContract";

describe("resolveOutcomeTier", () => {
  it("returns success for strong margin", () => {
    expect(resolveOutcomeTier({ rollTotal: 10, difficulty: 6 })).toBe("success");
  });

  it("returns success_with_cost for slight success", () => {
    expect(resolveOutcomeTier({ rollTotal: 7, difficulty: 6 })).toBe("success_with_cost");
  });

  it("returns mixed on tie", () => {
    expect(resolveOutcomeTier({ rollTotal: 6, difficulty: 6 })).toBe("mixed");
  });

  it("returns failure_with_progress for near miss", () => {
    expect(resolveOutcomeTier({ rollTotal: 4, difficulty: 6 })).toBe("failure_with_progress");
  });

  it("returns failure for clear miss", () => {
    expect(resolveOutcomeTier({ rollTotal: 2, difficulty: 6 })).toBe("failure");
  });
});

describe("buildLedgerFromDeltas", () => {
  it("builds deterministic causal ledger entries", () => {
    const deltas: StateDelta[] = [
      { kind: "counter.add", key: "noise", amount: 1 },
      { kind: "pressure.add", domain: "suspicion", amount: 2 },
      { kind: "flag.set", key: "guard_alerted", value: true },
    ];

    const ledger = buildLedgerFromDeltas(deltas);

    expect(ledger).toEqual([
      {
        kind: "state_change",
        cause: "Turn resolution",
        effect: "noise +1",
        deltaKind: "counter.add",
      },
      {
        kind: "state_change",
        cause: "Turn resolution",
        effect: "suspicion pressure +2",
        deltaKind: "pressure.add",
      },
      {
        kind: "state_change",
        cause: "Turn resolution",
        effect: "guard_alerted set to true",
        deltaKind: "flag.set",
      },
    ]);
  });
});
