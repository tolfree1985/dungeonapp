import { describe, expect, it } from "vitest";
import { buildTurnResolutionPresentation, type TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";

describe("buildTurnResolutionPresentation", () => {
  it("builds deterministic resolution presentation from finalized metadata", () => {
    expect(
      buildTurnResolutionPresentation({
        outcome: "SUCCESS_WITH_COST",
        rollTotal: 8,
        resultLabel: "Success with Cost",
      })
    ).toEqual<TurnResolutionPresentation>({
      outcome: "SUCCESS_WITH_COST",
      rollLabel: "Roll: 2d6 → 8",
      resultLabel: "Success with Cost",
    });
  });

  it("returns null labels when roll/result metadata is absent", () => {
    expect(
      buildTurnResolutionPresentation({
        outcome: "FAILURE",
        rollTotal: null,
        resultLabel: null,
      })
    ).toEqual<TurnResolutionPresentation>({
      outcome: "FAILURE",
      rollLabel: null,
      resultLabel: null,
    });
  });
});
