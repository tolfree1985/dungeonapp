import { describe, expect, it } from "vitest";
import { resolveSceneRefreshDecision } from "./resolveSceneRefreshDecision";
import type { SceneTransitionMemory } from "./sceneTypes";

describe("resolveSceneRefreshDecision", () => {
  it("does not queue renders when hold keeps the same key", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "hold",
      currentSceneKey: "key-a",
      previousSceneKey: "key-a",
      currentReady: true,
      previousReady: true,
    });
    expect(decision).toEqual({
      shouldQueueRender: false,
      shouldReuseCurrentImage: true,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "reuse-current",
    });
  });

  it("queues on hold when the key changes", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "hold",
      currentSceneKey: "key-b",
      previousSceneKey: "key-a",
      currentReady: false,
      previousReady: true,
    });
    expect(decision.shouldQueueRender).toBe(true);
    expect(decision.shouldReuseCurrentImage).toBe(true);
    expect(decision.shouldSwapImmediatelyWhenReady).toBe(false);
    expect(decision.renderPlan).toBe("queue-full-render");
  });

  it("advances only when the key differs", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "advance",
      currentSceneKey: "key-b",
      previousSceneKey: "key-a",
      currentReady: false,
      previousReady: true,
    });
    expect(decision.shouldQueueRender).toBe(true);
    expect(decision.shouldReuseCurrentImage).toBe(true);
    expect(decision.shouldSwapImmediatelyWhenReady).toBe(false);
  });

  it("cuts and swaps immediately when the key changes", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "cut",
      currentSceneKey: "key-b",
      previousSceneKey: "key-a",
      currentReady: false,
      previousReady: true,
    });
    expect(decision).toEqual({
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: true,
      renderPlan: "queue-full-render",
    });
  });

  it("prefers reuse when transition memory preserves everything", () => {
    const memory: SceneTransitionMemory = {
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
    };
    const decision = resolveSceneRefreshDecision({
      transitionType: "cut",
      currentSceneKey: "key-b",
      previousSceneKey: "key-a",
      currentReady: true,
      previousReady: true,
      transitionMemory: memory,
    });
    expect(decision.shouldQueueRender).toBe(false);
    expect(decision.shouldReuseCurrentImage).toBe(true);
    expect(decision.renderPlan).toBe("reuse-current");
  });

  it("reuses the current image when delta says none", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "cut",
      currentSceneKey: "scene-42",
      previousSceneKey: "scene-43",
      currentReady: true,
      previousReady: true,
      sceneDeltaKind: "none",
    });
    expect(decision.renderPlan).toBe("reuse-current");
    expect(decision.shouldQueueRender).toBe(false);
  });

  it("reuses the current image when delta says motif", () => {
    const decision = resolveSceneRefreshDecision({
      transitionType: "cut",
      currentSceneKey: "scene-42",
      previousSceneKey: "scene-42",
      currentReady: true,
      previousReady: true,
      sceneDeltaKind: "motif",
    });
    expect(decision.renderPlan).toBe("reuse-current");
    expect(decision.shouldQueueRender).toBe(false);
  });
});
