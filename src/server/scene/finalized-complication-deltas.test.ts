import { describe, expect, it } from "vitest";
import { resolveFinalizedComplicationDeltas } from "./finalized-complication-deltas";

describe("resolveFinalizedComplicationDeltas", () => {
  it("maps noise complication to noise delta", () => {
    expect(resolveFinalizedComplicationDeltas(["noise-increased"])).toEqual({
      noise: 1,
      npcSuspicion: 0,
      positionPenalty: 0,
      timeAdvance: 0,
    });
  });

  it("maps npc suspicion complication to npc delta", () => {
    expect(resolveFinalizedComplicationDeltas(["npc-suspicious"])).toEqual({
      noise: 0,
      npcSuspicion: 1,
      positionPenalty: 0,
      timeAdvance: 0,
    });
  });

  it("maps position penalty complication to position delta", () => {
    expect(resolveFinalizedComplicationDeltas(["position-worsened"])).toEqual({
      noise: 0,
      npcSuspicion: 0,
      positionPenalty: 1,
      timeAdvance: 0,
    });
  });

  it("maps time-lost complication to time delta", () => {
    expect(resolveFinalizedComplicationDeltas(["time-lost"])).toEqual({
      noise: 0,
      npcSuspicion: 0,
      positionPenalty: 0,
      timeAdvance: 1,
    });
  });

  it("ignores generic complication-applied entries", () => {
    expect(resolveFinalizedComplicationDeltas(["complication-applied"])).toEqual({});
  });

  it("combines multiple complications deterministically", () => {
    expect(
      resolveFinalizedComplicationDeltas([
        "noise-increased",
        "npc-suspicious",
        "time-lost",
      ]),
    ).toEqual({
      noise: 1,
      npcSuspicion: 1,
      positionPenalty: 0,
      timeAdvance: 1,
    });
  });
});
