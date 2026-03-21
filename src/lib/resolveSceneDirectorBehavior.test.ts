import { describe, expect, it } from "vitest";
import { resolveSceneDirectorBehavior } from "./resolveSceneDirectorBehavior";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "./sceneTypes";

describe("resolveSceneDirectorBehavior", () => {
  it("forces hold when composition is preserved under calm conditions", () => {
    const decision = resolveSceneDirectorBehavior({
      transitionMemory: {
        ...EMPTY_SCENE_TRANSITION_MEMORY,
        preserveFraming: true,
        preserveSubject: true,
        preserveFocus: true,
      },
      visualState: { locationChanged: false },
      framingState: { scale: "medium" },
      focusState: { primary: "clue" },
      pressureStage: "tension",
    });

    expect(decision.forceHold).toBe(true);
    expect(decision.allowCut).toBe(false);
  });

  it("allows a cut when pressure is high", () => {
    const decision = resolveSceneDirectorBehavior({
      transitionMemory: {
        ...EMPTY_SCENE_TRANSITION_MEMORY,
        preserveFraming: false,
        preserveSubject: false,
        preserveFocus: false,
      },
      visualState: { locationChanged: false },
      framingState: { scale: "medium" },
      focusState: { primary: "environment" },
      pressureStage: "crisis",
    });

    expect(decision.allowCut).toBe(true);
  });

  it("escalates camera when focus drifts under high pressure", () => {
    const decision = resolveSceneDirectorBehavior({
      transitionMemory: {
        ...EMPTY_SCENE_TRANSITION_MEMORY,
        preserveFraming: true,
        preserveSubject: true,
        preserveFocus: false,
      },
      visualState: { locationChanged: false },
      framingState: { scale: "medium" },
      focusState: { primary: "clue", detail: "weapon" },
      pressureStage: "crisis",
    });

    expect(decision.escalateCamera).toBe(true);
  });
});
