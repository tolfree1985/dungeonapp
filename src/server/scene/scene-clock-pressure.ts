import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type SceneClockPressureResult = {
  deltaKindOverride: SceneDeltaKind | null;
  timingStateEffect: "objective.window-narrowed" | "scene.stalled" | null;
};

export function resolveSceneClockPressure(params: {
  sceneClock: number;
  sameScene: boolean;
  encounterPhase: SceneIdentity["encounterPhase"];
  currentPressure: number;
}): SceneClockPressureResult {
  const { sceneClock, sameScene, encounterPhase, currentPressure } = params;
  if (!sameScene) return { deltaKindOverride: null, timingStateEffect: null };
  if (sceneClock >= 4 && currentPressure >= 3) {
    return { deltaKindOverride: "partial", timingStateEffect: "objective.window-narrowed" };
  }
  if (sceneClock >= 3 && (encounterPhase === "conversation" || encounterPhase === "investigation")) {
    return { deltaKindOverride: "partial", timingStateEffect: "scene.stalled" };
  }
  return { deltaKindOverride: null, timingStateEffect: null };
}
