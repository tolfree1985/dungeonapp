import { resolveSceneDeltaKind, type SceneDeltaKind, type SceneDeltaSnapshot } from "@/lib/resolveSceneDeltaKind";

export function detectSceneDelta(
  previous: SceneDeltaSnapshot | null,
  current: SceneDeltaSnapshot | null,
): SceneDeltaKind {
  return resolveSceneDeltaKind(previous, current);
}
