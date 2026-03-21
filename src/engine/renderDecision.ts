import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type RenderPlan = "reuse-current" | "partial-render" | "queue-full-render";
export type RenderMode = "full" | "partial";

export type RenderDecisionArgs = {
  sameScene: boolean;
  hasHydratedPreviousSceneKey: boolean;
  hasPreviousCanonicalPayload: boolean;
  hasPreviousSceneArt: boolean;
  sceneArtKeyMismatch?: boolean;
  deltaKind: SceneDeltaKind | null;
};

export type RenderDecisionOutcome = {
  canUseSceneDelta: boolean;
  canReusePreviousSceneArt: boolean;
  renderPlan: RenderPlan;
  shouldQueueRender: boolean;
  shouldReuseCurrentImage: boolean;
  renderMode: RenderMode;
};

export function decideRender({
  sameScene,
  hasHydratedPreviousSceneKey,
  hasPreviousCanonicalPayload,
  hasPreviousSceneArt,
  sceneArtKeyMismatch = false,
  deltaKind,
}: RenderDecisionArgs): RenderDecisionOutcome {
  const canUseSceneDelta = sameScene && hasHydratedPreviousSceneKey && hasPreviousCanonicalPayload;
  const canReusePreviousSceneArt =
    canUseSceneDelta && hasPreviousSceneArt && !sceneArtKeyMismatch;
  const partialKinds = new Set<SceneDeltaKind>([
    "lighting-change",
    "camera-change",
    "composition-change",
  ]);
  let renderPlan: RenderPlan = "queue-full-render";
  if (canReusePreviousSceneArt) {
    renderPlan = "reuse-current";
  } else if (canUseSceneDelta && deltaKind && partialKinds.has(deltaKind)) {
    renderPlan = "partial-render";
  }
  const renderMode: RenderMode = renderPlan === "partial-render" ? "partial" : "full";
  return {
    canUseSceneDelta,
    canReusePreviousSceneArt,
    renderPlan,
    shouldQueueRender: renderPlan !== "reuse-current",
    shouldReuseCurrentImage: renderPlan === "reuse-current",
    renderMode,
  };
}
