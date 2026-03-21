import type { SceneDeltaKind } from "./resolveSceneDeltaKind";
import type { SceneRenderPlan } from "./resolveSceneRefreshDecision";

export type SceneContinuityReason =
  | "INITIAL_RENDER"
  | "NO_PREVIOUS_CANONICAL_PAYLOAD"
  | "NO_PREVIOUS_SCENE_ART"
  | "KEY_MISMATCH"
  | "REUSE_OK"
  | "FULL_RENDER_REQUIRED";

export type SceneContinuityBucket = "bootstrap" | "degraded" | "decision";

export type SceneContinuityInfo = {
  sceneKey: string;
  identityKey?: string;
  previousSceneKey: string | null;
  previousSceneArtKeyMismatch: boolean;
  deltaKind: SceneDeltaKind | null;
  renderPlan: SceneRenderPlan;
  continuityReason: SceneContinuityReason;
  continuityBucket: SceneContinuityBucket;
  shotKey: string;
  previousShotKey: string | null;
  shotDuration: number;
  reuseRate: number;
};
