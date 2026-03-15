import { describe, expect, it } from "vitest";
import { resolveSceneContinuityState } from "./sceneContinuity";
import { resolveSceneRefreshDecision } from "./resolveSceneRefreshDecision";
import type { SceneTransition } from "./resolveSceneTransition";

describe("resolveSceneContinuityState", () => {
  it("respects the refresh decision when provided", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "advance",
      currentSceneKey: "k2",
      previousSceneKey: "k1",
      currentReady: false,
      previousReady: true,
    });
    const state = resolveSceneContinuityState({
      refreshDecision: decision,
      transition: null,
      currentImageUrl: "current",
      previousImageUrl: "previous",
      isPending: true,
    });
    expect(state.shouldReuseImage).toBe(true);
    expect(state.shouldShowCaption).toBe(true);
    expect(state.shouldRequestRefresh).toBe(true);
  });

it("falls back to transition alone when no decision is present", () => {
    const holdTransition: SceneTransition = {
      type: "hold",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
    };
    const state = resolveSceneContinuityState({
      refreshDecision: null,
      transition: holdTransition,
      currentImageUrl: "x",
      previousImageUrl: "y",
      isPending: false,
    });
    expect(state).toEqual({
      shouldReuseImage: true,
      shouldShowCaption: true,
      shouldRequestRefresh: false,
    });
  });
});
