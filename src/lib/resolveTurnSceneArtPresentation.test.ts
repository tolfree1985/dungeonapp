import { describe, expect, it } from "vitest";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { PlayTurn } from "@/app/play/types";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { buildCanonicalSceneArtPayload } from "@/lib/scene-art/buildCanonicalSceneArtPayload";
import { buildMotifTags } from "@/lib/resolveSceneMotif";
import {
  resolveTurnSceneArtPresentation,
  type PreviousSceneContinuity,
  type ResolveTurnSceneArtPresentationResult,
} from "./resolveTurnSceneArtPresentation";
import { intentVisualTagMap, emphasisTagMap, revealTagMap } from "@/lib/resolveScenePromptFraming";
import { buildThreatFramingTags } from "@/lib/resolveSceneThreatFraming";

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

type PresentationArgOverrides = Partial<
  Omit<Parameters<typeof resolveTurnSceneArtPresentation>[0], "previousSceneContinuity">
> & {
  previousSceneContinuity?: PreviousSceneContinuity | null;
};

function presentationArgs(overrides: PresentationArgOverrides = {}) {
  const turn = overrides.turn ?? makeTurn("base", "You stand in the stone gallery.");
  const state = overrides.state ?? makeState();
  const resolvedSceneState = overrides.resolvedSceneState ?? buildResolvedSceneState(turn, state);
  const previousTurn = overrides.previousTurn ?? turn;
  const previousState = overrides.previousState ?? state;
  const previousComposition = overrides.previousSceneComposition ?? buildSceneComposition(previousTurn, previousState);
  const canonicalPayload = buildCanonicalSceneArtPayload({ turn, state });
  const previousCanonical = buildCanonicalSceneArtPayload({ turn: previousTurn, state: previousState });
  const previousSceneContinuity =
    overrides.previousSceneContinuity ??
    ({
      sceneKey: previousCanonical?.sceneKey ?? null,
      canonicalPayload: previousCanonical ?? null,
      sceneArt: null,
    } as PreviousSceneContinuity);

  
    return {
      turn,
      state,
      resolvedSceneState,
      previousSceneComposition: previousComposition,
      previousSceneArt: overrides.previousSceneArt ?? null,
      previousTransitionMemory: overrides.previousTransitionMemory ?? null,
      pressureStage: resolvedSceneState.visualState.pressureStage,
      modelStatus: overrides.modelStatus ?? "ok",
      tagPolicy: overrides.tagPolicy,
      overrideMotif: overrides.overrideMotif ?? null,
      cameraMemory: overrides.cameraMemory ?? null,
      previousDirectorDecision: overrides.previousDirectorDecision ?? null,
      previousSceneContinuity,
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
      previousSceneContinuity: canonical
        ? {
            sceneKey: canonical.sceneKey,
            canonicalPayload: canonical,
            sceneArt: existingRow,
          }
        : null,
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
      previousSceneContinuity: previousCanonical
        ? {
            sceneKey: previousCanonical.sceneKey,
            canonicalPayload: previousCanonical,
            sceneArt: { sceneKey: previousCanonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" },
          }
        : null,
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
      previousSceneContinuity: previousCanonical
        ? {
            sceneKey: previousCanonical.sceneKey,
            canonicalPayload: previousCanonical,
            sceneArt: { sceneKey: previousCanonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" },
          }
        : null,
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
      previousSceneContinuity: canonical
        ? {
            sceneKey: canonical.sceneKey,
            canonicalPayload: canonical,
            sceneArt: existingRow,
          }
        : null,
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
      previousSceneContinuity: canonical
        ? {
            sceneKey: canonical.sceneKey,
            canonicalPayload: canonical,
            sceneArt: { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" },
          }
        : null,
    });
    const first = resolveTurnSceneArtPresentation(args);
    const second = resolveTurnSceneArtPresentation({
      ...args,
      previousTransitionMemory: { preserveActor: true, preserveFocus: true, preserveFraming: true, preserveSubject: true },
    });
    expect(first.canonicalPayload?.sceneKey).toEqual(second.canonicalPayload?.sceneKey);
  });

  it("surfaces the shot intent tag when threat intent is active", () => {
    const turn = makeTurn("alert", "You face the guard.");
    const state = makeState({ pressureStage: "danger", visibleThreats: [{ id: "guard", label: "Guard" }] });
    const canonical = buildCanonicalSceneArtPayload({ turn, state });
    const args = presentationArgs({
      turn,
      state,
      previousSceneComposition: buildSceneComposition(turn, state),
      previousSceneArt: canonical ? { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" } : null,
      previousSceneContinuity: canonical
        ? {
            sceneKey: canonical.sceneKey,
            canonicalPayload: canonical,
            sceneArt: { sceneKey: canonical.sceneKey, status: "ready" as SceneArtStatus, imageUrl: "/cached.png" },
          }
        : null,
    });
    const result = resolveTurnSceneArtPresentation(args);

    expect(result.shotIntent).toBe("threaten");
    expect(result.shotGrammar?.emphasis).toBe("threat");
    expect(result.promptFraming).not.toBeNull();
    expect(result.promptFraming?.visualTags[0]).toBe("intent-threaten");
    expect(result.promptFraming?.visualTags).toContain("emphasis-threat");
    expect(result.promptFraming?.compositionNotes).toContain("confrontational");
    expect(result.canonicalPayload?.tags).toContain("intent:threaten");
    expect(result.scenePresentation?.motif).toEqual({ tone: "ominous", lighting: "harsh", atmosphere: "smoky" });
  });

  it("propagates deterministic observe tags through the presentation helper", () => {
    const turn = makeTurn("observe", "You study the gallery.");
    const state = makeState();
    const result = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    expect(result.shotIntent).toBe("observe");
    expect(result.shotGrammar).not.toBeNull();
    const grammar = result.shotGrammar!;
    const expectedTags = [
      "intent-observe",
      ...intentVisualTagMap.observe,
      ...emphasisTagMap[grammar.emphasis],
      revealTagMap[grammar.revealLevel],
    ];
    expect(result.promptFraming?.visualTags).toEqual(expectedTags);
    expect(result.scenePresentation?.promptFraming?.visualTags).toEqual(expectedTags);
    expect(result.scenePresentation?.motif).toEqual({ tone: "neutral", lighting: "even", atmosphere: "clear" });
  });

  it("keeps motif metadata deterministic for identical inputs", () => {
    const turn = makeTurn("motif", "You study the gallery.");
    const state = makeState();
    const first = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    const second = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    expect(first.scenePresentation?.motif).toEqual(second.scenePresentation?.motif);
  });

  it("exposes threat framing tags in presentation metadata", () => {
    const turn = makeTurn("threat-tags", "You face the room.");
    const state = makeState({ pressureStage: "tension" });
    const result = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    const tags = buildThreatFramingTags(result.scenePresentation?.threatFraming ?? null);
    expect(result.scenePresentation?.threatFramingTags).toEqual(tags);
  });

  it("keeps sceneKey unchanged when threat tags stay metadata-only", () => {
    const turn = makeTurn("threat-metadata", "You observe quietly.");
    const state = makeState();
    const first = resolveTurnSceneArtPresentation(
      presentationArgs({ turn, state, tagPolicy: { includeThreatFramingInCanonical: false } })
    );
    const second = resolveTurnSceneArtPresentation(
      presentationArgs({ turn, state, tagPolicy: { includeThreatFramingInCanonical: false } })
    );
    expect(first.canonicalPayload?.sceneKey).toEqual(second.canonicalPayload?.sceneKey);
  });

  it("exposes calm threat framing metadata", () => {
    const turn = makeTurn("calm-threat", "You observe the gallery.");
    const state = makeState();
    const result = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    expect(result.scenePresentation?.threatFraming).toEqual({ threatLevel: "none", confrontationBias: "low", subjectDominance: "balanced" });
  });

  it("exposes threat framing when danger escalates", () => {
    const turn = makeTurn("danger-threat", "A guard confronts you.");
    const state = makeState({ pressureStage: "danger", visibleThreats: [{ id: "guard", label: "Guard" }] });
    const resolved = buildResolvedSceneState(turn, state);
    const resolvedPrev = buildSceneComposition(turn, state);
    resolved.focusState = { ...resolved.focusState, focusType: "threat" };
    resolvedPrev.focus = resolved.focusState;
    const result = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn,
        state,
        resolvedSceneState: resolved,
        previousSceneComposition: resolvedPrev,
      })
    );
    expect(result.scenePresentation?.threatFraming).toEqual({ threatLevel: "dominant", confrontationBias: "high", subjectDominance: "threat-favored" });
  });

  it("keeps sceneKey unchanged when motif tags stay metadata-only", () => {
    const turn = makeTurn("metadata", "You survey the gallery.");
    const state = makeState();
    const resultA = resolveTurnSceneArtPresentation(
      presentationArgs({ turn, state, tagPolicy: { includeMotifTagsInCanonical: false } })
    );
    const resultB = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn,
        state,
        tagPolicy: { includeMotifTagsInCanonical: false },
        overrideMotif: { tone: "mysterious", lighting: "glow", atmosphere: "foggy" },
      })
    );
    expect(resultA.canonicalPayload?.sceneKey).toEqual(resultB.canonicalPayload?.sceneKey);
  });

  it("changes sceneKey when motif-derived canonical tags differ", () => {
    const turn = makeTurn("motif-key", "You stand in the gallery.");
    const state = makeState();
    const base = buildCanonicalSceneArtPayload({ turn, state, motifTags: [] });
    const motifTags = buildMotifTags({ tone: "tense", lighting: "dim", atmosphere: "foggy" });
    const withMotif = buildCanonicalSceneArtPayload({ turn, state, motifTags });
    expect(base?.sceneKey).not.toEqual(withMotif?.sceneKey);
  });

  it("keeps prompt framing visual tags stable across identical inputs", () => {
    const turn = makeTurn("steady", "You face the guard.");
    const state = makeState({ pressureStage: "danger", visibleThreats: [{ id: "guard", label: "Guard" }] });
    const first = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));
    const second = resolveTurnSceneArtPresentation(presentationArgs({ turn, state }));

    expect(first.promptFraming?.visualTags).toEqual(second.promptFraming?.visualTags);
  });

  it("keeps sceneKey stable when prompt framing metadata differs but canonical tags stay the same", () => {
    const baseTurn = makeTurn("inspect", "You inspect the gallery.");
    const detailTurn = { ...baseTurn, intentJson: { mode: "LOOK" } };
    const state = makeState();
    const baseResult = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn: baseTurn,
        state,
        previousTurn: baseTurn,
        previousState: state,
        previousSceneComposition: buildSceneComposition(baseTurn, state),
      })
    );
    const detailResult = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn: detailTurn,
        state,
        previousTurn: detailTurn,
        previousState: state,
        previousSceneComposition: buildSceneComposition(detailTurn, state),
      })
    );

    expect(baseResult.canonicalPayload?.sceneKey).toEqual(detailResult.canonicalPayload?.sceneKey);
    expect(baseResult.promptFraming).not.toBeNull();
    expect(detailResult.promptFraming).not.toBeNull();
  });

  it("updates sceneKey when canonical tags change", () => {
    const turn = makeTurn("pressure", "You stand in the stone gallery.");
    const tensionState = makeState({ pressureStage: "tension" });
    const dangerState = makeState({ pressureStage: "danger" });
    const tensionResult = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn,
        state: tensionState,
        previousTurn: turn,
        previousState: tensionState,
        previousSceneComposition: buildSceneComposition(turn, tensionState),
      })
    );
    const dangerResult = resolveTurnSceneArtPresentation(
      presentationArgs({
        turn,
        state: dangerState,
        previousTurn: turn,
        previousState: dangerState,
        previousSceneComposition: buildSceneComposition(turn, dangerState),
      })
    );

    expect(tensionResult.canonicalPayload?.sceneKey).not.toEqual(dangerResult.canonicalPayload?.sceneKey);
  });

  it("changes sceneKey when threat framing tags are enabled", () => {
    const turn = makeTurn("threat-canonical", "You face the guard.");
    const state = makeState({ pressureStage: "danger", visibleThreats: [{ id: "guard", label: "Guard" }] });
    const base = resolveTurnSceneArtPresentation(
      presentationArgs({ turn, state, tagPolicy: { includeThreatFramingInCanonical: false } })
    );
    const withThreat = resolveTurnSceneArtPresentation(
      presentationArgs({ turn, state, tagPolicy: { includeThreatFramingInCanonical: true } })
    );
    expect(base.canonicalPayload?.sceneKey).not.toEqual(withThreat.canonicalPayload?.sceneKey);
  });

  it("publishes director decision metadata on the presentation", () => {
    const args = presentationArgs();
    const result = resolveTurnSceneArtPresentation(args);
    const director = result.scenePresentation?.directorDecision;
    expect(director).toBeDefined();
    expect(director?.emphasis).toBe(result.scenePresentation?.shotIntent);
    expect(director?.shotScale).toBe(args.resolvedSceneState.framingState.shotScale);
    expect(director?.cameraAngle).toBe("eye");
    expect(director?.focusSubject).toBe("object");
    expect(director?.compositionBias).toBe(result.scenePresentation?.compositionBias?.balance ?? "centered");
  });
});
