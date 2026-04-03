import type { PlayTurn } from "@/app/play/types";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneArtStatus } from "@/generated/prisma";
import type { RenderMode } from "@/lib/sceneArtRepo";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneCameraMemory, SceneShotIntent, SceneTransitionMemory } from "@/lib/sceneTypes";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { resolveSceneDirectorBehavior } from "@/lib/resolveSceneDirectorBehavior";
import { resolveSceneRefreshDecision, type SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import { resolveSceneTransition } from "@/lib/resolveSceneTransition";
import { resolveSceneTransitionMemory } from "@/lib/resolveSceneTransitionMemory";
import { resolveSceneShotIntent } from "@/lib/resolveSceneShotIntent";
import { resolveSceneShotGrammar, type SceneShotGrammar } from "@/lib/resolveSceneShotGrammar";
import { resolveScenePromptFraming, type ScenePromptFraming } from "@/lib/resolveScenePromptFraming";
import { resolveSceneMotif, buildMotifTags, type SceneMotif } from "@/lib/resolveSceneMotif";
import { resolveSceneRevealStructure, buildRevealStructureTags, type SceneRevealStructure } from "@/lib/resolveSceneRevealStructure";
import { resolveSceneSpatialHierarchy, type SceneSpatialHierarchy } from "@/lib/resolveSceneSpatialHierarchy";
import { resolveSceneCompositionBias, type SceneCompositionBias } from "@/lib/resolveSceneCompositionBias";
import { resolveSceneThreatFraming, buildThreatFramingTags, type SceneThreatFraming } from "@/lib/resolveSceneThreatFraming";
import { buildSceneCanonicalTags, DEFAULT_SCENE_CANONICAL_TAG_POLICY, type SceneCanonicalTagPolicy } from "@/lib/sceneCanonicalTagPolicy";
import { resolveSceneDirectorDecision, type SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import { resolveCanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";

type SceneComposition = {
  visual: SceneVisualState;
  framing: SceneFramingState;
  subject: SceneSubjectState;
  actor: SceneActorState;
  focus: SceneFocusState;
};

export type SceneArtRow = {
  id?: string;
  sceneKey: string;
  promptHash: string;
  status: SceneArtStatus;
  imageUrl: string | null;
  renderMode?: RenderMode;
};

export type PreviousSceneContinuity = {
  sceneKey: string | null;
  canonicalPayload: SceneArtPayload | null;
  sceneArt: SceneArtRow | null;
  sceneArtKeyMismatch?: boolean;
  shotKey?: string | null;
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
  previousTransitionMemory: SceneTransitionMemory | null;
  pressureStage?: string | null;
  overrideMotif?: SceneMotif | null;
  tagPolicy?: SceneCanonicalTagPolicy;
  modelStatus: "ok" | "MODEL_ERROR";
  sceneDeltaKind?: SceneDeltaKind | null;
  cameraMemory?: SceneCameraMemory | null;
  previousDirectorDecision?: SceneDirectorDecision | null;
  previousSceneContinuity: PreviousSceneContinuity | null;
};

export type ScenePresentation = {
  shotIntent: SceneShotIntent;
  shotGrammar: SceneShotGrammar | null;
  promptFraming: ScenePromptFraming | null;
  motif: SceneMotif | null;
  threatFraming: SceneThreatFraming | null;
  threatFramingTags: string[];
  revealStructure: SceneRevealStructure | null;
  revealStructureTags: string[];
  spatialHierarchy: SceneSpatialHierarchy | null;
  compositionBias: SceneCompositionBias | null;
  directorDecision: SceneDirectorDecision | null;
};

export type ResolveTurnSceneArtPresentationResult = {
  canonicalPayload: SceneArtPayload | null;
  sceneTransition: SceneTransition | null;
  refreshDecision: SceneRefreshDecision | null;
  transitionMemory: SceneTransitionMemory;
  sceneArtResult: SceneArtRow | null;
  shouldCreateSceneArt: boolean;
  shotIntent: SceneShotIntent | null;
  shotGrammar: SceneShotGrammar | null;
  promptFraming: ScenePromptFraming | null;
  scenePresentation: ScenePresentation | null;
  sceneDeltaKind: SceneDeltaKind | null;
};

export function resolveTurnSceneArtPresentation(
  args: ResolveTurnSceneArtPresentationArgs
): ResolveTurnSceneArtPresentationResult {
  const {
    turn,
    resolvedSceneState,
    previousSceneComposition,
    previousSceneArt,
    previousTransitionMemory,
    previousSceneContinuity,
    pressureStage,
  } = args;

  const previousSceneContinuitySafe: PreviousSceneContinuity = previousSceneContinuity ?? {
    sceneKey: null,
    canonicalPayload: null,
    sceneArt: null,
  };
  const previousSceneIdentity = resolveCanonicalSceneIdentity(
    previousSceneContinuitySafe.canonicalPayload,
  );
  const previousSceneKey = previousSceneIdentity.sceneKey;
  const previousSceneArtForPreviousKey = previousSceneContinuitySafe.sceneArt;
  const previousSceneArtKeyMismatch = previousSceneContinuitySafe.sceneArtKeyMismatch ?? false;

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

  const directorBehavior = resolveSceneDirectorBehavior({
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
    directorDecision: directorBehavior,
  });

  const shotIntent = resolveSceneShotIntent({
    pressureStage: pressureStage ?? resolvedSceneState.visualState.pressureStage,
    focusState: resolvedSceneState.focusState,
    subjectState: resolvedSceneState.subjectState,
    actorState: resolvedSceneState.actorState,
    framingState: resolvedSceneState.framingState,
    sceneTransition,
    transitionMemory,
  });
  const shotGrammar = resolveSceneShotGrammar({
    shotIntent,
    directorDecision: directorBehavior,
    framingState: resolvedSceneState.framingState,
    focusState: resolvedSceneState.focusState,
    subjectState: resolvedSceneState.subjectState,
    actorState: resolvedSceneState.actorState,
    sceneTransition,
  });
  const promptFraming = resolveScenePromptFraming({
    shotIntent,
    shotGrammar,
    directorDecision: directorBehavior,
    framingState: resolvedSceneState.framingState,
    focusState: resolvedSceneState.focusState,
    subjectState: resolvedSceneState.subjectState,
    actorState: resolvedSceneState.actorState,
  });

  const motif = resolveSceneMotif({
    shotIntent,
    visualState: resolvedSceneState.visualState,
    pressureStage: pressureStage ?? resolvedSceneState.visualState.pressureStage,
    transitionMemory,
  });

  const threatFraming = resolveSceneThreatFraming({
    shotIntent,
    shotGrammar,
    motif,
    directorDecision: directorBehavior,
    pressureStage: pressureStage ?? resolvedSceneState.visualState.pressureStage,
    focusState: resolvedSceneState.focusState,
    sceneTransition,
    transitionMemory,
  });

  const revealStructure = resolveSceneRevealStructure({
    shotIntent,
    focusState: resolvedSceneState.focusState,
    motif,
    sceneTransition,
  });
  const revealStructureTags = buildRevealStructureTags(revealStructure);
  const spatialHierarchy = resolveSceneSpatialHierarchy({
    focusState: resolvedSceneState.focusState,
    actorState: resolvedSceneState.actorState,
    subjectState: resolvedSceneState.subjectState,
    framingState: resolvedSceneState.framingState,
  });
  const compositionBias = resolveSceneCompositionBias({
    framingState: resolvedSceneState.framingState,
    visualState: resolvedSceneState.visualState,
    focusState: resolvedSceneState.focusState,
  });

  const directorPresentation = shotIntent
    ? resolveSceneDirectorDecision({
        shotIntent,
        threatFraming,
        revealStructure,
        spatialHierarchy,
        compositionBias,
        pressureStage: pressureStage ?? resolvedSceneState.visualState.pressureStage,
        focusState: resolvedSceneState.focusState,
        sceneTransitionType: sceneTransition.type,
        framingState: resolvedSceneState.framingState,
        cameraMemory: args.cameraMemory ?? null,
        previousDirectorDecision: args.previousDirectorDecision ?? null,
        sceneDeltaKind: args.sceneDeltaKind ?? null,
      })
    : null;

  const motifInput = args.overrideMotif ?? motif;
  const motifTags = motifInput ? buildMotifTags(motifInput) : [];
  const threatFramingTags = buildThreatFramingTags(threatFraming);

  const canonicalTagResult = buildSceneCanonicalTags({
    promptFramingTags: promptFraming?.visualTags,
    motifTags,
    threatFramingTags,
    revealStructureTags,
    tagPolicy: args.tagPolicy ?? DEFAULT_SCENE_CANONICAL_TAG_POLICY,
  });

  const scenePresentation: ScenePresentation | null = shotIntent
    ? {
        shotIntent,
        shotGrammar,
        promptFraming,
        motif: motifInput,
        threatFraming,
        threatFramingTags,
        revealStructure,
        revealStructureTags,
        spatialHierarchy,
        compositionBias,
        directorDecision: directorPresentation,
      }
    : null;

  const canonicalPayload = buildCanonicalSceneArtPayload({
    turn,
    state: args.state,
    shotIntent,
    scenePromptFraming: promptFraming,
    motifTags: canonicalTagResult.motifTags,
    threatFramingTags: canonicalTagResult.threatFramingTags,
    revealStructureTags: canonicalTagResult.revealStructureTags,
    directorDecision: directorPresentation,
  });
  const currentSceneIdentity = resolveCanonicalSceneIdentity(canonicalPayload);

  const adjustedDeltaKind = adjustDeltaKindForHold(
    args.sceneDeltaKind ?? null,
    sceneTransition,
    transitionMemory,
  );

  let refreshDecision = canonicalPayload
    ? resolveSceneRefreshDecision({
        transitionType: sceneTransition.type,
        current: currentSceneIdentity,
        previous: previousSceneIdentity,
        currentReady: previousSceneArt?.status === "ready",
        previousReady: previousSceneArtForPreviousKey?.status === "ready",
        transitionMemory,
        sceneDeltaKind: adjustedDeltaKind,
      })
    : null;
  const previousContinuity = args.previousSceneContinuity;
  const missingCanonical = Boolean(previousContinuity && !previousContinuity.canonicalPayload);
  const missingSceneArt = Boolean(previousContinuity && !previousContinuity.sceneArt);
  const keyMismatch = Boolean(previousContinuity?.sceneArtKeyMismatch);
  const degradedReason = keyMismatch
    ? "KEY_MISMATCH"
    : missingCanonical
    ? "NO_PREVIOUS_CANONICAL_PAYLOAD"
    : missingSceneArt
    ? "NO_PREVIOUS_SCENE_ART"
    : null;
  const shouldForceQueueForDegradedContinuity =
    refreshDecision?.renderPlan === "reuse-current" && degradedReason !== null;
  if (refreshDecision && shouldForceQueueForDegradedContinuity) {
    console.warn("scene.render.degraded_enqueue", {
      sceneKey: currentSceneIdentity.sceneKey,
      promptHash: currentSceneIdentity.promptHash,
      previousSceneKey,
      previousPromptHash: previousSceneIdentity.promptHash,
      degradedReason,
    });
    refreshDecision = {
      ...refreshDecision,
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "queue-full-render",
    };
  }

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
    shotIntent,
    shotGrammar,
    promptFraming,
    scenePresentation,
    sceneDeltaKind: adjustedDeltaKind,
  };
}

function adjustDeltaKindForHold(
  deltaKind: SceneDeltaKind | null,
  sceneTransition: SceneTransition,
  transitionMemory: SceneTransitionMemory,
): SceneDeltaKind | null {
  if (
    deltaKind === "full" &&
    sceneTransition.type === "hold" &&
    transitionMemory.preserveFraming &&
    transitionMemory.preserveSubject &&
    transitionMemory.preserveActor &&
    transitionMemory.preserveFocus
  ) {
    return "none";
  }
  return deltaKind;
}
