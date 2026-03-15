import { describe, expect, it } from "vitest";
import { SceneArtStatus } from "@/generated/prisma";
import type { PlayTurn } from "@/app/play/types";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import {
  resolveTurnSceneArtPresentation,
  type ResolveTurnSceneArtPresentationResult,
} from "./resolveTurnSceneArtPresentation";

type SceneStateRecord = Record<string, unknown> | null;

function makeTurn(id: string, scene: string): PlayTurn {
  return {
    id,
    turnIndex: 0,
    playerInput: "look",
    scene,
    resolution: "ok",
    stateDeltas: [],
    ledgerAdds: [],
    createdAt: new Date().toISOString(),
  };
}

function makeState(overrides: Record<string, unknown> = {}): SceneStateRecord {
  return {
    location: "stone gallery",
    pressureStage: "tension",
    timeOfDay: "night",
    stats: { heat: 2, noise: 0, alert: 1, location: "stone gallery" },
    visibleDetails: [{ id: "loose-stone", label: "Loose Stone" }],
    ...overrides,
  };
}

function buildResolvedSceneState(turn: PlayTurn, state: SceneStateRecord) {
  const visual = resolveSceneVisualState(state);
  const framing = resolveSceneFramingState({ turn, visual, locationChanged: false });
  const subject = resolveSceneSubjectState({ state, framing });
  const actor = resolveSceneActorState({ state, subject });
  const focus = resolveSceneFocusState({ state, framing, subject, actor });
  return { visualState: visual, framingState: framing, subjectState: subject, actorState: actor, focusState: focus };
}

function buildSceneComposition(turn: PlayTurn, state: SceneStateRecord) {
  const resolved = buildResolvedSceneState(turn, state);
  return {
    visual: resolved.visualState,
    framing: resolved.framingState,
    subject: resolved.subjectState,
    actor: resolved.actorState,
    focus: resolved.focusState,
  };
}

function presentationArgs(overrides: Partial<Parameters<typeof resolveTurnSceneArtPresentation>[0]> = {}) {
  const turn = overrides.turn ?? makeTurn("base", "You stand in the stone gallery.");
  const state = overrides.state ?? makeState();
  const resolvedSceneState = overrides.resolvedSceneState ?? buildResolvedSceneState(turn, state);
  const previousTurn = overrides.previousTurn ?? turn;
  const previousState = overrides.previousState ?? state;
  const previousComposition = overrides.previousSceneComposition ?? buildSceneComposition(previousTurn, previousState);
  const canonicalPayload = buildCanonicalSceneArtPayload({ turn, state });
  const previousSceneKey = overrides.previousSceneKey ?? canonicalPayload?.sceneKey ?? null;


  return {
    turn,
    state,
    resolvedSceneState,
    previousSceneComposition: previousComposition,
    previousSceneArt: overrides.previousSceneArt ?? null,
    previousSceneArtForPreviousKey: overrides.previousSceneArtForPreviousKey ?? null,
    previousTransitionMemory: overrides.previousTransitionMemory ?? null,
    previousSceneKey,
    pressureStage: resolvedSceneState.visualState.pressureStage,
    modelStatus: overrides.modelStatus ?? "ok",
  };
}

describe("resolveTurnSceneArtPresentation", () => {
  it("handles hold scenarios without queuing", () => {
    const turn = makeTurn("hold", "You stand in the stone gallery.");
    const state = makeState();
    const canonical = buildCanonicalSceneArtPayload({ turn, state });
    const existingRow = canonical
      ? { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
      : null;
    const args = presentationArgs({
      turn,
      state,
      previousTurn: turn,
      previousState: state,
      previousSceneArt: existingRow,
      previousSceneArtForPreviousKey: existingRow,
      previousSceneKey: canonical?.sceneKey ?? null,
    });
    const result = resolveTurnSceneArtPresentation(args);

    expect(result.sceneTransition?.type).toEqual("hold");
    expect(result.sceneTransition?.preserveFocus).toBe(true);
    expect(result.refreshDecision?.shouldQueueRender).toBe(false);
    expect(result.sceneArtResult?.status).toBe("ready");
    expect(result.shouldCreateSceneArt).toBe(false);
  });

  it("queues a new render for advance when focus shifts", () => {
    const previousTurn = makeTurn("prev", "You stand in the stone gallery.");
    const previousState = makeState();
    const previousCanonical = buildCanonicalSceneArtPayload({ turn: previousTurn, state: previousState });
    const currentTurn = makeTurn("advance", "You stand in the stone gallery.");
    const currentState = makeState({ visibleDetails: [{ id: "glow", label: "Glowing Shard" }] });
    const args = presentationArgs({
      turn: currentTurn,
      state: currentState,
      previousTurn,
      previousState,
      previousSceneArt: null,
      previousSceneArtForPreviousKey: previousCanonical
        ? { sceneKey: previousCanonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
        : null,
      previousSceneKey: previousCanonical?.sceneKey ?? null,
    });
    const result = resolveTurnSceneArtPresentation(args);

    expect(result.sceneTransition?.type).toEqual("advance");
    expect(result.sceneTransition?.preserveFocus).toBe(false);
    expect(result.refreshDecision?.shouldQueueRender).toBe(true);
    expect(result.refreshDecision?.shouldSwapImmediatelyWhenReady).toBe(false);
    expect(result.sceneArtResult?.status).toBe("queued");
    expect(result.shouldCreateSceneArt).toBe(true);
  });

  it("cuts when framing or location changes", () => {
    const previousTurn = makeTurn("prev", "You stand in the stone gallery.");
    const previousState = makeState();
    const previousCanonical = buildCanonicalSceneArtPayload({ turn: previousTurn, state: previousState });
    const cuttingTurn = makeTurn("cut", "You enter the attic.");
    const cuttingState = makeState({
      location: "attic",
      stats: { heat: 3, noise: 1, alert: 3, location: "attic" },
    });
    const args = presentationArgs({
      turn: cuttingTurn,
      state: cuttingState,
      previousTurn,
      previousState,
      previousSceneArt: null,
      previousSceneArtForPreviousKey: previousCanonical
        ? { sceneKey: previousCanonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
        : null,
      previousSceneKey: previousCanonical?.sceneKey ?? null,
    });
    const result = resolveTurnSceneArtPresentation(args);

    expect(result.sceneTransition?.type).toEqual("cut");
    expect(result.refreshDecision?.shouldQueueRender).toBe(true);
    expect(result.refreshDecision?.shouldSwapImmediatelyWhenReady).toBe(true);
    expect(result.shouldCreateSceneArt).toBe(true);
  });

  it("maintains parity for MODEL_ERROR responses", () => {
    const turn = makeTurn("model-error", "You stand in the stone gallery.");
    const state = makeState();
    const canonical = buildCanonicalSceneArtPayload({ turn, state });
    const existingRow = canonical
      ? { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
      : null;
    const args = presentationArgs({
      turn,
      state,
      previousTurn: turn,
      previousState: state,
      previousSceneArt: existingRow,
      previousSceneArtForPreviousKey: existingRow,
      previousSceneKey: canonical?.sceneKey ?? null,
      modelStatus: "MODEL_ERROR",
    });
    const result = resolveTurnSceneArtPresentation(args);

    expect(result.sceneArtResult).not.toBeNull();
    expect(result.sceneTransition?.type).toEqual("hold");
    expect(result.refreshDecision?.shouldQueueRender).toBe(false);
  });

  it("keeps the canonical key stable regardless of transition memory inputs", () => {
    const turn = makeTurn("invariant", "You stand in the stone gallery.");
    const state = makeState();
    const canonical = buildCanonicalSceneArtPayload({ turn, state });
    const args = presentationArgs({
      turn,
      state,
      previousTurn: turn,
      previousState: state,
      previousSceneArt: canonical
        ? { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
        : null,
      previousSceneArtForPreviousKey: canonical
        ? { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" }
        : null,
      previousSceneKey: canonical?.sceneKey ?? null,
    });
    const first = resolveTurnSceneArtPresentation(args);
    const second = resolveTurnSceneArtPresentation({
      ...args,
      previousTransitionMemory: { preserveActor: true, preserveFocus: true, preserveFraming: true, preserveSubject: true },
    });
    expect(first.canonicalPayload?.sceneKey).toEqual(second.canonicalPayload?.sceneKey);
  });
});
