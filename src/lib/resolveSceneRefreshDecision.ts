import type { SceneTransitionMemory } from "./sceneTypes";
import type { SceneDeltaKind } from "./resolveSceneDeltaKind";
import type { CanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";

export type SceneRefreshDecision = {
  shouldQueueRender: boolean;
  shouldReuseCurrentImage: boolean;
  shouldSwapImmediatelyWhenReady: boolean;
  renderPlan: SceneRenderPlan;
};

export type ResolveSceneRefreshDecisionArgs = {
  transitionType: "hold" | "advance" | "cut" | null;
  current: CanonicalSceneIdentity;
  previous: CanonicalSceneIdentity;
  currentReady: boolean;
  previousReady: boolean;
  transitionMemory?: SceneTransitionMemory | null;
  sceneDeltaKind?: SceneDeltaKind | null;
};

export type SceneRenderPlan = "reuse-current" | "queue-full-render" | "keep-current-while-queued";

export function resolveSceneRefreshDecision(
  args: ResolveSceneRefreshDecisionArgs,
): SceneRefreshDecision {
  const type = args.transitionType ?? "cut";
  const hasCurrentIdentity = Boolean(args.current.sceneKey && args.current.promptHash);
  const hasPreviousIdentity = Boolean(args.previous.sceneKey && args.previous.promptHash);
  if (!hasCurrentIdentity || !hasPreviousIdentity) {
    console.debug("scene.delta.identity_missing", {
      current: args.current,
      previous: args.previous,
    });
    return {
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "queue-full-render",
    };
  }
  const currentSceneKey = args.current.sceneKey;
  const previousSceneKey = args.previous.sceneKey;
  const keysDiffer = currentSceneKey !== previousSceneKey;
  const memory = args.transitionMemory ?? null;
  const deltaKind = args.sceneDeltaKind ?? null;
  const fullyPreserved =
    memory &&
    memory.preserveFraming &&
    memory.preserveSubject &&
    memory.preserveActor &&
    memory.preserveFocus;

  const reuseKinds: Set<SceneDeltaKind> = new Set(["none", "text-only", "motif"]);
  if (fullyPreserved) {
    return {
      shouldQueueRender: false,
      shouldReuseCurrentImage: true,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "reuse-current",
    };
  }
  const isVitestTest =
    typeof globalThis !== "undefined" && "__vitest__" in (globalThis as Record<string, unknown>);
  if (deltaKind === null) {
    if (!isVitestTest && process.env.NODE_ENV !== "test") {
      console.warn("scene.delta.missing", {
        sceneKey: currentSceneKey,
        previousSceneKey,
        currentPromptHash: args.current.promptHash,
        previousPromptHash: args.previous.promptHash,
      });
    }
    const renderPlanFallback = keysDiffer ? "queue-full-render" : "reuse-current";
    const shouldQueueRenderFallback = keysDiffer;
    const shouldReuseCurrentImageFallback =
      renderPlanFallback !== "queue-full-render" || type !== "cut";
    const shouldSwapImmediatelyWhenReadyFallback =
      renderPlanFallback === "queue-full-render" && type === "cut";
    return {
      shouldQueueRender: shouldQueueRenderFallback,
      shouldReuseCurrentImage: shouldReuseCurrentImageFallback,
      shouldSwapImmediatelyWhenReady: shouldSwapImmediatelyWhenReadyFallback,
      renderPlan: renderPlanFallback,
    };
  }

  let renderPlan: SceneRenderPlan;
  if (reuseKinds.has(deltaKind)) {
    renderPlan = "reuse-current";
  } else if (currentSceneKey && previousSceneKey && !keysDiffer) {
    renderPlan = "keep-current-while-queued";
  } else {
    renderPlan = "queue-full-render";
  }

  if (deltaKind === "full" && renderPlan === "reuse-current") {
    console.error("scene.render.invariant_violation", {
      sceneKey: currentSceneKey,
      previousSceneKey,
      deltaKind,
      renderPlan,
    });
    renderPlan = "queue-full-render";
  }

  const shouldQueueRender = renderPlan !== "reuse-current";
  const shouldReuseCurrentImage = renderPlan !== "queue-full-render" || type !== "cut";
  const shouldSwapImmediatelyWhenReady = renderPlan === "queue-full-render" && type === "cut";

  return {
    shouldQueueRender,
    shouldReuseCurrentImage,
    shouldSwapImmediatelyWhenReady,
    renderPlan,
  };
}
