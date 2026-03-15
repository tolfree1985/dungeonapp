import { describe, expect, it } from "vitest";
import { resolveSceneRefreshDecision } from "./resolveSceneRefreshDecision";

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
    });
  });
});
