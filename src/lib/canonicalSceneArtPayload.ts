import type { PlayTurn } from "@/app/play/types";
import { SceneArtPayload } from "@/lib/sceneArt";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
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

export function buildCanonicalSceneArtPayload({
  turn,
  state,
}: CanonicalSceneArtParams): SceneArtPayload | null {
  if (!turn?.scene) return null;

  const stateRecord = asRecord(state);
  const visualState = resolveSceneVisualState(stateRecord);
  const framingState = resolveSceneFramingState({
    turn,
    visual: visualState,
    locationChanged: false,
  });
  const subjectState = resolveSceneSubjectState({
    state: stateRecord,
    framing: framingState,
  });
  const actorState = resolveSceneActorState({
    state: stateRecord,
    subject: subjectState,
  });
  const focusState = resolveSceneFocusState({
    state: stateRecord,
    subject: subjectState,
    actor: actorState,
    framing: framingState,
  });
  console.log("sceneArt canonical inputs", {
    latestTurnScene: turn.scene,
    visualState,
    framing: framingState,
    subject: subjectState,
    actor: actorState,
  });

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
    subjectState,
    npcState: presentNpcStateForSceneKey(stateRecord),
    npcCues: presentNpcCuesForPrompt(stateRecord),
    majorTags: presentMajorSceneTags(turn, stateRecord),
    actorState,
    focusState,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
