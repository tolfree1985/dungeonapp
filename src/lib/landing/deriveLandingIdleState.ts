export type LandingIdleStep = 0 | 1 | 2 | 3;

export type LandingIdleState = {
  step: LandingIdleStep;
  line: string;
  glowOpacity: number;
  fogOpacity: number;
  vignetteOpacity: number;
  buttonGlowOpacity: number;
};

export function deriveLandingIdleState(step: LandingIdleStep): LandingIdleState {
  switch (step) {
    case 0:
      return {
        step,
        line: "Wait, and it moves without you.",
        glowOpacity: 0.016,
        fogOpacity: 0.04,
        vignetteOpacity: 0.18,
        buttonGlowOpacity: 0.1,
      };
    case 1:
      return {
        step,
        line: "Wait longer, and it moves without you.",
        glowOpacity: 0.014,
        fogOpacity: 0.05,
        vignetteOpacity: 0.22,
        buttonGlowOpacity: 0.12,
      };
    case 2:
      return {
        step,
        line: "Wait too long, and it moves without you.",
        glowOpacity: 0.012,
        fogOpacity: 0.06,
        vignetteOpacity: 0.26,
        buttonGlowOpacity: 0.14,
      };
    case 3:
      return {
        step,
        line: "The world is already moving without you.",
        glowOpacity: 0.01,
        fogOpacity: 0.07,
        vignetteOpacity: 0.3,
        buttonGlowOpacity: 0.18,
      };
  }
}
