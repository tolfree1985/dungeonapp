import { describe, expect, it } from "vitest";
import { resolvePositionPenaltyEffect } from "@/server/scene/position-penalty-effects";

describe("resolvePositionPenaltyEffect", () => {
  it("returns null for zero penalty", () => {
    expect(resolvePositionPenaltyEffect(0)).toBeNull();
  });

  it("returns position.worsened for 1", () => {
    expect(resolvePositionPenaltyEffect(1)).toBe("position.worsened");
  });

  it("returns position.exposed for 2+", () => {
    expect(resolvePositionPenaltyEffect(2)).toBe("position.exposed");
    expect(resolvePositionPenaltyEffect(3)).toBe("position.exposed");
  });
});
