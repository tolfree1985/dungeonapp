import type { PlayTurn } from "@/app/play/types";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneArtStatus } from "@/generated/prisma";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneTransitionMemory } from "@/lib/sceneTypes";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { resolveSceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import { resolveSceneRefreshDecision, type SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import { resolveSceneTransition } from "@/lib/resolveSceneTransition";
import { resolveSceneTransitionMemory } from "@/lib/resolveSceneTransitionMemory";

type SceneComposition = {
  visual: SceneVisualState;
  framing: SceneFramingState;
  subject: SceneSubjectState;
  actor: SceneActorState;
  focus: SceneFocusState;
};

export type SceneArtRow = {
  sceneKey: string;
  status: SceneArtStatus;
  imageUrl: string | null;
};

export type ResolveTurnSceneArtPresentationArgs = {
  turn: PlayTurn;
  state: Record<string, unknown> | null;
  resolvedSceneState: {
    visualState: SceneVisualState;
    framingState: SceneFramingState;
    subjectState: SceneSubjectState;
    actorState: SceneActorState;
    focusState: SceneFocusState;
  };
  previousSceneComposition: SceneComposition | null;
  previousSceneArt: SceneArtRow | null;
  previousSceneArtForPreviousKey: SceneArtRow | null;
  previousTransitionMemory: SceneTransitionMemory | null;
  previousSceneKey: string | null;
  pressureStage?: string | null;
  modelStatus: "ok" | "MODEL_ERROR";
};

export type ResolveTurnSceneArtPresentationResult = {
  canonicalPayload: SceneArtPayload | null;
  sceneTransition: SceneTransition | null;
  refreshDecision: SceneRefreshDecision | null;
  transitionMemory: SceneTransitionMemory;
  sceneArtResult: SceneArtRow | null;
  shouldCreateSceneArt: boolean;
};

export function resolveTurnSceneArtPresentation(
  args: ResolveTurnSceneArtPresentationArgs
): ResolveTurnSceneArtPresentationResult {
  const {
    turn,
    resolvedSceneState,
    previousSceneComposition,
    previousSceneArt,
    previousSceneArtForPreviousKey,
    previousTransitionMemory,
    previousSceneKey,
    pressureStage,
  } = args;

  const canonicalPayload = buildCanonicalSceneArtPayload({
    turn,
    state: args.state,
  });

  const transitionMemory = resolveSceneTransitionMemory({
    previousMemory: previousTransitionMemory,
    previous: previousSceneComposition
      ? {
          framing: previousSceneComposition.framing,
          subject: previousSceneComposition.subject,
          actor: previousSceneComposition.actor,
          focus: previousSceneComposition.focus,
        }
      : null,
    current: {
      framing: resolvedSceneState.framingState,
      subject: resolvedSceneState.subjectState,
      actor: resolvedSceneState.actorState,
      focus: resolvedSceneState.focusState,
    },
  });

  const locationChanged = Boolean(
    previousSceneComposition &&
      previousSceneComposition.visual.locationId !== resolvedSceneState.visualState.locationId
  );

  const directorDecision = resolveSceneDirectorDecision({
    transitionMemory,
    visualState: { locationChanged },
    framingState: resolvedSceneState.framingState,
    focusState: resolvedSceneState.focusState,
    pressureStage: pressureStage ?? resolvedSceneState.visualState.pressureStage,
  });

  const sceneTransition = resolveSceneTransition({
    previous: previousSceneComposition,
    next: {
      visual: resolvedSceneState.visualState,
      framing: resolvedSceneState.framingState,
      subject: resolvedSceneState.subjectState,
      actor: resolvedSceneState.actorState,
      focus: resolvedSceneState.focusState,
    },
    memory: transitionMemory,
    directorDecision,
  });

  const refreshDecision = canonicalPayload
    ? resolveSceneRefreshDecision({
        transitionType: sceneTransition.type,
        currentSceneKey: canonicalPayload.sceneKey,
        previousSceneKey,
        currentReady: previousSceneArt?.status === "ready",
        previousReady: previousSceneArtForPreviousKey?.status === "ready",
        transitionMemory,
      })
    : null;

  const shouldCreateSceneArt = Boolean(refreshDecision?.shouldQueueRender && !previousSceneArt);
  let sceneArtResult: SceneArtRow | null = previousSceneArt
    ? { ...previousSceneArt }
    : shouldCreateSceneArt && canonicalPayload
    ? {
        sceneKey: canonicalPayload.sceneKey,
        status: "queued",
        imageUrl: null,
      }
    : null;

  return {
    canonicalPayload,
    sceneTransition,
    refreshDecision,
    transitionMemory,
    sceneArtResult,
    shouldCreateSceneArt,
  };
}
