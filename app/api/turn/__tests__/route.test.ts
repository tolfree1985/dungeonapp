import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { SceneArtPayload } from "@/lib/sceneArt";
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
    previousSceneArtForPreviousKey: null,
    previousTransitionMemory: null,
    previousSceneKey: null,
    pressureStage: visual.pressureStage,
    modelStatus: "ok",
  };
}

describe("POST /api/turn helpers", () => {
  const payload: SceneArtPayload = {
    sceneKey: "scene-test-key",
    basePrompt: "test prompt",
    renderPrompt: "test render",
    stylePreset: "victorian-gothic-cinematic",
    tags: [],
  };

  it("queues when the refresh decision requests a render", async () => {
    const queueSceneArt = vi.fn().mockResolvedValue({ status: "queued", imageUrl: "/queued.png" });
    const refreshDecision: SceneRefreshDecision = {
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: false,
    };

    const result = await orchestrateLegacySceneArtDecision({
      sceneArtPayload: payload,
      refreshDecision,
      existingSceneArt: null,
      queueSceneArt,
    });

    expect(queueSceneArt).toHaveBeenCalledWith(payload, ENGINE_VERSION, "normal");
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
    const continuityState: SceneCameraContinuityState = { consecutiveAdvances: 2 };

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
