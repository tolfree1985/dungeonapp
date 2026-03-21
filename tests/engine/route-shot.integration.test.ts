import { describe, expect, it, vi } from "vitest";
import { buildSceneKey, decideSceneDeltaKind, type SceneIdentity } from "@/server/scene/scene-identity";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import { finalizeContinuityInfo, assertContinuityReady } from "@/server/scene/continuity";
import type {
  SceneCameraContinuityState,
  SceneCameraMemory,
} from "@/lib/sceneTypes";
import { EMPTY_SCENE_TRANSITION_MEMORY, INITIAL_SCENE_CAMERA_CONTINUITY } from "@/lib/sceneTypes";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import { applyShotTransitionRules } from "@/server/scene/shot-transition";
import {
  buildSceneTransitionLedgerEntry,
  describeSceneIdentityChanges,
} from "@/server/scene/scene-identity-ledger";
import {
  describeScenePressureChange,
  describeFailForwardSignal,
} from "@/server/scene/scene-transition-pressure";
import { resolveFailForwardComplication } from "@/server/scene/fail-forward-complication";
import { resolveFailForwardStateDelta } from "@/server/scene/fail-forward-state-delta";
import { resolveSceneClockPressure } from "@/server/scene/scene-clock-pressure";
import { resolveOpportunityWindow } from "@/lib/opportunity-window";
import { resolveOpportunityResolutionModifier } from "@/lib/opportunity-resolution-modifier";
import { resolveOpportunityCost } from "@/lib/opportunity-cost";
import { resolveOpportunityCostEffect } from "@/server/scene/opportunity-cost-effects";
import { resolveResolutionCostEffect } from "@/server/scene/resolution-cost-effects";
import { resolveComplicationOutcomeEffect } from "@/server/scene/complication-outcome-effects";
import { resolveFinalizedComplications } from "@/server/scene/complication-selection";
import { resolveFinalizedComplicationDeltas } from "@/server/scene/finalized-complication-deltas";
import type { FinalizedComplication } from "@/server/scene/complication-selection";
import { resolveNpcSuspicionStance } from "@/server/scene/npc-suspicion-stance";
import { resolveNpcWatchfulness } from "@/server/scene/npc-watchfulness";
import type { NpcWatchfulnessLevel } from "@/server/scene/npc-watchfulness";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import { ActionConstraints, combineActionConstraints } from "@/lib/action-constraints";
import { resolveNoiseActionFlags } from "@/lib/noise-action-flags";
import type { NoiseActionFlags } from "@/lib/noise-action-flags";
import { resolvePositionActionFlags } from "@/lib/position-action-flags";
import { resolveActionConstraintPressure } from "@/server/scene/action-constraint-pressure";
import { resolveActionRisk } from "@/server/scene/action-risk";
import { resolveComplicationWeight } from "@/server/scene/complication-weight";
import { resolveComplicationTier } from "@/server/scene/complication-tier";
import { resolveComplicationSelectionPolicy } from "@/server/scene/complication-selection-policy";
import { enforceComplicationPolicy } from "@/server/scene/enforce-complication-policy";
import {
  resolveWatchfulnessActionFlags,
  type IntentMode,
  type WatchfulnessLevel,
} from "@/lib/watchfulness-action-flags";
import { resolveConsequenceBudget } from "@/server/scene/consequence-budget";
import { buildConsequenceBundle, type ConsequenceEntry } from "@/server/scene/consequence-bundle";
import { resolveOutcomeSeverity } from "@/server/scene/outcome-severity";
import { buildFinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";
import type { PlayTurn } from "@/app/play/types";
import { buildPlayTurnPresentation } from "@/app/play/normalizeTurnPresentation";

const baseSceneIdentityA: SceneIdentity = {
  locationKey: "gallery",
  focalActorKey: "guard",
  objectiveKey: "investigate",
  encounterPhase: "conversation",
};

const partialSceneIdentityA: SceneIdentity = {
  ...baseSceneIdentityA,
  encounterPhase: "conflict",
};

const conflictSceneIdentityB: SceneIdentity = {
  locationKey: "courtyard",
  focalActorKey: "patrol",
  objectiveKey: "escape",
  encounterPhase: "conflict",
};

const conflictSceneIdentityC: SceneIdentity = {
  locationKey: "stables",
  focalActorKey: "patrol",
  objectiveKey: "escape",
  encounterPhase: "conflict",
};

const aftermathSceneIdentity: SceneIdentity = {
  locationKey: "stables",
  focalActorKey: "patrol",
  objectiveKey: "escape",
  encounterPhase: "aftermath",
};

const cameraMemoryShort: SceneCameraMemory = {
  shotScale: "wide",
  cameraAngle: "eye",
  frameKind: "static",
  subjectFocus: "environment",
};

const cameraMemoryLong: SceneCameraMemory = {
  shotScale: "medium",
  cameraAngle: "eye",
  frameKind: "static",
  subjectFocus: "actor",
};

const cameraMemoryPartial: SceneCameraMemory = {
  shotScale: "medium",
  cameraAngle: "low",
  frameKind: "static",
  subjectFocus: "actor",
};

const cameraMemoryNewScene: SceneCameraMemory = {
  shotScale: "wide",
  cameraAngle: "high",
  frameKind: "static",
  subjectFocus: "environment",
};

const canonicalSceneKeyA = buildSceneKey(baseSceneIdentityA);
const canonicalSceneKeyB = buildSceneKey(conflictSceneIdentityB);

const makeSceneCandidate = (overrides: Partial<SceneContinuityInfo> = {}): SceneContinuityInfo => ({
  sceneKey: canonicalSceneKeyA,
  identityKey: canonicalSceneKeyA,
  previousSceneKey: null,
  previousSceneArtKeyMismatch: false,
  deltaKind: "full",
  renderPlan: "queue-full-render",
  continuityReason: "FULL_RENDER_REQUIRED",
  continuityBucket: "degraded",
  shotKey: "shot-default",
  previousShotKey: null,
  shotDuration: 1,
  reuseRate: 0,
  ...overrides,
});

type PersistedContinuityTurn = {
  turnIndex: number;
  continuityInfo: SceneContinuityInfo;
};

type PreviousContinuityLog = {
  turnIndex: number;
  previousTurnFound: boolean;
  previousTurnHasContinuityInfo: boolean;
  hydratedPreviousSceneKey: string | null;
};

function createContinuityPersistor() {
  const persistedTurns: PersistedContinuityTurn[] = [];
  const previousLogs: PreviousContinuityLog[] = [];

  const logPreviousTurn = (turnIndex: number, previousContinuity: SceneContinuityInfo | null) => {
    previousLogs.push({
      turnIndex,
      previousTurnFound: Boolean(previousContinuity),
      previousTurnHasContinuityInfo: Boolean(previousContinuity),
      hydratedPreviousSceneKey: previousContinuity?.sceneKey ?? null,
    });
  };

  const persistTurn = (params: {
    turnIndex: number;
    correctedSceneKey: string;
    identityKey: string;
    candidateContinuity: SceneContinuityInfo | null;
  }): SceneContinuityInfo => {
    const previousEntry = persistedTurns.find((entry) => entry.turnIndex === params.turnIndex - 1) ?? null;
    const previousContinuity = previousEntry?.continuityInfo ?? null;
    logPreviousTurn(params.turnIndex, previousContinuity);
    const continuityInfo = finalizeContinuityInfo({
      candidate: params.candidateContinuity,
      correctedSceneKey: params.correctedSceneKey,
      identityKey: params.identityKey,
      previous: previousContinuity,
      turnIndex: params.turnIndex,
    });
    assertContinuityReady({ continuityInfo, turnIndex: params.turnIndex });
    persistedTurns.push({
      turnIndex: params.turnIndex,
      sceneKey: params.correctedSceneKey,
      continuityInfo,
    });
    return continuityInfo;
  };

  return { persistedTurns, previousLogs, persistTurn };
}

type PersistedContinuityTurn = {
  turnIndex: number;
  sceneKey: string;
  continuityInfo: SceneContinuityInfo;
};

const cameraMemoryNewHold: SceneCameraMemory = {
  shotScale: "close",
  cameraAngle: "eye",
  frameKind: "static",
  subjectFocus: "object",
};

describe("route shot flow", () => {
  it("wires identity → continuity → shots across a multi-turn sequence", () => {
    const sequence: Array<{
      name: string;
      identity: SceneIdentity;
      minutesElapsed: number;
      shotDuration: number;
      nextCameraMemory: SceneCameraMemory;
      mode: IntentMode;
    }> = [
      {
        name: "bootstrap",
        identity: baseSceneIdentityA,
        minutesElapsed: 0,
        shotDuration: 1,
        nextCameraMemory: cameraMemoryShort,
        mode: "DO",
      },
      {
        name: "short hold",
        identity: baseSceneIdentityA,
        minutesElapsed: 0,
        shotDuration: 1,
        nextCameraMemory: cameraMemoryShort,
        mode: "DO",
      },
      {
        name: "long hold",
        identity: baseSceneIdentityA,
        minutesElapsed: 0,
        shotDuration: 4,
        nextCameraMemory: cameraMemoryLong,
        mode: "DO",
      },
      {
        name: "partial shift",
        identity: partialSceneIdentityA,
        minutesElapsed: 5,
        shotDuration: 3,
        nextCameraMemory: cameraMemoryPartial,
        mode: "DO",
      },
      {
        name: "conflict move 1",
        identity: conflictSceneIdentityB,
        minutesElapsed: 0,
        shotDuration: 1,
        nextCameraMemory: cameraMemoryNewScene,
        mode: "DO",
      },
      {
        name: "conflict move 2",
        identity: conflictSceneIdentityC,
        minutesElapsed: 0,
        shotDuration: 1,
        nextCameraMemory: cameraMemoryNewScene,
        mode: "DO",
      },
      {
        name: "aftermath hold",
        identity: aftermathSceneIdentity,
        minutesElapsed: 0,
        shotDuration: 2,
        nextCameraMemory: cameraMemoryNewHold,
        mode: "DO",
      },
    ];

    let previousContinuity: SceneContinuityInfo | null = null;
    let previousIdentity: SceneIdentity | null = null;
    let previousIdentityKey: string | null = null;
    let transitionMemory = EMPTY_SCENE_TRANSITION_MEMORY;
    let continuityState: SceneCameraContinuityState = INITIAL_SCENE_CAMERA_CONTINUITY;

    const snapshots: Array<{
      name: string;
      continuity: SceneContinuityInfo;
      transitionMemory: typeof transitionMemory;
      continuityState: SceneCameraContinuityState;
      effectiveDelta: SceneDeltaKind;
      finalizedDelta: SceneDeltaKind;
      sameScene: boolean;
      renderPlan: string;
      effectSummaries: FinalizedEffectSummary[];
    }> = [];
    const ledgerEntries: Array<{ name: string; index: number; entry: Record<string, unknown> }> = [];
    const persistedRecords: Array<{
      turnIndex: number;
      failForwardComplication: string | null;
      opportunityResolutionModifier?: string | null;
      opportunityCost?: string | null;
      opportunityCostEffect?: { riskLevelDelta: number; costBudgetDelta: number } | null;
      resolutionCostEffect?: boolean;
      complicationRisk?: boolean;
      complicationOutcome?: boolean;
      finalizedComplications?: string[];
      complicationApplied?: boolean;
      finalizedComplicationDeltas?: Record<string, number>;
      complicationDeltaApplied?: boolean;
      npcStance?: string;
      watchfulnessActionFlags?: WatchfulnessActionFlags;
      positionActionFlags?: PositionActionFlags;
      noiseActionFlags?: NoiseActionFlags;
      actionConstraints?: ActionConstraints;
      constraintPressure?: number;
      constraintPressureActive?: string[];
      actionRiskDelta?: number;
      actionRiskTier?: "none" | "elevated" | "high";
      intentMode: IntentMode;
      complicationWeightDelta?: number;
      complicationTier?: "none" | "light" | "heavy";
      forcedComplicationCount?: number;
      complicationPolicyApplied?: boolean;
      outcomeSeverity?: "normal" | "strained" | "harsh";
      consequenceBudgetExtraCostCount?: number;
      consequenceComplicationEntries?: ConsequenceEntry[];
      consequenceExtraCostEntries?: ConsequenceEntry[];
      consequenceNarration?: { headline: string; lines: string[] };
      state: Record<string, number>;
    }> = [];
    const simulatedState = {
      pressure: 0,
      noise: 0,
      positionPenalty: 0,
      timeAdvance: 0,
      npcSuspicion: 0,
      sceneClock: 0,
      opportunityTier: "normal" as "normal" | "reduced",
      opportunityWindowNarrowed: false,
      riskLevel: 0,
      costBudget: 0,
    resolutionCost: 0,
  };
  let simulatedWatchfulness: NpcWatchfulnessLevel = "normal";
  let simulatedPressure = 0;
  simulatedState.noise = 2;

    sequence.forEach((turn, index) => {
      const currentIdentityKey = buildSceneKey(turn.identity);
      const previousNoise = simulatedState.noise;
      const previousNoiseActionFlags = resolveNoiseActionFlags(previousNoise);
      const derivedDelta = decideSceneDeltaKind({
        previous: previousIdentity,
        current: turn.identity,
        minutesElapsed: turn.minutesElapsed,
        detailOnlyChange: false,
      });
      const sameScene = previousIdentityKey !== null && previousIdentityKey === currentIdentityKey;
      const renderPlan = sameScene ? "reuse-current" : "queue-full-render";
      const effectiveDelta = (sameScene && renderPlan === "reuse-current" ? "none" : derivedDelta) as SceneDeltaKind;
      const shotAdjustment = applyShotTransitionRules({
        deltaKind: effectiveDelta,
        sameScene,
        shotDuration: turn.shotDuration,
        transitionMemory,
        continuityState,
        nextCameraMemory: turn.nextCameraMemory,
      });
      transitionMemory = shotAdjustment.transitionMemory;
      continuityState = shotAdjustment.continuityState;
      const continuityInfo = finalizeContinuityInfo({
        candidate: null,
        correctedSceneKey: currentIdentityKey,
        identityKey: currentIdentityKey,
        previous: previousContinuity,
        turnIndex: index,
      });
      const changedAnchors = describeSceneIdentityChanges(previousIdentity, turn.identity);
      const ledgerEntry = previousIdentityKey && derivedDelta !== "none"
        ? buildSceneTransitionLedgerEntry({
            previousSceneKey: previousIdentityKey,
            sceneKey: currentIdentityKey,
            deltaKind: derivedDelta,
            changedAnchors,
          })
        : null;
      if (ledgerEntry) ledgerEntries.push({ name: turn.name, index, entry: ledgerEntry });
      const pressureResult = describeScenePressureChange({
        previous: previousIdentity,
        current: turn.identity,
        deltaKind: derivedDelta,
      });
      const previousPressureValue = simulatedPressure;
      const nextPressureValue = Math.max(0, previousPressureValue + pressureResult.pressureDelta);
      const pressureEntry = pressureResult.pressureDelta
        ? {
            kind: "pressure.changed",
            domain: "pressure",
            cause: pressureResult.reason ?? "scene.pressure",
            effect: "pressure.changed",
            data: { delta: pressureResult.pressureDelta, value: nextPressureValue },
          }
        : null;
      const failForwardSignal = describeFailForwardSignal({
        pressure: nextPressureValue,
        previousPressure: previousPressureValue,
        deltaKind: derivedDelta,
        currentPhase: turn.identity.encounterPhase,
        previousPhase: previousIdentity?.encounterPhase ?? null,
      });
      const failForwardEntry = failForwardSignal.active
        ? {
            kind: "failforward",
            domain: "pressure",
            cause: failForwardSignal.reason ?? "failforward",
            effect: "fail-forward",
            data: {
              severity: failForwardSignal.severity,
              pressure: failForwardSignal.pressure,
            },
          }
        : null;
      const failForwardComplication = resolveFailForwardComplication({
        signal: failForwardSignal,
        encounterPhase: turn.identity.encounterPhase,
        deltaKind: derivedDelta,
        pressure: nextPressureValue,
      });
      const complicationEntry = failForwardComplication
        ? {
            kind: "complication",
            domain: "pressure",
            cause: failForwardSignal.reason ?? "failforward",
            effect: `complication.${failForwardComplication}`,
            data: {
              complication: failForwardComplication,
              pressure: nextPressureValue,
              deltaKind: derivedDelta,
              encounterPhase: turn.identity.encounterPhase,
            },
          }
        : null;
      const complicationStateDelta = failForwardComplication
        ? resolveFailForwardStateDelta(failForwardComplication)
        : null;
      const complicationStateDeltaEntry = complicationStateDelta
        ? {
            kind: "complication.applied",
            domain: "pressure",
            cause: "fail-forward.active",
            effect: `complication.${failForwardComplication}`,
            data: {
              complication: failForwardComplication,
              stateDelta: complicationStateDelta,
            },
          }
        : null;
      if (pressureEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: pressureEntry });
      }
      if (failForwardEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: failForwardEntry });
      }
      if (complicationEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: complicationEntry });
      }
      if (complicationStateDelta) {
        if (complicationStateDelta.noise !== undefined) {
          simulatedState.noise += complicationStateDelta.noise;
        }
        if (complicationStateDelta.positionPenalty !== undefined) {
          simulatedState.positionPenalty += complicationStateDelta.positionPenalty;
        }
        if (complicationStateDelta.timeAdvance !== undefined) {
          simulatedState.timeAdvance += complicationStateDelta.timeAdvance;
        }
        if (complicationStateDelta.npcSuspicion !== undefined) {
          simulatedState.npcSuspicion += complicationStateDelta.npcSuspicion;
        }
      }
      let timeAdvanceDelta = 0;
      if (index === 3) {
        simulatedState.npcSuspicion += 2;
      }
      if (index === 4) {
        simulatedState.positionPenalty += 1;
      }
      if (index === 2) {
        simulatedState.timeAdvance += 4;
        timeAdvanceDelta += 4;
        simulatedState.pressure = 3;
      }
      if (index === 5) {
        simulatedState.timeAdvance += 1;
        timeAdvanceDelta += 1;
      }
      if (timeAdvanceDelta > 0) {
        simulatedState.sceneClock += timeAdvanceDelta;
      }
      const currentNoise = simulatedState.noise;
      const noiseLedgerEntry = currentNoise >= 1
        ? {
            kind: "noise.escalation",
            domain: "pressure",
            cause: "noise.persisted",
            effect: "noise.persisted",
            data: {
              noise: currentNoise,
              previousNoise,
              sameScene,
              turnIndex: index,
            },
        }
        : null;
      const noiseActionEntry = previousNoiseActionFlags.attentionDrawn || previousNoiseActionFlags.searchPressure
        ? {
            kind: "noise.action",
            domain: "pressure",
            cause: "noise",
            effect: previousNoiseActionFlags.searchPressure ? "search.pressure" : "attention.drawn",
            data: {
              noise: previousNoise,
              attentionDrawn: previousNoiseActionFlags.attentionDrawn,
              searchPressure: previousNoiseActionFlags.searchPressure,
              turnIndex: index,
            },
          }
        : null;
      if (complicationStateDeltaEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: complicationStateDeltaEntry });
      }
      if (noiseLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: noiseLedgerEntry });
      }
      if (noiseActionEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: noiseActionEntry });
      }
      const previousWatchfulnessValue = simulatedWatchfulness;
      const watchfulness = resolveNpcWatchfulness(
        resolveNpcSuspicionStance(simulatedState.npcSuspicion),
      );
      const watchfulnessActionFlags = resolveWatchfulnessActionFlags({
        watchfulness: watchfulness.level,
        mode: turn.mode,
      });

      const previousPositionActionFlags = resolvePositionActionFlags(simulatedState.positionPenalty);

      const actionConstraints = combineActionConstraints({
        watchfulness: watchfulnessActionFlags,
        position: previousPositionActionFlags,
        noise: previousNoiseActionFlags,
      });
      const actionConstraintPressure = resolveActionConstraintPressure(actionConstraints);
      const actionRisk = resolveActionRisk(actionConstraintPressure);
      const complicationWeight = resolveComplicationWeight({ actionRiskDelta: actionRisk.actionRiskDelta });
      const complicationTier = resolveComplicationTier(complicationWeight);
      const ledgerComplicationSelectionPolicy = resolveComplicationSelectionPolicy(complicationTier);
      if (actionConstraintPressure.constraintPressure > 0) {
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "action.constraint",
            domain: "pressure",
            cause: "action.constraints",
            effect: "constraint.pressure",
            data: {
              constraintPressure: actionConstraintPressure.constraintPressure,
              activeConstraints: actionConstraintPressure.activeConstraints,
              turnIndex: index,
            },
          },
        });
      }
      if (actionRisk.riskTier !== "none") {
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "action.risk",
            domain: "resolution",
            cause: "action.constraints",
        effect: `action-risk.${actionRisk.riskTier}`,
        data: {
          actionRiskDelta: actionRisk.actionRiskDelta,
          constraintPressure: actionConstraintPressure.constraintPressure,
          turnIndex: index,
        },
      },
    });
  }
  if (complicationWeight.complicationWeightDelta > 0) {
    ledgerEntries.push({
      name: turn.name,
      index,
      entry: {
        kind: "complication.weight",
        domain: "resolution",
        cause: "action.risk",
        effect: "complication-weight.elevated",
        data: {
          complicationWeightDelta: complicationWeight.complicationWeightDelta,
          actionRiskDelta: actionRisk.actionRiskDelta,
          turnIndex: index,
        },
      },
    });
  }
      if (complicationTier.complicationTier !== "none") {
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "complication.tier",
            domain: "resolution",
            cause: "complication.weight",
            effect: `complication-tier.${complicationTier.complicationTier}`,
            data: {
              complicationTier: complicationTier.complicationTier,
              complicationWeightDelta: complicationWeight.complicationWeightDelta,
              turnIndex: index,
            },
          },
        });
        if (ledgerComplicationSelectionPolicy.forcedComplicationCount > 0) {
          ledgerEntries.push({
            name: turn.name,
            index,
            entry: {
              kind: "complication.policy",
              domain: "resolution",
              cause: "complication.tier",
              effect: `complication-policy.${complicationTier.complicationTier}`,
              data: {
                forcedComplicationCount: ledgerComplicationSelectionPolicy.forcedComplicationCount,
                complicationTier: complicationTier.complicationTier,
                turnIndex: index,
              },
            },
          });
        }
      }
      const sceneTimeEffect: FinalizedEffectSummary | null = sameScene && timeAdvanceDelta > 0
        ? (simulatedState.sceneClock >= 3 ? "time.deadline-pressure" : "time.scene-prolonged")
        : null;
      const sceneTimeLedgerEntry = sceneTimeEffect
        ? {
            kind: "time.advance",
            domain: "time",
            cause: "time.advance",
            effect: sceneTimeEffect,
            data: {
              value: simulatedState.sceneClock,
              turnIndex: index,
              sameScene,
              timeAdvanceDelta,
            },
          }
        : null;
      if (sceneTimeLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: sceneTimeLedgerEntry });
      }
      const currentNpcSuspicion = simulatedState.npcSuspicion;
      const npcSuspicionLedgerEntry = currentNpcSuspicion >= 1
        ? {
            kind: "npc.suspicion",
            domain: "npc",
            cause: "npc.suspicion",
            effect: "npc.suspicious",
            data: {
              value: currentNpcSuspicion,
              previous: index === 3 ? 0 : 1,
              turnIndex: index,
            },
          }
        : null;
      if (npcSuspicionLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: npcSuspicionLedgerEntry });
      }
      const currentPositionPenalty = simulatedState.positionPenalty;
      const positionPenaltyLedgerEntry = currentPositionPenalty >= 1
        ? {
            kind: "position.penalty",
            domain: "pressure",
            cause: "position.penalty",
            effect: "position.worsened",
            data: {
              value: currentPositionPenalty,
              previous: index === 4 ? 0 : 1,
              turnIndex: index,
            },
          }
        : null;
      if (positionPenaltyLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: positionPenaltyLedgerEntry });
      }
      const timeAdvanceLedgerEntry = simulatedState.timeAdvance >= 1
        ? {
            kind: "time.advance",
            domain: "time",
            cause: "time.advance",
            effect: "time.scene-prolonged",
            data: {
              value: simulatedState.timeAdvance,
              turnIndex: index,
            },
          }
        : null;
      if (timeAdvanceLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: timeAdvanceLedgerEntry });
      }
      const sceneClockPressureResult = resolveSceneClockPressure({
        sceneClock: simulatedState.sceneClock,
        sameScene,
        encounterPhase: turn.identity.encounterPhase,
        currentPressure: simulatedState.pressure,
      });
      const sceneClockPressureEffect = sceneClockPressureResult.timingStateEffect;
      const sceneClockPressureEntry = sceneClockPressureEffect
        ? {
            kind: "scene.clock",
            domain: "time",
            cause: "scene.clock.pressure",
            effect: sceneClockPressureEffect,
            data: {
              sceneClock: simulatedState.sceneClock,
              turnIndex: index,
              sameScene,
            },
          }
        : null;
      if (sceneClockPressureEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: sceneClockPressureEntry });
      }
      const watchfulnessActionEntry =
        watchfulnessActionFlags.stealthDisadvantage || watchfulnessActionFlags.deceptionDisadvantage
          ? {
              kind: "npc.watchfulness.action",
              domain: "npc",
              cause: "watchfulness",
              effect: watchfulnessActionFlags.stealthDisadvantage
                ? "stealth.disadvantage"
                : "deception.disadvantage",
              data: {
                watchfulness: previousWatchfulnessValue,
                mode: turn.mode,
                ...watchfulnessActionFlags,
                turnIndex: index,
              },
            }
          : null;
      if (watchfulnessActionEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: watchfulnessActionEntry });
      }
      const watchfulnessEffect: FinalizedEffectSummary | null =
        watchfulness.level === "normal"
          ? null
          : (`watchfulness.${watchfulness.level}` as FinalizedEffectSummary);
      if (watchfulness.level !== previousWatchfulnessValue) {
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "npc.watchfulness",
            domain: "npc",
            cause: "npc.suspicion",
            effect: `watchfulness.${watchfulness.level}`,
            data: {
              level: watchfulness.level,
              previousLevel: previousWatchfulnessValue,
              costDelta: watchfulness.costDelta,
              turnIndex: index,
            },
          },
        });
      }
      simulatedWatchfulness = watchfulness.level;
      const effectSummaries: FinalizedEffectSummary[] = [
        ...(noiseLedgerEntry ? ["noise.escalation"] : []),
        ...(npcSuspicionLedgerEntry ? ["npc.suspicion"] : []),
        ...(positionPenaltyLedgerEntry ? ["position.penalty"] : []),
        ...(timeAdvanceLedgerEntry ? ["time.scene-prolonged"] : []),
        ...(sceneClockPressureEntry ? [sceneClockPressureEffect as FinalizedEffectSummary] : []),
        ...(actionRisk.riskTier !== "none" ? ([`action-risk.${actionRisk.riskTier}`] as FinalizedEffectSummary[]) : []),
        ...(complicationWeight.complicationWeightDelta > 0 ? ["complication-weight.elevated"] : []),
        ...(actionConstraintPressure.constraintPressure > 0 ? ["constraint.pressure"] : []),
        ...(watchfulnessEffect ? [watchfulnessEffect] : []),
      ];
      const opportunityWindowState = resolveOpportunityWindow({
        effectSummaries,
        sceneClock: simulatedState.sceneClock,
      });
      const opportunityResolutionModifier = resolveOpportunityResolutionModifier({
        opportunityTier: opportunityWindowState.opportunityTier,
      });
      if (opportunityResolutionModifier) {
        effectSummaries.push(opportunityResolutionModifier);
      }
      const opportunityResolutionEntry = opportunityResolutionModifier
        ? {
            kind: "opportunity.resolution",
            domain: "resolution",
            cause: "opportunity.tier",
            effect: opportunityResolutionModifier,
            data: {
              opportunityTier: opportunityWindowState.opportunityTier,
              turnIndex: index,
            },
          }
        : null;
      if (opportunityResolutionEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: opportunityResolutionEntry });
      }
      const opportunityLedgerEntry = opportunityWindowState.windowNarrowed
        ? {
            kind: "opportunity.window",
            domain: "world",
            cause: "opportunity.window-pressure",
            effect: "opportunity.window-narrowed",
            data: {
              sceneClock: simulatedState.sceneClock,
              opportunityTier: opportunityWindowState.opportunityTier,
              turnIndex: index,
            },
          }
        : null;
      if (opportunityLedgerEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: opportunityLedgerEntry });
      }
      if (opportunityResolutionEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: opportunityResolutionEntry });
      }
      const opportunityCost = resolveOpportunityCost({
        opportunityResolutionModifier,
        deltaKind: derivedDelta,
        encounterPhase: turn.identity.encounterPhase,
      });
      if (opportunityCost) {
        effectSummaries.push(opportunityCost as FinalizedEffectSummary);
      }
      const opportunityCostEntry = opportunityCost
        ? {
            kind: "opportunity.cost",
            domain: "resolution",
            cause: "opportunity.tier",
            effect: opportunityCost,
            data: {
              opportunityTier: opportunityWindowState.opportunityTier,
              turnIndex: index,
            },
          }
        : null;
      if (opportunityCostEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: opportunityCostEntry });
      }
      const opportunityCostEffect = resolveOpportunityCostEffect({ opportunityCost });
      const opportunityCostEffectEntry = (opportunityCostEffect.riskLevelDelta || opportunityCostEffect.costBudgetDelta)
        ? {
            kind: "opportunity.cost.effect",
            domain: "resolution",
            cause: "opportunity.tier",
            effect: "opportunity.cost.effect",
            data: {
              riskLevelDelta: opportunityCostEffect.riskLevelDelta,
              costBudgetDelta: opportunityCostEffect.costBudgetDelta,
              turnIndex: index,
            },
          }
        : null;
      if (opportunityCostEffectEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: opportunityCostEffectEntry });
      }
      const watchfulnessCostDelta = watchfulness.costDelta;
      const resolutionCostDelta = (opportunityCostEffect.riskLevelDelta ?? 0) + watchfulnessCostDelta;
      simulatedState.resolutionCost += resolutionCostDelta;
      simulatedState.riskLevel += resolutionCostDelta;
      simulatedState.costBudget += opportunityCostEffect.costBudgetDelta;
      const resolutionCostEffect = resolveResolutionCostEffect({
        resolutionCost: simulatedState.resolutionCost,
      });
      const complicationOutcomeEffect = resolveComplicationOutcomeEffect({
        complicationLikely: resolutionCostEffect.higherComplicationRisk,
      });
      const resolvedFinalizedComplications = resolveFinalizedComplications({
        minimumComplicationCount: complicationOutcomeEffect.minimumComplicationCount,
        failForwardComplication,
      });
      const complicationSelectionPolicy = resolveComplicationSelectionPolicy(complicationTier);
      const complicationPolicyResult = enforceComplicationPolicy({
        finalizedComplications: resolvedFinalizedComplications,
        forcedComplicationCount: complicationSelectionPolicy.forcedComplicationCount,
      });
      const finalizedComplications = complicationPolicyResult.finalizedComplications;
      const resolutionCostEntry = resolutionCostDelta
        ? {
            kind: "resolution.cost",
            domain: "resolution",
            cause: "opportunity.cost",
            effect: "resolution.cost",
            data: {
              delta: resolutionCostDelta,
              value: simulatedState.resolutionCost,
              turnIndex: index,
              watchfulnessCostDelta,
            },
          }
        : null;
      if (resolutionCostEntry) {
        ledgerEntries.push({ name: turn.name, index, entry: resolutionCostEntry });
        effectSummaries.push("resolution.cost");
      }
      if (resolutionCostEffect.higherComplicationRisk) {
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "resolution.cost.effect",
            domain: "resolution",
            cause: "resolution.cost",
            effect: "higher-complication-risk",
            data: {
              resolutionCost: simulatedState.resolutionCost,
              turnIndex: index,
            },
          },
        });
        effectSummaries.push("higher-complication-risk");
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "resolution.complication",
            domain: "resolution",
            cause: "complication.risk",
            effect: "complication-likely",
            data: {
              resolutionCost: simulatedState.resolutionCost,
              turnIndex: index,
            },
          },
        });
        effectSummaries.push("complication-likely");
        ledgerEntries.push({
          name: turn.name,
          index,
          entry: {
            kind: "complication.outcome",
            domain: "resolution",
            cause: "complication.likely",
            effect: "complication-likely",
            data: {
              minimumComplicationCount: complicationOutcomeEffect.minimumComplicationCount,
              turnIndex: index,
            },
          },
        });
        effectSummaries.push("complication.outcome");
        if (finalizedComplications.includes("complication-applied")) {
          ledgerEntries.push({
            name: turn.name,
            index,
            entry: {
              kind: "complication",
              domain: "resolution",
              cause: "complication.outcome",
              effect: "complication-applied",
              data: {
                minimumComplicationCount: complicationOutcomeEffect.minimumComplicationCount,
                turnIndex: index,
              },
            },
          });
          effectSummaries.push("complication-applied");
        }
      }
      simulatedState.opportunityTier = opportunityWindowState.opportunityTier;
      simulatedState.opportunityWindowNarrowed = opportunityWindowState.windowNarrowed;
      simulatedPressure = nextPressureValue;
      simulatedState.pressure = nextPressureValue;
      const outcomeSeverity: "normal" | "strained" | "harsh" = "normal";
      const consequenceBudget = { extraCostCount: 0 };
      const consequenceBundle = buildConsequenceBundle({
        forcedComplicationCount: complicationSelectionPolicy.forcedComplicationCount,
        outcomeSeverity,
        consequenceBudgetExtraCostCount: consequenceBudget.extraCostCount,
      });
      const consequenceNarration = buildFinalizedConsequenceNarration({
        outcomeSeverity,
        consequenceComplicationEntries: consequenceBundle.complicationEntries,
        consequenceExtraCostEntries: consequenceBundle.extraCostEntries,
      });
      persistedRecords.push({
        turnIndex: index,
        failForwardComplication,
        opportunityResolutionModifier,
        opportunityCost,
        opportunityCostEffect,
        resolutionCostEffect: resolutionCostEffect.higherComplicationRisk,
        complicationRisk: resolutionCostEffect.higherComplicationRisk,
        complicationOutcome: complicationOutcomeEffect.minimumComplicationCount > 0,
        finalizedComplications,
        complicationApplied: finalizedComplications.includes("complication-applied"),
        complicationDeltaApplied: !failForwardComplication && complicationOutcomeEffect.minimumComplicationCount > 0,
        finalizedComplicationDeltas: resolveFinalizedComplicationDeltas(finalizedComplications),
        watchfulness: watchfulness.level,
        watchfulnessCostDelta: watchfulness.costDelta,
        watchfulnessEffect: watchfulness.level === "normal" ? null : `watchfulness.${watchfulness.level}`,
        watchfulnessActionFlags,
        noiseActionFlags: previousNoiseActionFlags,
        actionConstraints,
        constraintPressure: actionConstraintPressure.constraintPressure,
        constraintPressureActive: actionConstraintPressure.activeConstraints,
        actionRiskDelta: actionRisk.actionRiskDelta,
        actionRiskTier: actionRisk.riskTier,
        complicationWeightDelta: complicationWeight.complicationWeightDelta,
        complicationTier: complicationTier.complicationTier,
        forcedComplicationCount: complicationSelectionPolicy.forcedComplicationCount,
        complicationPolicyApplied: complicationPolicyResult.policyApplied,
        outcomeSeverity,
        consequenceBudgetExtraCostCount: consequenceBudget.extraCostCount,
        consequenceComplicationEntries: consequenceBundle.complicationEntries,
        consequenceExtraCostEntries: consequenceBundle.extraCostEntries,
        consequenceNarration,
        complicationPolicyApplied: complicationSelectionPolicy.forcedComplicationCount > 0,
        complicationTier: complicationTier.complicationTier,
        forcedComplicationCount: complicationSelectionPolicy.forcedComplicationCount,
        complicationTier: complicationTier.complicationTier,
        npcStance: resolveNpcSuspicionStance(simulatedState.npcSuspicion),
        intentMode: turn.mode,
        state: { ...simulatedState },
      });
      previousContinuity = continuityInfo;
      previousIdentity = turn.identity;
      previousIdentityKey = currentIdentityKey;
      snapshots.push({
        name: turn.name,
        continuity: continuityInfo,
        transitionMemory,
        continuityState,
        effectiveDelta,
        finalizedDelta: derivedDelta,
        sameScene,
        renderPlan,
        failForwardComplication,
        effectSummaries,
      });
    });

    const shortHold = snapshots.find((entry) => entry.name === "short hold")!;
    expect(shortHold.transitionMemory.preserveFraming).toBe(true);
    expect(shortHold.transitionMemory.preserveSubject).toBe(true);
    expect(shortHold.transitionMemory.preserveActor).toBe(true);
    expect(shortHold.transitionMemory.preserveFocus).toBe(true);
    expect(shortHold.continuityState.cameraMemory).toBe(cameraMemoryShort);

    const longHold = snapshots.find((entry) => entry.name === "long hold")!;
    expect(longHold.transitionMemory.preserveFraming).toBe(false);
    expect(longHold.transitionMemory.preserveSubject).toBe(true);
    expect(longHold.transitionMemory.preserveActor).toBe(true);
    expect(longHold.transitionMemory.preserveFocus).toBe(true);

    const partialShift = snapshots.find((entry) => entry.name === "partial shift")!;
    expect(partialShift.finalizedDelta).toBe("partial");
    expect(partialShift.effectiveDelta).toBe("partial");
    expect(partialShift.transitionMemory.preserveFraming).toBe(false);
    expect(partialShift.sameScene).toBe(false);
    expect(partialShift.renderPlan).toBe("queue-full-render");

    const fullChange = snapshots.find((entry) => entry.name === "conflict move 1")!;
    expect(fullChange.effectiveDelta).toBe("full");
    expect(fullChange.transitionMemory).toEqual(EMPTY_SCENE_TRANSITION_MEMORY);
    expect(fullChange.continuityState.cameraMemory).toBeNull();
    expect(fullChange.continuity.previousSceneKey).toBe(buildSceneKey(partialSceneIdentityA));
    expect(fullChange.renderPlan).toBe("queue-full-render");

  const nextHold = snapshots.find((entry) => entry.name === "aftermath hold")!;
  expect(nextHold.continuity.previousSceneKey).toBe(buildSceneKey(conflictSceneIdentityC));
  expect(nextHold.sameScene).toBe(false);
  expect(nextHold.effectiveDelta).toBe("partial");

  const watchfulnessSnapshot = snapshots.find((entry) =>
    entry.effectSummaries.some((effect) => effect.startsWith("watchfulness.")),
  );
  expect(watchfulnessSnapshot).toBeDefined();

    const partialLedger = ledgerEntries.find((entry) => entry.entry.effect === "scene.delta.partial");
    expect(partialLedger).toBeDefined();
    expect(partialLedger?.entry.cause).toBe("scene.encounterPhase.changed");
    expect(partialLedger?.entry.data.changedAnchors).toEqual(["encounterPhase"]);
    expect(partialLedger?.entry.data.previousSceneKey).toBe(buildSceneKey(baseSceneIdentityA));
    expect(partialLedger?.entry.data.sceneKey).toBe(buildSceneKey(partialSceneIdentityA));

    const fullLedger = ledgerEntries.find((entry) => entry.entry.effect === "scene.delta.full");
    expect(fullLedger).toBeDefined();
    expect(fullLedger?.entry.data.changedAnchors).toContain("location");
    expect(fullLedger?.entry.data.previousSceneKey).toBe(buildSceneKey(partialSceneIdentityA));
    expect(fullLedger?.entry.data.sceneKey).toBe(buildSceneKey(conflictSceneIdentityB));

    const pressureIncrease = ledgerEntries.find((entry) => entry.entry.effect === "pressure.changed" &&
      entry.entry.cause === "phase.escalation.conflict");
    expect(pressureIncrease).toBeDefined();
    expect((pressureIncrease?.entry.data as any)?.delta).toBe(1);
    expect((pressureIncrease?.entry.data as any)?.value).toBe(1);

    const pressureDecrease = ledgerEntries.find((entry) => entry.entry.effect === "pressure.changed" &&
      entry.entry.cause === "phase.deescalation.aftermath");
    expect(pressureDecrease).toBeDefined();
    expect((pressureDecrease?.entry.data as any)?.delta).toBe(-1);
    const failForwardLedger = ledgerEntries.find((entry) => entry.entry.kind === "failforward");
    expect(failForwardLedger).toBeDefined();
    expect((failForwardLedger?.entry.data as any)?.pressure).toBe(1);

    const recordWithFinalizedComplications = persistedRecords.find(
      (record) => Array.isArray(record.finalizedComplications) && record.finalizedComplications.length > 0,
    );
    expect(recordWithFinalizedComplications).toBeDefined();
    const complicationEffect = recordWithFinalizedComplications?.finalizedComplications?.[0] ?? "complication-applied";
    const complicationLedger = ledgerEntries.find(
      (entry) => entry.entry.kind === "complication" && entry.entry.effect === complicationEffect,
    );
    expect(complicationLedger).toBeDefined();
    const snapshotForComplication = snapshots.find((entry, idx) => idx === complicationLedger?.index);
    expect(snapshotForComplication?.effectSummaries).toContain(complicationEffect);
    const persistedRecordForComplication = persistedRecords.find((record) => record.turnIndex === complicationLedger?.index);
    const complicationAppliedLedger = ledgerEntries.find((entry) => entry.entry.kind === "complication.applied");
    expect(complicationAppliedLedger).toBeDefined();
    expect((complicationAppliedLedger?.entry.data as any)?.stateDelta).toEqual({ noise: 1 });
    const persistedRecordForApplied = persistedRecords.find((record) => record.turnIndex === complicationAppliedLedger?.index);
    expect(persistedRecordForApplied?.state.noise).toBeGreaterThanOrEqual(1);
    const npcStanceLedger = ledgerEntries.find((entry) => entry.entry.kind === "npc.stance");
    if (npcStanceLedger) {
      const npcStanceRecord = persistedRecords.find((record) => record.turnIndex === npcStanceLedger?.index);
      expect(npcStanceLedger?.entry.effect).toBe(
        resolveNpcSuspicionStance(npcStanceRecord?.state.npcSuspicion ?? 0),
      );
    }
    if (persistedRecordForComplication) {
      expect(persistedRecordForComplication.npcStance).toBe(
        resolveNpcSuspicionStance(persistedRecordForComplication.state.npcSuspicion ?? 0),
      );
    }
    const noiseLedger = ledgerEntries.find((entry) => entry.entry.kind === "noise.escalation");
    expect(noiseLedger).toBeDefined();
    expect((noiseLedger?.entry.data as any)?.noise).toBeGreaterThanOrEqual(1);
    const npcLedger = ledgerEntries.find((entry) => entry.entry.kind === "npc.suspicion");
    expect(npcLedger).toBeDefined();
    expect((npcLedger?.entry.data as any)?.value).toBeGreaterThanOrEqual(1);
    const persistedRecordForNpc = persistedRecords.find((record) => record.turnIndex === npcLedger?.index);
    expect(persistedRecordForNpc?.state.npcSuspicion).toBeGreaterThanOrEqual(1);
    const positionLedger = ledgerEntries.find((entry) => entry.entry.kind === "position.penalty");
    expect(positionLedger).toBeDefined();
    expect(positionLedger?.entry.effect).toBe("position.worsened");
    const persistedRecordForPosition = persistedRecords.find((record) => record.turnIndex === positionLedger?.index);
    expect(persistedRecordForPosition?.state.positionPenalty).toBeGreaterThanOrEqual(1);
    const positionSnapshot = snapshots.find((entry) => entry.name === "conflict move 2");
    expect(positionSnapshot?.effectSummaries).toContain("position.penalty");
    const timeLedger = ledgerEntries.find((entry) => entry.entry.kind === "time.advance");
    expect(timeLedger).toBeDefined();
    expect((timeLedger?.entry.data as any)?.value).toBeGreaterThanOrEqual(1);
    const persistedTimeRecord = persistedRecords.find((record) => record.turnIndex === timeLedger?.index);
    expect(persistedTimeRecord?.state.timeAdvance).toBeGreaterThanOrEqual(1);
    const timeSnapshot = snapshots.find((entry) => entry.name === "long hold");
    expect(timeSnapshot?.effectSummaries).toContain("time.scene-prolonged");
    expect(timeSnapshot?.effectSummaries).toContain("objective.window-narrowed");
    const sceneClockLedger = ledgerEntries.find((entry) => entry.entry.kind === "scene.clock");
    expect(sceneClockLedger).toBeDefined();
    expect(sceneClockLedger?.entry.effect).toBe("objective.window-narrowed");
    const resolutionSnapshot = snapshots.find((entry) => entry.effectSummaries.includes("resolution.cost"));
    expect(resolutionSnapshot).toBeDefined();
    const opportunityLedger = ledgerEntries.find((entry) => entry.entry.kind === "opportunity.window");
    expect(opportunityLedger).toBeDefined();
    expect((opportunityLedger?.entry.data as any)?.opportunityTier).toBe("reduced");
    const opportunityRecord = persistedRecords.find((record) => record.turnIndex === opportunityLedger?.index);
    expect(opportunityRecord?.state.opportunityTier).toBe("reduced");
    expect(opportunityRecord?.state.opportunityWindowNarrowed).toBe(true);
    const opportunityResolutionLedger = ledgerEntries.find((entry) => entry.entry.kind === "opportunity.resolution");
    expect(opportunityResolutionLedger).toBeDefined();
    expect(opportunityResolutionLedger?.entry.effect).toBe("opportunity.reduced");
    const opportunityRecordForResolution = persistedRecords.find(
      (record) => record.turnIndex === opportunityResolutionLedger?.index,
    );
    expect(opportunityRecordForResolution?.opportunityResolutionModifier).toBe("opportunity.reduced");
    const opportunityCostLedger = ledgerEntries.find((entry) => entry.entry.kind === "opportunity.cost");
    expect(opportunityCostLedger).toBeDefined();
    expect(opportunityCostLedger?.entry.effect).toBe("reduced-margin");
    const opportunityRecordForCost = persistedRecords.find((record) => record.turnIndex === opportunityCostLedger?.index);
    expect(opportunityRecordForCost?.opportunityCost).toBe("reduced-margin");
    const opportunityCostEffectLedger = ledgerEntries.find((entry) => entry.entry.kind === "opportunity.cost.effect");
    expect(opportunityCostEffectLedger).toBeDefined();
    expect((opportunityCostEffectLedger?.entry.data as any)?.riskLevelDelta).toBe(1);
    const opportunityRecordForCostEffect = persistedRecords.find(
      (record) => record.turnIndex === opportunityCostEffectLedger?.index,
    );
    expect(opportunityRecordForCostEffect?.opportunityCostEffect).toEqual({
      riskLevelDelta: 1,
      costBudgetDelta: 0,
    });
    expect(opportunityRecordForCostEffect?.state.riskLevel).toBeGreaterThanOrEqual(1);
    const resolutionCostLedger = ledgerEntries.find((entry) => entry.entry.kind === "resolution.cost");
    expect(resolutionCostLedger).toBeDefined();
    expect((resolutionCostLedger?.entry.data as any)?.delta).toBe(1);
    const resolutionRecord = persistedRecords.find((record) => record.turnIndex === resolutionCostLedger?.index);
    expect(resolutionRecord?.state.resolutionCost).toBeGreaterThanOrEqual(1);
    const resolutionCostEffectLedger = ledgerEntries.find((entry) => entry.entry.kind === "resolution.cost.effect");
    expect(resolutionCostEffectLedger).toBeDefined();
    expect(resolutionCostEffectLedger?.entry.effect).toBe("higher-complication-risk");
    const resolutionEffectRecord = persistedRecords.find((record) => record.turnIndex === resolutionCostEffectLedger?.index);
    expect(resolutionEffectRecord?.resolutionCostEffect).toBe(true);
    const resolutionEffectSnapshot = snapshots.find((entry, idx) => entry.effectSummaries.includes("higher-complication-risk"));
    expect(resolutionEffectSnapshot).toBeDefined();
    const complicationRiskLedger = ledgerEntries.find((entry) => entry.entry.kind === "resolution.complication");
    expect(complicationRiskLedger).toBeDefined();
    expect(complicationRiskLedger?.entry.effect).toBe("complication-likely");
    const complicationRiskRecord = persistedRecords.find((record) => record.turnIndex === complicationRiskLedger?.index);
    expect(complicationRiskRecord?.complicationRisk).toBe(true);
    const complicationRiskSnapshot = snapshots.find((entry, idx) => entry.effectSummaries.includes("complication-likely"));
    expect(complicationRiskSnapshot).toBeDefined();
    const complicationOutcomeLedger = ledgerEntries.find((entry) => entry.entry.kind === "complication.outcome");
    expect(complicationOutcomeLedger).toBeDefined();
    const complicationOutcomeRecord = persistedRecords.find((record) => record.turnIndex === complicationOutcomeLedger?.index);
    expect(complicationOutcomeRecord?.complicationOutcome).toBe(true);
    const complicationOutcomeSnapshot = snapshots.find((entry, idx) => entry.effectSummaries.includes("complication.outcome"));
    expect(complicationOutcomeSnapshot).toBeDefined();
    const complicationDeltaEntry = ledgerEntries.find((entry) => entry.entry.kind === "complication.deltas");
    expect(complicationDeltaEntry).toBeUndefined();

      const failForwardRecord = persistedRecords.find((record) => record.failForwardComplication);
      if (failForwardRecord) {
        expect(failForwardRecord.finalizedComplicationDeltas).toEqual(
          resolveFinalizedComplicationDeltas(failForwardRecord.finalizedComplications ?? []),
        );
        const failForwardComplicationDelta = resolveFailForwardStateDelta(
          failForwardRecord.failForwardComplication!,
        );
        const expectedDelta = {
          noise: failForwardComplicationDelta?.noise ?? 0,
          npcSuspicion: failForwardComplicationDelta?.npcSuspicion ?? 0,
          positionPenalty: failForwardComplicationDelta?.positionPenalty ?? 0,
          timeAdvance: failForwardComplicationDelta?.timeAdvance ?? 0,
        };
        expect(failForwardRecord.finalizedComplicationDeltas).toEqual(expectedDelta);
        expect(failForwardRecord.complicationDeltaApplied).toBe(false);
        const appliedLedgerEntry = ledgerEntries.find(
          (entry) =>
            entry.index === failForwardRecord.turnIndex &&
            entry.entry.kind === "complication.applied",
        );
        expect(appliedLedgerEntry).toBeDefined();
        const ledgerDelta = (appliedLedgerEntry?.entry.data as any)?.stateDelta ?? {};
        const normalizedFinalizedDeltas = Object.fromEntries(
          Object.entries(failForwardRecord.finalizedComplicationDeltas ?? {}).filter(([, value]) => value),
        );
        expect(ledgerDelta).toEqual(normalizedFinalizedDeltas);
      }

    const watchfulnessRecord = persistedRecords.find((record) => record.watchfulness !== "normal");
      if (watchfulnessRecord) {
      const watchfulnessTurn = watchfulnessRecord.turnIndex;
      expect(watchfulnessRecord.watchfulnessCostDelta).toBeGreaterThanOrEqual(1);
      const watchfulnessLedger = ledgerEntries.find(
        (entry) => entry.index === watchfulnessTurn && entry.entry.kind === "npc.watchfulness",
      );
      expect(watchfulnessLedger).toBeDefined();
      const watchfulnessLedgerRecord = watchfulnessLedger?.entry.data as any;
      expect(watchfulnessLedgerRecord?.level).toBe(watchfulnessRecord.watchfulness);
      expect(watchfulnessLedgerRecord?.costDelta).toBe(watchfulnessRecord.watchfulnessCostDelta);
      const watchfulnessResolutionLedger = ledgerEntries.find(
        (entry) => entry.index === watchfulnessTurn && entry.entry.kind === "resolution.cost",
      );
      expect(watchfulnessResolutionLedger).toBeDefined();
      const resolutionCostData = watchfulnessResolutionLedger?.entry.data as any;
      expect(resolutionCostData?.watchfulnessCostDelta).toBe(watchfulnessRecord.watchfulnessCostDelta);
      expect(resolutionCostData?.delta).toBeGreaterThanOrEqual(watchfulnessRecord.watchfulnessCostDelta);
      const watchfulnessSnapshot = snapshots.find((entry, idx) => idx === watchfulnessTurn);
      expect(watchfulnessSnapshot).toBeDefined();
      const watchfulnessEffect = watchfulnessRecord.watchfulnessEffect;
      if (watchfulnessEffect) {
        expect(watchfulnessSnapshot?.effectSummaries).toContain(watchfulnessEffect);
      }
      expect(watchfulnessRecord.npcStance).toBe(
        resolveNpcSuspicionStance(watchfulnessRecord.state.npcSuspicion ?? 0),
      );
      const expectedWatchfulness = resolveNpcWatchfulness(
        watchfulnessRecord.npcStance as Parameters<typeof resolveNpcWatchfulness>[0],
      );
      expect(watchfulnessRecord.watchfulness).toBe(expectedWatchfulness.level);
      expect(watchfulnessRecord.watchfulnessCostDelta).toBe(expectedWatchfulness.costDelta);
      const expectedWatchfulnessActions = resolveWatchfulnessActionFlags({
        watchfulness: watchfulnessRecord.watchfulness as WatchfulnessLevel,
        mode: watchfulnessRecord.intentMode ?? "DO",
      });
      expect(watchfulnessRecord.watchfulnessActionFlags).toEqual(expectedWatchfulnessActions);
      const expectedWatchfulnessConstraints = combineActionConstraints({
        watchfulness: expectedWatchfulnessActions,
        position: watchfulnessRecord.positionActionFlags ?? resolvePositionActionFlags(0),
        noise: watchfulnessRecord.noiseActionFlags ?? resolveNoiseActionFlags(0),
      });
      expect(watchfulnessRecord.actionConstraints).toEqual(expectedWatchfulnessConstraints);
      const nextRecord = persistedRecords.find((record) => record.turnIndex === watchfulnessTurn + 1);
      expect(nextRecord?.watchfulness).toBe(watchfulnessRecord.watchfulness);
      const actionFlagRecord = nextRecord;
      expect(actionFlagRecord?.watchfulnessActionFlags?.stealthDisadvantage).toBe(true);
      const watchfulnessActionLedger = ledgerEntries.find(
        (entry) => entry.index === actionFlagRecord?.turnIndex && entry.entry.kind === "npc.watchfulness.action",
      );
      expect(watchfulnessActionLedger).toBeDefined();
      expect(watchfulnessActionLedger?.entry.effect).toBe("stealth.disadvantage");
      const expectedNextWatchfulnessActions = resolveWatchfulnessActionFlags({
        watchfulness: watchfulnessRecord.watchfulness as WatchfulnessLevel,
        mode: actionFlagRecord?.intentMode ?? "DO",
      });
      expect(actionFlagRecord?.watchfulnessActionFlags).toEqual(expectedNextWatchfulnessActions);
      expect(actionFlagRecord?.actionConstraints?.stealthDisadvantage).toBe(
        expectedNextWatchfulnessActions.stealthDisadvantage,
      );
      expect(actionFlagRecord?.actionConstraints?.deceptionDisadvantage).toBe(
        expectedNextWatchfulnessActions.deceptionDisadvantage,
      );
      }
    const positionFlagRecord = persistedRecords.find((record) => record.positionActionFlags?.mobilityDisadvantage);
    if (positionFlagRecord) {
      const positionTurn = positionFlagRecord.turnIndex;
      expect(positionFlagRecord.positionActionFlags?.mobilityDisadvantage).toBe(true);
      const positionActionLedger = ledgerEntries.find(
        (entry) => entry.index === positionTurn && entry.entry.kind === "position.penalty.action",
      );
      expect(positionActionLedger).toBeDefined();
      expect(positionActionLedger?.entry.effect).toBe("position.mobility.disadvantage");
      const nextRecord = persistedRecords.find((record) => record.turnIndex === positionTurn + 1);
      expect(nextRecord?.positionActionFlags?.mobilityDisadvantage).toBe(true);
      expect(nextRecord?.state.positionPenalty).toBeGreaterThanOrEqual(1);
      const expectedPositionFlags = resolvePositionActionFlags(positionFlagRecord.state.positionPenalty);
      expect(positionFlagRecord.positionActionFlags).toEqual(expectedPositionFlags);
      const expectedPositionConstraints = combineActionConstraints({
        watchfulness: positionFlagRecord.watchfulnessActionFlags ?? null,
        position: expectedPositionFlags,
        noise: positionFlagRecord.noiseActionFlags ?? null,
      });
      expect(positionFlagRecord.actionConstraints).toEqual(expectedPositionConstraints);
    }
    const noiseRecord = persistedRecords.find((record) => record.noiseActionFlags?.attentionDrawn);
    if (noiseRecord) {
      const noiseTurn = noiseRecord.turnIndex;
      const noiseLedger = ledgerEntries.find(
        (entry) => entry.index === noiseTurn && entry.entry.kind === "noise.action",
      );
      expect(noiseLedger).toBeDefined();
      expect(noiseLedger?.entry.effect).toBe(
        noiseRecord.noiseActionFlags?.searchPressure ? "search.pressure" : "attention.drawn",
      );
      const nextNoiseRecord = persistedRecords.find((record) => record.turnIndex === noiseTurn + 1);
      expect(nextNoiseRecord?.noiseActionFlags?.attentionDrawn).toBe(true);
      if (noiseRecord.noiseActionFlags?.searchPressure) {
        expect(nextNoiseRecord?.noiseActionFlags?.searchPressure).toBe(true);
      }
      const expectedNoiseFlags = resolveNoiseActionFlags(noiseRecord.state.noise);
      expect(noiseRecord.noiseActionFlags).toEqual(expectedNoiseFlags);
      const expectedNoiseConstraints = combineActionConstraints({
        watchfulness: noiseRecord.watchfulnessActionFlags ?? null,
        position: noiseRecord.positionActionFlags ?? null,
        noise: expectedNoiseFlags,
      });
      expect(noiseRecord.actionConstraints).toEqual(expectedNoiseConstraints);
    }
    const constraintRecord = persistedRecords.find((record) => record.actionConstraints);
    if (constraintRecord) {
      const expectedConstraints = combineActionConstraints({
        watchfulness: constraintRecord.watchfulnessActionFlags ?? null,
        position: constraintRecord.positionActionFlags ?? null,
        noise: constraintRecord.noiseActionFlags ?? null,
      });
      expect(constraintRecord.actionConstraints).toEqual(expectedConstraints);
      const expectedConstraintPressure = resolveActionConstraintPressure(expectedConstraints);
      expect(constraintRecord.constraintPressure).toBe(expectedConstraintPressure.constraintPressure);
      const expectedActionRisk = resolveActionRisk(expectedConstraintPressure);
      expect(constraintRecord.actionRiskDelta).toBe(expectedActionRisk.actionRiskDelta);
      expect(constraintRecord.actionRiskTier).toBe(expectedActionRisk.riskTier);
      const expectedComplicationWeight = resolveComplicationWeight({ actionRiskDelta: expectedActionRisk.actionRiskDelta });
      expect(constraintRecord.complicationWeightDelta).toBe(expectedComplicationWeight.complicationWeightDelta);
      const expectedComplicationTier = resolveComplicationTier(expectedComplicationWeight);
      expect(constraintRecord.complicationTier).toBe(expectedComplicationTier.complicationTier);
      const expectedPolicy = resolveComplicationSelectionPolicy(expectedComplicationTier);
      expect(constraintRecord.forcedComplicationCount).toBe(expectedPolicy.forcedComplicationCount);
      const expectedConsequenceBundle = buildConsequenceBundle({
        forcedComplicationCount: expectedPolicy.forcedComplicationCount,
        outcomeSeverity: constraintRecord.outcomeSeverity,
        consequenceBudgetExtraCostCount: constraintRecord.consequenceBudgetExtraCostCount ?? 0,
      });
      expect(constraintRecord.consequenceComplicationEntries).toEqual(expectedConsequenceBundle.complicationEntries);
      expect(constraintRecord.consequenceExtraCostEntries).toEqual(expectedConsequenceBundle.extraCostEntries);
      const activeConstraintKeys = (Object.keys(expectedConstraints) as Array<keyof ActionConstraints>).filter(
        (key) => expectedConstraints[key],
      );
      const expectedPressure = Math.min(activeConstraintKeys.length, 3);
      expect(constraintRecord.constraintPressure).toBe(expectedPressure);
      expect(constraintRecord.constraintPressureActive).toEqual(activeConstraintKeys);
      const expectedActionRiskDelta = expectedPressure >= 2 ? 2 : expectedPressure === 1 ? 1 : 0;
      expect(constraintRecord.actionRiskDelta).toBe(expectedActionRiskDelta);
      const expectedRiskTier = expectedActionRiskDelta === 2 ? "high" : expectedActionRiskDelta === 1 ? "elevated" : "none";
      expect(constraintRecord.actionRiskTier).toBe(expectedRiskTier);
      const forcedComplicationCount = constraintRecord.forcedComplicationCount ?? 0;
      if (constraintRecord.complicationPolicyApplied) {
        expect(constraintRecord.finalizedComplications?.length ?? 0).toBeGreaterThanOrEqual(forcedComplicationCount);
        expect(constraintRecord.finalizedComplicationDeltas).toEqual(
          resolveFinalizedComplicationDeltas(constraintRecord.finalizedComplications ?? []),
        );
      }
      if (forcedComplicationCount > 0) {
        expect(constraintRecord.complicationPolicyApplied).toBe(true);
      }
      expect(constraintRecord.complicationWeightDelta).toBe(expectedActionRiskDelta);
      const constraintLedger = ledgerEntries.find(
        (entry) => entry.entry.kind === "action.constraint",
      );
      if (constraintRecord.constraintPressure && constraintRecord.constraintPressure > 0) {
        expect(constraintLedger).toBeDefined();
        expect(constraintLedger?.entry.effect).toBe("constraint.pressure");
      } else {
        expect(constraintLedger).toBeUndefined();
      }
      const actionRiskLedger = ledgerEntries.find((entry) => entry.entry.kind === "action.risk");
      if (constraintRecord.actionRiskTier && constraintRecord.actionRiskTier !== "none") {
        expect(actionRiskLedger).toBeDefined();
        expect(actionRiskLedger?.entry.effect).toBe(`action-risk.${constraintRecord.actionRiskTier}`);
      } else {
        expect(actionRiskLedger).toBeUndefined();
      }
      const complicationWeightLedger = ledgerEntries.find((entry) => entry.entry.kind === "complication.weight");
      if (constraintRecord.complicationWeightDelta && constraintRecord.complicationWeightDelta > 0) {
        expect(complicationWeightLedger).toBeDefined();
        expect(complicationWeightLedger?.entry.effect).toBe("complication-weight.elevated");
      } else {
        expect(complicationWeightLedger).toBeUndefined();
      }
      const complicationTierLedger = ledgerEntries.find((entry) => entry.entry.kind === "complication.tier");
      if (constraintRecord.complicationTier && constraintRecord.complicationTier !== "none") {
        expect(complicationTierLedger).toBeDefined();
        expect(complicationTierLedger?.entry.effect).toBe(`complication-tier.${constraintRecord.complicationTier}`);
      } else {
        expect(complicationTierLedger).toBeUndefined();
      }
      const complicationPolicyLedger = ledgerEntries.find((entry) => entry.entry.kind === "complication.policy");
      if (constraintRecord.forcedComplicationCount && constraintRecord.forcedComplicationCount > 0) {
        expect(complicationPolicyLedger).toBeDefined();
        expect(complicationPolicyLedger?.entry.effect).toBe(`complication-policy.${constraintRecord.complicationTier}`);
      } else {
        expect(complicationPolicyLedger).toBeUndefined();
      }
    }
    const policyRecords = persistedRecords.filter((record) => (record.forcedComplicationCount ?? 0) > 0);
    expect(policyRecords.length).toBeGreaterThan(0);
    for (const record of policyRecords) {
      const derivedPolicy = resolveComplicationSelectionPolicy({
        complicationTier: record.complicationTier as any,
      });
      expect(record.forcedComplicationCount).toBe(derivedPolicy.forcedComplicationCount);
      const finalListLength = (record.finalizedComplications ?? []).length;
      expect(finalListLength).toBeGreaterThanOrEqual(record.forcedComplicationCount ?? 0);
      if (record.complicationTier === "heavy") {
        expect(record.forcedComplicationCount).toBeGreaterThanOrEqual(2);
      }
      const derivedBudget = resolveConsequenceBudget({ outcomeSeverity: record.outcomeSeverity ?? "normal" });
      expect(record.consequenceBudgetExtraCostCount).toBe(derivedBudget.extraCostCount);
      const consequenceBundle = buildConsequenceBundle({
        forcedComplicationCount: record.forcedComplicationCount ?? 0,
        outcomeSeverity: record.outcomeSeverity ?? "normal",
        consequenceBudgetExtraCostCount: record.consequenceBudgetExtraCostCount ?? 0,
      });
      expect(record.consequenceComplicationEntries).toEqual(consequenceBundle.complicationEntries);
      expect(record.consequenceExtraCostEntries).toEqual(consequenceBundle.extraCostEntries);
      const expectedNarration = buildFinalizedConsequenceNarration({
        outcomeSeverity: record.outcomeSeverity ?? "normal",
        consequenceComplicationEntries: record.consequenceComplicationEntries ?? [],
        consequenceExtraCostEntries: record.consequenceExtraCostEntries ?? [],
      });
      expect(record.consequenceNarration).toEqual(expectedNarration);
    }

    persistedRecords.forEach((record) => {
      const expectedDeltas = resolveFinalizedComplicationDeltas(record.finalizedComplications ?? []);
      expect(record.finalizedComplicationDeltas).toEqual(expectedDeltas);
      expect(record.finalizedComplications.length).toBeGreaterThanOrEqual(record.forcedComplicationCount);
    });
  });

  it("persists canonical continuity across fallback turns and resets on a full identity change", () => {
    const { persistedTurns, previousLogs, persistTurn } = createContinuityPersistor();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bootstrap = persistTurn({
        turnIndex: 0,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeSceneCandidate({
          sceneKey: canonicalSceneKeyA,
          identityKey: canonicalSceneKeyA,
          continuityReason: "INITIAL_RENDER",
          continuityBucket: "bootstrap",
          shotKey: "shot-bootstrap",
          deltaKind: "full",
          renderPlan: "queue-full-render",
        }),
      });

      const firstHold = persistTurn({
        turnIndex: 1,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeSceneCandidate({
          sceneKey: canonicalSceneKeyA,
          identityKey: canonicalSceneKeyA,
          previousSceneKey: canonicalSceneKeyA,
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-hold-1",
          previousShotKey: "shot-bootstrap",
          shotDuration: 2,
        }),
      });

      const legacyFallback = persistTurn({
        turnIndex: 2,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: null,
      });

      const followUp = persistTurn({
        turnIndex: 3,
        correctedSceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        candidateContinuity: makeSceneCandidate({
          sceneKey: canonicalSceneKeyA,
          identityKey: canonicalSceneKeyA,
          previousSceneKey: canonicalSceneKeyA,
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-hold-2",
          previousShotKey: "shot-hold-1",
          shotDuration: 3,
        }),
      });

      const fullMove = persistTurn({
        turnIndex: 4,
        correctedSceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        candidateContinuity: makeSceneCandidate({
          sceneKey: canonicalSceneKeyB,
          identityKey: canonicalSceneKeyB,
          previousSceneKey: canonicalSceneKeyA,
          deltaKind: "full",
          renderPlan: "queue-full-render",
          continuityReason: "FULL_RENDER_REQUIRED",
          continuityBucket: "degraded",
          shotKey: "shot-full",
          previousShotKey: "shot-hold-2",
          shotDuration: 1,
        }),
      });

      const newSceneHold = persistTurn({
        turnIndex: 5,
        correctedSceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        candidateContinuity: makeSceneCandidate({
          sceneKey: canonicalSceneKeyB,
          identityKey: canonicalSceneKeyB,
          previousSceneKey: canonicalSceneKeyB,
          deltaKind: "none",
          renderPlan: "reuse-current",
          continuityReason: "REUSE_OK",
          continuityBucket: "decision",
          shotKey: "shot-new-hold",
          previousShotKey: "shot-full",
          shotDuration: 2,
        }),
      });

      const persistedIndices = persistedTurns.map((entry) => entry.turnIndex);
      expect(persistedIndices).toEqual([0, 1, 2, 3, 4, 5]);

      const logForTurn3 = previousLogs.find((entry) => entry.turnIndex === 3);
      expect(logForTurn3?.previousTurnHasContinuityInfo).toBe(true);
      expect(logForTurn3?.hydratedPreviousSceneKey).toBe(canonicalSceneKeyA);

      const logForTurn5 = previousLogs.find((entry) => entry.turnIndex === 5);
      expect(logForTurn5?.previousTurnHasContinuityInfo).toBe(true);
      expect(logForTurn5?.hydratedPreviousSceneKey).toBe(canonicalSceneKeyB);

      const legacyEntry = persistedTurns.find((entry) => entry.turnIndex === 2)?.continuityInfo;
      expect(legacyEntry?.sceneKey).toBe(canonicalSceneKeyA);
      expect(legacyEntry?.deltaKind).toBe("none");
      expect(legacyEntry?.renderPlan).toBe("reuse-current");
      expect(legacyEntry?.previousSceneKey).toBe(canonicalSceneKeyA);

      expect(bootstrap.sceneKey).toBe(canonicalSceneKeyA);
      expect(firstHold.sceneKey).toBe(canonicalSceneKeyA);
      expect(followUp.sceneKey).toBe(canonicalSceneKeyA);
      expect(fullMove.sceneKey).toBe(canonicalSceneKeyB);
      expect(newSceneHold.sceneKey).toBe(canonicalSceneKeyB);

      expect(fullMove.deltaKind).toBe("full");
      expect(fullMove.renderPlan).toBe("queue-full-render");
      expect(fullMove.previousSceneKey).toBe(canonicalSceneKeyA);

      expect(newSceneHold.previousSceneKey).toBe(fullMove.sceneKey);
      expect(newSceneHold.continuityBucket).toBe("decision");
      expect(newSceneHold.continuityReason).toBe("REUSE_OK");
      expect(newSceneHold.deltaKind).toBe("none");
      expect(newSceneHold.renderPlan).toBe("reuse-current");

      persistedTurns.forEach((entry) =>
        expect(entry.sceneKey).toBe(entry.continuityInfo.sceneKey),
      );

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rehydrates a legacy fallback before a full scene move", () => {
    const { persistedTurns, previousLogs, persistTurn } = createContinuityPersistor();

    const bootstrap = persistTurn({
      turnIndex: 0,
      correctedSceneKey: canonicalSceneKeyA,
      identityKey: canonicalSceneKeyA,
      candidateContinuity: makeSceneCandidate({
        sceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        continuityReason: "INITIAL_RENDER",
        continuityBucket: "bootstrap",
      }),
    });

    const firstHold = persistTurn({
      turnIndex: 1,
      correctedSceneKey: canonicalSceneKeyA,
      identityKey: canonicalSceneKeyA,
      candidateContinuity: makeSceneCandidate({
        sceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        previousSceneKey: canonicalSceneKeyA,
        deltaKind: "none",
        renderPlan: "reuse-current",
        continuityReason: "REUSE_OK",
        continuityBucket: "decision",
      }),
    });

    const legacyFallback = persistTurn({
      turnIndex: 2,
      correctedSceneKey: canonicalSceneKeyA,
      identityKey: canonicalSceneKeyA,
      candidateContinuity: null,
    });

    const followUp = persistTurn({
      turnIndex: 3,
      correctedSceneKey: canonicalSceneKeyA,
      identityKey: canonicalSceneKeyA,
      candidateContinuity: makeSceneCandidate({
        sceneKey: canonicalSceneKeyA,
        identityKey: canonicalSceneKeyA,
        previousSceneKey: canonicalSceneKeyA,
        deltaKind: "none",
        renderPlan: "reuse-current",
        continuityReason: "REUSE_OK",
        continuityBucket: "decision",
      }),
    });

    const fullMove = persistTurn({
      turnIndex: 4,
      correctedSceneKey: canonicalSceneKeyB,
      identityKey: canonicalSceneKeyB,
      candidateContinuity: makeSceneCandidate({
        sceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        previousSceneKey: canonicalSceneKeyA,
        deltaKind: "full",
        renderPlan: "queue-full-render",
        continuityReason: "FULL_RENDER_REQUIRED",
        continuityBucket: "degraded",
      }),
    });

    const newSceneHold = persistTurn({
      turnIndex: 5,
      correctedSceneKey: canonicalSceneKeyB,
      identityKey: canonicalSceneKeyB,
      candidateContinuity: makeSceneCandidate({
        sceneKey: canonicalSceneKeyB,
        identityKey: canonicalSceneKeyB,
        previousSceneKey: canonicalSceneKeyB,
        deltaKind: "none",
        renderPlan: "reuse-current",
        continuityReason: "REUSE_OK",
        continuityBucket: "decision",
      }),
    });

    expect(legacyFallback.sceneKey).toBe(canonicalSceneKeyA);
    expect(legacyFallback.deltaKind).toBe("none");
    expect(legacyFallback.renderPlan).toBe("reuse-current");
    expect(previousLogs.find((entry) => entry.turnIndex === 3)?.hydratedPreviousSceneKey).toBe(
      canonicalSceneKeyA,
    );
    expect(fullMove.deltaKind).toBe("full");
    expect(fullMove.renderPlan).toBe("queue-full-render");
    expect(fullMove.previousSceneKey).toBe(canonicalSceneKeyA);
    expect(newSceneHold.previousSceneKey).toBe(canonicalSceneKeyB);
    expect(newSceneHold.deltaKind).toBe("none");
    expect(newSceneHold.renderPlan).toBe("reuse-current");
    expect(persistedTurns.map((entry) => entry.turnIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("turn presentation persistence", () => {
  it("materializes the canonical presentation bundle for persisted turns", () => {
    const sampleTurn: PlayTurn = {
      id: "turn-presentation",
      turnIndex: 5,
      playerInput: "MOVE",
      scene: "Sample scene",
      resolution: "Success",
      resolutionJson: {
        outcome: "SUCCESS_WITH_COST",
        rollTotal: 8,
        resultLabel: "Success with Cost",
      },
      stateDeltas: [],
      ledgerAdds: [],
      createdAt: new Date().toISOString(),
    };
    sampleTurn.presentation = buildPlayTurnPresentation(sampleTurn);
    expect(sampleTurn.presentation).toEqual({
      resolution: {
        outcome: "SUCCESS_WITH_COST",
        rollLabel: "Roll: 2d6 → 8",
        resultLabel: "Success with Cost",
      },
      narration: null,
      ledgerEntries: [],
    });
  });
});
