import { describe, expect, it } from "vitest";
import { deriveLandingIdleState } from "../../../src/lib/landing/deriveLandingIdleState";

describe("deriveLandingIdleState", () => {
  it("returns deterministic landing pressure states", () => {
    expect(deriveLandingIdleState(0)).toEqual({
      step: 0,
      line: "Wait, and it moves without you.",
      glowOpacity: 0.016,
      fogOpacity: 0.04,
      vignetteOpacity: 0.18,
      buttonGlowOpacity: 0.1,
    });

    expect(deriveLandingIdleState(1)).toEqual({
      step: 1,
      line: "Wait longer, and it moves without you.",
      glowOpacity: 0.014,
      fogOpacity: 0.05,
      vignetteOpacity: 0.22,
      buttonGlowOpacity: 0.12,
    });

    expect(deriveLandingIdleState(2)).toEqual({
      step: 2,
      line: "Wait too long, and it moves without you.",
      glowOpacity: 0.012,
      fogOpacity: 0.06,
      vignetteOpacity: 0.26,
      buttonGlowOpacity: 0.14,
    });

    expect(deriveLandingIdleState(3)).toEqual({
      step: 3,
      line: "The world is already moving without you.",
      glowOpacity: 0.01,
      fogOpacity: 0.07,
      vignetteOpacity: 0.3,
      buttonGlowOpacity: 0.18,
    });
  });
});
