import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import type { FailForwardSignal } from "@/server/scene/scene-transition-pressure";
import type { FailForwardComplication } from "@/lib/fail-forward-complication";
export type { FailForwardComplication } from "@/lib/fail-forward-complication";

export function resolveFailForwardComplication(params: {
  signal: FailForwardSignal;
  encounterPhase: SceneIdentity["encounterPhase"];
  deltaKind: SceneDeltaKind;
  pressure: number;
}): FailForwardComplication | null {
  const { signal, encounterPhase, deltaKind, pressure } = params;
  if (!signal.active) return null;
  if (signal.severity === "high") {
    return "position-worsened";
  }
  if (signal.severity === "medium") {
    if (deltaKind === "full" || encounterPhase === "conflict") {
      return "noise-increased";
    }
    return "time-lost";
  }
  if (signal.severity === "low") {
    if (deltaKind === "full") {
      return "time-lost";
    }
    if (encounterPhase === "conflict") {
      return "noise-increased";
    }
    if (pressure >= 3) {
      return "time-lost";
    }
    return "npc-suspicious";
  }
  return null;
}
