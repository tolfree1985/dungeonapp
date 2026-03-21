import { describe, expect, it } from "vitest";
import { decideRender } from "@/engine/renderDecision";

describe("decideRender", () => {
  it("chooses reuse when the scene matches and art is reusable", () => {
    const decision = decideRender({
      sameScene: true,
      hasHydratedPreviousSceneKey: true,
      hasPreviousCanonicalPayload: true,
      hasPreviousSceneArt: true,
      sceneArtKeyMismatch: false,
      deltaKind: null,
    });

    expect(decision.renderPlan).toBe("reuse-current");
    expect(decision.shouldReuseCurrentImage).toBe(true);
    expect(decision.shouldQueueRender).toBe(false);
    expect(decision.renderMode).toBe("full");
  });

  it("queues a render when reuse is not possible", () => {
    const decision = decideRender({
      sameScene: false,
      hasHydratedPreviousSceneKey: false,
      hasPreviousCanonicalPayload: false,
      hasPreviousSceneArt: false,
      sceneArtKeyMismatch: true,
      deltaKind: null,
    });

    expect(decision.renderPlan).toBe("queue-full-render");
    expect(decision.shouldReuseCurrentImage).toBe(false);
    expect(decision.shouldQueueRender).toBe(true);
    expect(decision.renderMode).toBe("full");
  });

  it("returns partial render with partial render plan", () => {
    const decision = decideRender({
      sameScene: true,
      hasHydratedPreviousSceneKey: true,
      hasPreviousCanonicalPayload: true,
      hasPreviousSceneArt: false,
      sceneArtKeyMismatch: false,
      deltaKind: "lighting-change",
    });

    expect(decision.renderPlan).toBe("partial-render");
    expect(decision.renderMode).toBe("partial");
    expect(decision.shouldQueueRender).toBe(true);
  });
});
