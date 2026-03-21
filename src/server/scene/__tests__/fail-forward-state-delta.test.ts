import { describe, expect, it } from "vitest";
import { resolveFailForwardStateDelta } from "@/server/scene/fail-forward-state-delta";

describe("resolveFailForwardStateDelta", () => {
  it("returns noise delta for noise-increased", () => {
    expect(resolveFailForwardStateDelta("noise-increased"))
      .toEqual({ noise: 1 });
  });

  it("returns position penalty for position-worsened", () => {
    expect(resolveFailForwardStateDelta("position-worsened"))
      .toEqual({ positionPenalty: 1 });
  });

  it("returns time advance for time-lost", () => {
    expect(resolveFailForwardStateDelta("time-lost"))
      .toEqual({ timeAdvance: 1 });
  });

  it("returns npc suspicion for npc-suspicious", () => {
    expect(resolveFailForwardStateDelta("npc-suspicious"))
      .toEqual({ npcSuspicion: 1 });
  });
});
