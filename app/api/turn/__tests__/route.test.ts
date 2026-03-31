import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { SceneArtPayload } from "@/lib/sceneArt";
import { buildPromptHash } from "@/lib/sceneArtGenerator";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import type {
  SceneCameraContinuityState,
  SceneTransitionMemory,
} from "@/lib/sceneTypes";
import { resolveTurnSceneArtPresentation } from "@/lib/resolveTurnSceneArtPresentation";
import { persistSceneTransitionMemory, orchestrateLegacySceneArtDecision } from "@/app/api/turn/route";
import type { PlayTurn } from "@/app/play/types";

function makeTurn(id: string, scene: string): PlayTurn {
  return {
    id,
    turnIndex: 1,
    playerInput: "Look",
    scene,
    resolution: "ok",
    stateDeltas: [],
    ledgerAdds: [],
    createdAt: new Date().toISOString(),
  };
}

function makeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    location: "stone gallery",
    pressureStage: "tension",
    timeOfDay: "night",
    stats: { heat: 2, noise: 0, alert: 1, location: "stone gallery" },
    visibleDetails: [{ id: "shard", label: "Shiny" }],
    ...overrides,
  };
}

function buildPresentationArgs(turn: PlayTurn, state: Record<string, unknown> | null) {
  const visual = resolveSceneVisualState(state);
  const framing = resolveSceneFramingState({ turn, visual, locationChanged: false });
  const subject = resolveSceneSubjectState({ state, framing });
  const actor = resolveSceneActorState({ state, subject });
  const focus = resolveSceneFocusState({ state, framing, subject, actor });
  return {
    turn,
    state,
    resolvedSceneState: {
      visualState: visual,
      framingState: framing,
      subjectState: subject,
      actorState: actor,
      focusState: focus,
    },
    previousSceneComposition: null,
    previousSceneArt: null,
    previousTransitionMemory: null,
    pressureStage: visual.pressureStage,
    modelStatus: "ok",
    cameraMemory: null,
    previousDirectorDecision: null,
    previousSceneContinuity: {
      sceneKey: null,
      canonicalPayload: null,
      sceneArt: null,
    },
  };
}

describe("POST /api/turn helpers", () => {
  const basePrompt = "test prompt";
  const renderPrompt = "test render";
  const promptHash = buildPromptHash(basePrompt, ENGINE_VERSION);
  const payload: SceneArtPayload = {
    sceneKey: "scene-test-key",
    identity: {
      locationId: null,
      pressureStage: null,
      lightingState: null,
      atmosphereState: null,
      environmentWear: null,
      threatPresence: null,
      frameKind: null,
      shotScale: null,
      subjectFocus: null,
      cameraAngle: null,
      primarySubjectKind: null,
      primarySubjectId: null,
      actorVisible: false,
      primaryActorId: null,
    },
    promptMetadata: {
      latestTurnScene: "",
      timeValue: null,
      directorDecision: { emphasis: null, compositionBias: null },
    },
    basePrompt,
    renderPrompt,
    promptHash,
    stylePreset: "victorian-gothic-cinematic",
    tags: [],
  };

  it("queues when the refresh decision requests a render", async () => {
    const queueSceneArt = vi.fn().mockResolvedValue({ status: "queued", imageUrl: "/queued.png" });
    const refreshDecision: SceneRefreshDecision = {
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "queue-full-render",
    };

    const result = await orchestrateLegacySceneArtDecision({
      sceneArtPayload: payload,
      refreshDecision,
      existingSceneArt: null,
      queueSceneArt,
    });

    expect(queueSceneArt).toHaveBeenCalledWith(payload, ENGINE_VERSION, "normal", "full");
    expect(result).toEqual({ sceneKey: payload.sceneKey, status: "queued", imageUrl: "/queued.png" });
    expect(result?.sceneKey).toBe(payload.sceneKey);
  });

  it("reuses the cached row when refresh decides not to queue", async () => {
    const queueSceneArt = vi.fn();
    const existing = { sceneKey: payload.sceneKey, status: "ready", imageUrl: "/ready.png" };
    const refreshDecision: SceneRefreshDecision = {
      shouldQueueRender: false,
      shouldReuseCurrentImage: true,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "reuse-current",
    };

    const result = await orchestrateLegacySceneArtDecision({
      sceneArtPayload: payload,
      refreshDecision,
      existingSceneArt: existing,
      queueSceneArt,
    });

    expect(queueSceneArt).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("returns the cached row when the helper is invoked for a MODEL_ERROR result", async () => {
    const queueSceneArt = vi.fn();
    const existing = { sceneKey: payload.sceneKey, status: "failed", imageUrl: "/error.png" };

    const result = await orchestrateLegacySceneArtDecision({
      sceneArtPayload: payload,
      refreshDecision: null,
      existingSceneArt: existing,
      queueSceneArt,
    });

    expect(queueSceneArt).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("persists transition memory for every turn branch", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { adventure: { update } } as unknown as PrismaClient;
    const transitionMemory: SceneTransitionMemory = {
      preserveActor: true,
      preserveFocus: true,
      preserveFraming: false,
      preserveSubject: true,
    };

    await persistSceneTransitionMemory({ db: db as any, adventureId: "adv-check", transitionMemory });

    expect(update).toHaveBeenCalledWith({
      where: { id: "adv-check" },
      data: { sceneTransitionMemory: transitionMemory },
    });
  });

  it("persists camera continuity state when provided", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { adventure: { update } } as unknown as PrismaClient;
    const transitionMemory: SceneTransitionMemory = {
      preserveActor: true,
      preserveFocus: true,
      preserveFraming: true,
      preserveSubject: true,
    };
    const continuityState: SceneCameraContinuityState = {
      consecutiveAdvances: 2,
      cameraMemory: null,
    };

    await persistSceneTransitionMemory({
      db: db as any,
      adventureId: "adv-check",
      transitionMemory,
      continuityState,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "adv-check" },
      data: {
        sceneTransitionMemory: transitionMemory,
        sceneCameraContinuityState: continuityState,
      },
    });
  });

  it("exposes scenePresentation metadata from the helper", () => {
    const turn = makeTurn("presentation", "You inspect the gallery.");
    const state = makeState();
    const presentation = resolveTurnSceneArtPresentation(buildPresentationArgs(turn, state));
    expect(presentation.scenePresentation).not.toBeNull();
    expect(presentation.scenePresentation?.promptFraming?.visualTags).toEqual(presentation.promptFraming?.visualTags);
  });
});
