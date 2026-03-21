import { describe, expect, it } from "vitest";
import { applyTurnStateDeltas } from "@/server/scene/apply-turn-state-deltas";

describe("applyTurnStateDeltas", () => {
  it("accumulates stats from state delta records", () => {
    const stateRecord: Record<string, unknown> = { stats: {} };
    const deltas = [
      { key: "noise", detail: { noise: 1, npcSuspicion: 2 } },
      { key: "penalty", detail: { positionPenalty: 3 } },
    ];

    applyTurnStateDeltas(stateRecord, deltas);

    expect(stateRecord.stats).toEqual({ noise: 1, npcSuspicion: 2, positionPenalty: 3 });
  });

  it("ignores invalid delta records", () => {
    const record: Record<string, unknown> = { stats: { noise: 1 } };
    applyTurnStateDeltas(record, [null, { key: "none" }, { key: "test", detail: "oops" }]);
    expect(record.stats).toEqual({ noise: 1 });
  });
});
