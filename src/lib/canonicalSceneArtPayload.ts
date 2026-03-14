import type { PlayTurn } from "@/app/play/types";
import { SceneArtPayload } from "@/lib/sceneArt";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import {
  presentMajorSceneTags,
  presentNpcCuesForPrompt,
  presentNpcStateForSceneKey,
  presentSceneArt,
} from "@/lib/presenters/presentSceneArt";

type CanonicalSceneArtParams = {
  turn: PlayTurn | null;
  state: Record<string, unknown> | null;
};

export function buildCanonicalSceneArtPayload({ turn, state }: CanonicalSceneArtParams): SceneArtPayload | null {
  if (!turn?.scene) return null;

  const visualState = resolveSceneVisualState(state ?? undefined);
  const framingState = resolveSceneFramingState({
    turn,
    visual: visualState,
    locationChanged: false,
  });
  console.log("sceneArt canonical inputs", {
    latestTurnScene: turn.scene,
    visualState,
    framing: framingState,
  });

  const stateRecord = asRecord(state);

  const visualTags = [
    `lighting:${visualState.lightingState}`,
    `atmosphere:${visualState.atmosphereState}`,
    `wear:${visualState.environmentWear}`,
    `threat:${visualState.threatPresence}`,
  ];

  return presentSceneArt({
    title: turn.scene,
    visualState,
    visualTags,
    framingState,
    npcState: presentNpcStateForSceneKey(stateRecord),
    npcCues: presentNpcCuesForPrompt(stateRecord),
    majorTags: presentMajorSceneTags(turn, stateRecord),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
