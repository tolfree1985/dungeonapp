import type { SceneIdentity } from "@/server/scene/scene-identity";
import { buildSceneKey } from "@/server/scene/scene-identity";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type SceneAnchor = "location" | "focalActor" | "objective" | "encounterPhase";

export type SceneTransitionLedgerEntry = {
  type: "scene.transition";
  domain: "visual";
  cause: string;
  effect: string;
  data: {
    previousSceneKey: string;
    sceneKey: string;
    changedAnchors: SceneAnchor[];
  };
};

export function describeSceneIdentityChanges(prev: SceneIdentity | null, current: SceneIdentity): SceneAnchor[] {
  if (!prev) return [];
  const anchors: SceneAnchor[] = [];
  if (prev.locationKey !== current.locationKey) anchors.push("location");
  if (prev.focalActorKey !== current.focalActorKey) anchors.push("focalActor");
  if (prev.objectiveKey !== current.objectiveKey) anchors.push("objective");
  if (prev.encounterPhase !== current.encounterPhase) anchors.push("encounterPhase");
  return anchors;
}

export function buildSceneTransitionLedgerEntry(params: {
  previousSceneKey: string;
  sceneKey: string;
  deltaKind: SceneDeltaKind;
  changedAnchors: SceneAnchor[];
}): SceneTransitionLedgerEntry | null {
  const { previousSceneKey, sceneKey, deltaKind, changedAnchors } = params;
  if (!previousSceneKey || deltaKind === "none" || changedAnchors.length === 0) return null;
  const cause =
    changedAnchors.length === 1
      ? `scene.${changedAnchors[0]}.changed`
      : `scene.${changedAnchors.join("+")}.changed`;
  const effect = `scene.delta.${deltaKind}`;
  return {
    type: "scene.transition",
    domain: "visual",
    cause,
    effect,
    data: {
      previousSceneKey,
      sceneKey,
      changedAnchors,
    },
  };
}
