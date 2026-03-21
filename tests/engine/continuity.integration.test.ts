import { describe, expect, it, vi } from "vitest";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import { finalizeContinuityInfo, assertContinuityReady } from "@/server/scene/continuity";
import { buildSceneKey } from "@/server/scene/scene-identity";

const baseSceneIdentityA = {
  locationKey: "hallway",
  focalActorKey: "guard-1",
  objectiveKey: "investigate",
  encounterPhase: "investigation" as const,
};
const baseSceneIdentityB = {
  locationKey: "courtyard",
  focalActorKey: "patrol",
  objectiveKey: "escape",
  encounterPhase: "conflict" as const,
};
const identityKeyA = buildSceneKey(baseSceneIdentityA);
const identityKeyB = buildSceneKey(baseSceneIdentityB);

type PersistedTurn = {
  turnIndex: number;
  continuityInfo: SceneContinuityInfo;
};

type PreviousTurnLog = {
  turnIndex: number;
  previousTurnFound: boolean;
  previousTurnHasContinuityInfo: boolean;
  hydratedPreviousSceneKey: string | null;
  hydratedPreviousIdentityKey: string | null;
};

const makeCandidate = (overrides: Partial<SceneContinuityInfo> = {}): SceneContinuityInfo => ({
  sceneKey: "scene-A",
  identityKey: overrides.identityKey ?? identityKeyA,
  previousSceneKey: null,
  previousSceneArtKeyMismatch: false,
  deltaKind: "full",
  renderPlan: "queue-full-render",
  continuityReason: "FULL_RENDER_REQUIRED",
  continuityBucket: "degraded",
  shotKey: "shot-bootstrap",
  previousShotKey: null,
  shotDuration: 1,
  reuseRate: 0,
  ...overrides,
});

function createTurnPersistor() {
  const persistedTurns: PersistedTurn[] = [];
  const previousLogs: PreviousTurnLog[] = [];

    const logPreviousTurn = (turnIndex: number, previousContinuity: SceneContinuityInfo | null) => {
      previousLogs.push({
        turnIndex,
        previousTurnFound: previousContinuity !== null,
        previousTurnHasContinuityInfo: Boolean(previousContinuity),
        hydratedPreviousSceneKey: previousContinuity?.sceneKey ?? null,
        hydratedPreviousIdentityKey: previousContinuity?.identityKey ?? null,
      });
    };

  const persistTurn = (params: {
    turnIndex: number;
    correctedSceneKey: string;
    identityKey: string;
    candidateContinuity: SceneContinuityInfo | null;
  }) => {
    const previousTurn = persistedTurns.find((entry) => entry.turnIndex === params.turnIndex - 1) ?? null;
    const previousContinuity = previousTurn?.continuityInfo ?? null;
    logPreviousTurn(params.turnIndex, previousContinuity);
    const finalContinuity = finalizeContinuityInfo({
      candidate: params.candidateContinuity,
      correctedSceneKey: params.correctedSceneKey,
      identityKey: params.identityKey,
      previous: previousContinuity,
      turnIndex: params.turnIndex,
    });
    assertContinuityReady({ continuityInfo: finalContinuity, turnIndex: params.turnIndex });
    persistedTurns.push({ turnIndex: params.turnIndex, continuityInfo: finalContinuity });
    return finalContinuity;
  };

  return { persistedTurns, previousLogs, persistTurn };
}

describe("Turn continuity integration", () => {
  it("persists continuity across a legacy fallback turn and hydrates it on the follow-up", () => {
    const { persistedTurns, previousLogs, persistTurn } = createTurnPersistor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bootstrap = persistTurn({
        turnIndex: 0,
        correctedSceneKey: "scene-A",
        identityKey: identityKeyA,
        candidateContinuity: makeCandidate(),
      });
      expect(bootstrap.previousSceneKey).toBeNull();
      expect(persistedTurns.find((entry) => entry.turnIndex === 0)?.continuityInfo).toBe(bootstrap);

      const firstSameScene = persistTurn({
        turnIndex: 1,
        correctedSceneKey: "scene-A",
        identityKey: identityKeyA,
        candidateContinuity: makeCandidate({
          sceneKey: "scene-wrong",
          previousSceneKey: "scene-A",
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-1",
          shotDuration: 2,
          reuseRate: 1,
        }),
      });
      expect(firstSameScene.sceneKey).toBe("scene-A");
      expect(firstSameScene.previousSceneKey).toBe("scene-A");
      expect(persistedTurns.find((entry) => entry.turnIndex === 1)?.continuityInfo).toBe(firstSameScene);

      const legacyFallback = persistTurn({
        turnIndex: 2,
        correctedSceneKey: "scene-A",
        identityKey: identityKeyA,
        candidateContinuity: null,
      });
      expect(legacyFallback).toBeDefined();
      expect(legacyFallback.deltaKind).toBe("none");
      expect(legacyFallback.renderPlan).toBe("reuse-current");
      expect(legacyFallback.sceneKey).toBe("scene-A");
      expect(legacyFallback.previousSceneKey).toBe("scene-A");
      expect(persistedTurns.find((entry) => entry.turnIndex === 2)?.continuityInfo).toBe(legacyFallback);

      const followUp = persistTurn({
        turnIndex: 3,
        correctedSceneKey: "scene-A",
        identityKey: identityKeyA,
        candidateContinuity: makeCandidate({
          previousSceneKey: "scene-A",
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-3",
          shotDuration: 3,
        }),
      });
      expect(previousLogs.find((log) => log.turnIndex === 3)?.previousTurnHasContinuityInfo).toBe(true);
      expect(previousLogs.find((log) => log.turnIndex === 3)?.hydratedPreviousSceneKey).toBe("scene-A");
      expect(followUp.deltaKind).toBe("none");
      expect(followUp.renderPlan).toBe("reuse-current");
      expect(followUp.sceneKey).toBe("scene-A");
      expect(persistedTurns.find((entry) => entry.turnIndex === 3)?.continuityInfo.previousSceneKey).toBe(
        "scene-A",
      );
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("keeps detail-only continuity holds on reuse decisions", () => {
    const { persistedTurns, previousLogs, persistTurn } = createTurnPersistor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      persistTurn({
        turnIndex: 0,
        correctedSceneKey: "scene-A",
        candidateContinuity: makeCandidate(),
      });
      const detailHold1 = persistTurn({
        turnIndex: 1,
        correctedSceneKey: "scene-A",
        candidateContinuity: makeCandidate({
          previousSceneKey: "scene-A",
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-detail-1",
          shotDuration: 2,
        }),
      });
      const detailHold2 = persistTurn({
        turnIndex: 2,
        correctedSceneKey: "scene-A",
        candidateContinuity: makeCandidate({
          previousSceneKey: "scene-A",
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-detail-2",
          shotDuration: 3,
        }),
      });
      expect(detailHold1.deltaKind).toBe("none");
      expect(detailHold1.renderPlan).toBe("reuse-current");
      expect(detailHold2.deltaKind).toBe("none");
      expect(detailHold2.renderPlan).toBe("reuse-current");
      expect(previousLogs.find((log) => log.turnIndex === 2)?.previousTurnHasContinuityInfo).toBe(true);
      expect(previousLogs.find((log) => log.turnIndex === 2)?.hydratedPreviousSceneKey).toBe("scene-A");
      expect(persistedTurns.find((entry) => entry.turnIndex === 2)?.continuityInfo).toBe(detailHold2);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("keeps legacy continuity alive while resetting on a full identity scene change", () => {
    const { persistedTurns, previousLogs, persistTurn } = createTurnPersistor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const canonicalSceneKeyA = identityKeyA;
    const canonicalSceneKeyB = identityKeyB;
    try {
      const bootstrap = persistTurn({
        turnIndex: 0,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeCandidate({
          identityKey: canonicalSceneKeyA,
          sceneKey: "bootstrap",
          shotKey: "shot-bootstrap",
          shotDuration: 1,
          deltaKind: "full",
          renderPlan: "queue-full-render",
        }),
      });
      expect(bootstrap.sceneKey).toBe(canonicalSceneKeyA);
      expect(bootstrap.previousSceneKey).toBeNull();

      const firstHold = persistTurn({
        turnIndex: 1,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeCandidate({
          previousSceneKey: canonicalSceneKeyA,
          deltaKind: "none",
          renderPlan: "reuse-current",
          shotKey: "shot-1",
          shotDuration: 2,
          identityKey: canonicalSceneKeyA,
        }),
      });
      expect(firstHold.sceneKey).toBe(canonicalSceneKeyA);
      expect(firstHold.renderPlan).toBe("reuse-current");

      const legacyFallback = persistTurn({
        turnIndex: 2,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: null,
      });
      expect(legacyFallback).toBeDefined();
      expect(legacyFallback.sceneKey).toBe(canonicalSceneKeyA);
      expect(legacyFallback.deltaKind).toBe("none");
      expect(legacyFallback.renderPlan).toBe("reuse-current");
      expect(legacyFallback.previousSceneKey).toBe(canonicalSceneKeyA);

      const followUp = persistTurn({
        turnIndex: 3,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeCandidate({
          previousSceneKey: canonicalSceneKeyA,
          deltaKind: "none",
          renderPlan: "reuse-current",
          shotKey: "shot-3",
          shotDuration: 3,
          identityKey: canonicalSceneKeyA,
        }),
      });
      const logForTurn3 = previousLogs.find((entry) => entry.turnIndex === 3);
      expect(logForTurn3?.previousTurnHasContinuityInfo).toBe(true);
      expect(logForTurn3?.hydratedPreviousSceneKey).toBe(
        persistedTurns.find((entry) => entry.turnIndex === 2)?.continuityInfo.sceneKey,
      );
      expect(followUp.renderPlan).toBe("reuse-current");
      expect(followUp.deltaKind).toBe("none");
      expect(followUp.sceneKey).toBe(canonicalSceneKeyA);

      expect(persistedTurns.find((entry) => entry.turnIndex === 1)?.continuityInfo).toBe(firstHold);
      expect(persistedTurns.find((entry) => entry.turnIndex === 2)?.continuityInfo).toBe(legacyFallback);
      expect(persistedTurns.find((entry) => entry.turnIndex === 3)?.continuityInfo).toBe(followUp);
      expect(previousLogs.find((entry) => entry.turnIndex === 2)?.previousTurnHasContinuityInfo).toBe(true);
      expect(previousLogs.find((entry) => entry.turnIndex === 2)?.hydratedPreviousSceneKey).toBe(
        canonicalSceneKeyA,
      );

      const newSceneChange = persistTurn({
        turnIndex: 4,
        correctedSceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        candidateContinuity: null,
      });
      expect(newSceneChange.sceneKey).toBe(canonicalSceneKeyB);
      expect(newSceneChange.previousSceneKey).toBe(canonicalSceneKeyA);
      expect(newSceneChange.deltaKind).toBe("full");
      expect(newSceneChange.renderPlan).toBe("queue-full-render");
      expect(newSceneChange.shotDuration).toBe(1);

      const newSceneHold = persistTurn({
        turnIndex: 5,
        correctedSceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        candidateContinuity: makeCandidate({
          previousSceneKey: canonicalSceneKeyB,
          deltaKind: "none",
          renderPlan: "reuse-current",
          shotKey: "shot-5",
          shotDuration: 2,
          identityKey: canonicalSceneKeyB,
        }),
      });
      expect(newSceneHold.previousSceneKey).toBe(canonicalSceneKeyB);
      expect(newSceneHold.deltaKind).toBe("none");
      expect(newSceneHold.renderPlan).toBe("reuse-current");
      expect(previousLogs.find((entry) => entry.turnIndex === 5)?.hydratedPreviousSceneKey).toBe(
        canonicalSceneKeyB,
      );
      expect(warnSpy).not.toHaveBeenCalled();

      [1, 2, 3].forEach((index) => {
        expect(persistedTurns.find((entry) => entry.turnIndex === index)?.continuityInfo.sceneKey).toBe(
          canonicalSceneKeyA,
        );
      });
      expect(persistedTurns.find((entry) => entry.turnIndex === 4)?.continuityInfo.sceneKey).toBe(
        canonicalSceneKeyB,
      );
      expect(persistedTurns.find((entry) => entry.turnIndex === 5)?.continuityInfo.sceneKey).toBe(
        canonicalSceneKeyB,
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
