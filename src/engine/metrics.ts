import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type SceneMetricsPayload = {
  sceneKey: string | null;
  turnIndex: number | null;
  reuseRate: number;
  shotDuration: number;
  renderPlan: string;
  deltaKind: SceneDeltaKind | null;
};

export function logSceneMetrics(payload: SceneMetricsPayload) {
  console.log("scene.system.metrics", payload);
}
