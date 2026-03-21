import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";

type BuildFallbackParams = {
  currentSceneKey: string;
  currentIdentityKey?: string | null;
  previous: SceneContinuityInfo | null;
  turnIndex: number;
};

type FinalizeContinuityParams = {
  candidate: SceneContinuityInfo | null;
  correctedSceneKey: string;
  identityKey?: string | null;
  previous: SceneContinuityInfo | null;
  turnIndex: number;
};

type AssertContinuityParams = {
  continuityInfo: SceneContinuityInfo | null | undefined;
  turnIndex: number;
};

const DEFAULT_TRANSITION_BUCKET = "degraded" as const;
const DEFAULT_REUSE_BUCKET = "decision" as const;

function isSameScene(previousSceneKey: string | null, currentSceneKey: string): boolean {
  return previousSceneKey !== null && previousSceneKey === currentSceneKey;
}

export function buildFallbackContinuity(params: BuildFallbackParams): SceneContinuityInfo {
  const { currentSceneKey, previous, turnIndex } = params;
  void turnIndex;
  if (!currentSceneKey) {
    throw new Error("buildFallbackContinuity requires a non-empty sceneKey");
  }
  const previousSceneKey = previous?.sceneKey ?? null;
  const sameScene = isSameScene(previousSceneKey, currentSceneKey);
  const fallbackShotDuration = sameScene ? Math.max(1, (previous?.shotDuration ?? 0) + 1) : 1;
  const identityKey = params.currentIdentityKey ?? previous?.identityKey ?? currentSceneKey;
  return {
    sceneKey: currentSceneKey,
    identityKey,
    previousSceneKey,
    previousSceneArtKeyMismatch: Boolean(previous?.previousSceneArtKeyMismatch),
    deltaKind: sameScene ? "none" : "full",
    renderPlan: sameScene ? "reuse-current" : "queue-full-render",
    continuityReason: sameScene ? "REUSE_OK" : "FULL_RENDER_REQUIRED",
    continuityBucket: sameScene ? DEFAULT_REUSE_BUCKET : DEFAULT_TRANSITION_BUCKET,
    shotKey: sameScene ? previous?.shotKey ?? currentSceneKey : null,
    previousShotKey: previous?.shotKey ?? null,
    shotDuration: fallbackShotDuration,
    reuseRate: previous?.reuseRate ?? 0,
  };
}

export function finalizeContinuityInfo(params: FinalizeContinuityParams): SceneContinuityInfo {
  const { candidate, correctedSceneKey, identityKey, previous, turnIndex } = params;
  void turnIndex;
  if (!correctedSceneKey) {
    throw new Error("finalizeContinuityInfo requires a correctedSceneKey");
  }
  if (!candidate) {
    return buildFallbackContinuity({
      currentSceneKey: correctedSceneKey,
      currentIdentityKey: identityKey,
      previous,
      turnIndex,
    });
  }
  const previousSceneKey = candidate.previousSceneKey ?? previous?.sceneKey ?? null;
  const sameScene = isSameScene(previousSceneKey, correctedSceneKey);
  const resolvedIdentityKey =
    identityKey ?? candidate.identityKey ?? previous?.identityKey ?? correctedSceneKey;
  return {
    sceneKey: correctedSceneKey,
    identityKey: resolvedIdentityKey,
    previousSceneKey,
    previousSceneArtKeyMismatch:
      candidate.previousSceneArtKeyMismatch ?? Boolean(previous?.previousSceneArtKeyMismatch),
    deltaKind: candidate.deltaKind ?? (sameScene ? "none" : "full"),
    renderPlan: candidate.renderPlan ?? (sameScene ? "reuse-current" : "queue-full-render"),
    continuityReason: candidate.continuityReason ?? (sameScene ? "REUSE_OK" : "FULL_RENDER_REQUIRED"),
    continuityBucket: candidate.continuityBucket ?? (sameScene ? DEFAULT_REUSE_BUCKET : DEFAULT_TRANSITION_BUCKET),
    shotKey: candidate.shotKey ?? (sameScene ? previous?.shotKey ?? null : null),
    previousShotKey: candidate.previousShotKey ?? previous?.shotKey ?? null,
    shotDuration:
      candidate.shotDuration ??
      (sameScene ? Math.max(1, (previous?.shotDuration ?? 0) + 1) : 1),
    reuseRate: candidate.reuseRate ?? previous?.reuseRate ?? 0,
  };
}

export function assertContinuityReady(params: AssertContinuityParams): void {
  const { continuityInfo, turnIndex } = params;
  if (turnIndex > 0 && !continuityInfo) {
    throw new Error("CONTINUITY_INFO_MISSING_BEFORE_PERSIST");
  }
  if (continuityInfo && !continuityInfo.sceneKey) {
    throw new Error("INVALID_CONTINUITY_SCENE_KEY");
  }
}
