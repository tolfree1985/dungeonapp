import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errorResponse";
import { getOptionalUser, isIdentityError, type AuthenticatedUser } from "@/lib/api/identity";
import { isRequestBodyTooLargeError, readJsonWithLimit } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { checkSoftRateLimit, softRateActorKey, softRateLimitTurnPostPerMinute } from "@/lib/api/softRateLimit";
import { BillingError } from "../../../src/lib/billing/errors";
import { estimateTokens } from "../../../src/lib/billing/estimate";
import {
  getOrClaimAdventureForUser,
  isAdventureOwnershipError,
} from "@/lib/adventure/ownership";
import {
  commitUsageAndRelease,
  preflightHoldOrThrow,
  releaseUsageAndLeaseBestEffort,
} from "../../../src/lib/billing/enforce";
import { monthKeyUtc } from "../../../src/lib/billing/monthKey";
import { coerceTier } from "../../../src/lib/billing/tiers";
import { runLegacyTurnFlow } from "@/server/turn/runLegacyTurnFlow";
import { executeTurn } from "@/server/turn/executeTurn";
import { runTurnPipeline } from "@/server/turn/runTurnPipeline";
import { reserveUsageDayLock } from "@/server/usage/reserveUsageDayLock";
import { turnPersistence } from "./turnDb";
import { logStructuredFailure } from "@/lib/turn/observability";
import { diffSceneVisualState, resolveSceneVisualState } from "@/lib/resolveSceneVisualState";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { findSceneArt, queueSceneArt, type RenderMode } from "@/lib/sceneArtRepo";
import { SceneArtPayload } from "@/lib/sceneArt";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { SceneArtStatus } from "@/generated/prisma";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { SceneTransition, resolveSceneTransition } from "@/lib/resolveSceneTransition";
import { buildFinalSceneArtContract, resolveFinalSceneArtRow } from "@/lib/scene-art/sceneArtContract";
import { resolveSceneTransitionMemory } from "@/lib/resolveSceneTransitionMemory";
import { resolveSceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import type {
  SceneCameraContinuityState,
  SceneCameraMemory,
  SceneTransitionMemory,
} from "@/lib/sceneTypes";
import { INITIAL_SCENE_CAMERA_CONTINUITY } from "@/lib/sceneTypes";
import { resolveSceneDirectorBehavior } from "@/lib/resolveSceneDirectorBehavior";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "@/lib/sceneTypes";
import { resolveSceneCameraEscalationDecision } from "@/lib/resolveSceneCameraEscalationDecision";
import type { SceneCameraEscalationDecision } from "@/lib/resolveSceneCameraEscalationDecision";
import {
  resolveTurnSceneArtPresentation,
  type PreviousSceneContinuity,
  type SceneArtRow,
  type ScenePresentation,
} from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneArtPriority } from "@/generated/prisma";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import {
  SceneContinuityBucket,
  SceneContinuityInfo,
  SceneContinuityReason,
} from "@/lib/sceneContinuityInfo";
import { buildSceneShotKey } from "@/lib/sceneShot";
import { hydrateContinuity } from "@/engine/continuity";
import { decideRender } from "@/engine/renderDecision";
import { persistShot } from "@/engine/shotPersistence";
import { logSceneMetrics } from "@/engine/metrics";
import { checkIdentityDrift, checkRenderAnomaly, checkRenderThrottle } from "@/engine/guards";
import { getCachedSceneArt, writeCachedSceneArt } from "@/engine/sceneCache";
import {
  assertContinuityReady,
  buildFallbackContinuity,
  finalizeContinuityInfo,
} from "@/server/scene/continuity";

import { deriveSceneIdentityFromTurnState } from "@/server/scene/derive-scene-identity";
import { resolveCanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";
import { buildSceneKey as buildSceneIdentityKey, decideSceneDeltaKind, type SceneIdentity } from "@/server/scene/scene-identity";
import { evaluateSceneArtVisualTrigger } from "@/lib/scene-art/visualTriggerIntegration";
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
import { applyTurnStateDeltas } from "@/server/scene/apply-turn-state-deltas";
import { resolveNpcSuspicionEffect } from "@/server/scene/npc-suspicion-effects";
import { resolvePositionPenaltyEffect } from "@/server/scene/position-penalty-effects";
import { resolveFailForwardStateDelta } from "@/server/scene/fail-forward-state-delta";
import { resolveSceneTimeEffect } from "@/server/scene/scene-time-effects";
import { resolveSceneClockPressure } from "@/server/scene/scene-clock-pressure";
import { resolveOpportunityWindow } from "@/lib/opportunity-window";
import { resolveOpportunityCost } from "@/lib/opportunity-cost";
import { resolveOpportunityCostEffect } from "@/server/scene/opportunity-cost-effects";
import { resolveResolutionCostEffect } from "@/server/scene/resolution-cost-effects";
import { resolveComplicationRiskEffect } from "@/server/scene/complication-risk-effects";
import { resolveComplicationOutcomeEffect } from "@/server/scene/complication-outcome-effects";
import { resolveFinalizedComplications } from "@/server/scene/complication-selection";
import { resolveFinalizedComplicationDeltas } from "@/server/scene/finalized-complication-deltas";
import { resolveNpcSuspicionStance } from "@/server/scene/npc-suspicion-stance";
import type { NpcSuspicionStance } from "@/server/scene/npc-suspicion-stance";
import { resolveNpcWatchfulness, type NpcWatchfulnessLevel } from "@/server/scene/npc-watchfulness";
import { CanonicalSceneArtState } from "@/lib/scene-art/canonicalSceneArtState";
import {
  normalizeIntentMode,
  resolveWatchfulnessActionFlags,
  type WatchfulnessActionFlags,
} from "@/lib/watchfulness-action-flags";
import { resolvePositionActionFlags, type PositionActionFlags } from "@/lib/position-action-flags";
import { resolveNoiseActionFlags, type NoiseActionFlags } from "@/lib/noise-action-flags";
import { applyWorldStateModifiers } from "@/lib/engine/applyWorldStateModifiers";
import { resolveComplicationWeight } from "@/server/scene/complication-weight";
import { resolveComplicationTier } from "@/server/scene/complication-tier";
import { resolveComplicationSelectionPolicy } from "@/server/scene/complication-selection-policy";
import { enforceComplicationPolicy } from "@/server/scene/enforce-complication-policy";
import { resolveOutcomeSeverity } from "@/server/scene/outcome-severity";
import { buildResolverLadder } from "@/server/scene/build-resolver-ladder";
import { assertSceneArtInvariant } from "@/lib/scene-art/assertSceneArtInvariant";
import {
  OutcomeTier,
  ResolvedTurn,
  resolveOutcomeTier,
  type StateDelta,
} from "@/lib/engine/resolveTurnContract";
import { classifyResolvedTurnDeltas } from "@/lib/engine/classifyResolvedTurnDeltas";
import { evaluatePressureThresholds } from "@/lib/engine/evaluatePressureThresholds";
import { inferPressureDeltas } from "@/lib/engine/inferPressureDeltas";
import { resolveActionEffects } from "@/lib/engine/resolveActionEffects";
import { validateResolvedTurnContract } from "@/lib/engine/validateResolvedTurnContract";

function summarizePressureDeltas(deltas: StateDelta[]) {
  const summary = {
    suspicion: 0,
    noise: 0,
    time: 0,
    danger: 0,
  };
  for (const delta of deltas) {
    if (delta.kind !== "pressure.add") continue;
    const domain = delta.domain as keyof typeof summary;
    if (domain in summary) {
      summary[domain] += delta.amount;
    }
  }
  return summary;
}

function computeTimeAdvanceDelta(current: number, previous: number): number {
  return Math.max(0, current - previous);
}

function buildCanonicalSceneArtResponse(input: {
  sceneKey: string | null;
  promptHash: string | null;
  status: string;
  imageUrl: string | null;
}): CanonicalSceneArtState | null {
  const { sceneKey, promptHash, status, imageUrl } = input;
  if (!sceneKey || !promptHash) {
    return null;
  }
  return {
    sceneKey,
    promptHash,
    status,
    imageUrl,
    hasReadyImage: status === "ready" && Boolean(imageUrl),
  };
}

function logFinalSceneArtContract(responseBody: { sceneArt?: CanonicalSceneArtState | null }) {
  console.log("api.turn.final_scene_art_contract", {
    hasSceneArt: !!responseBody.sceneArt,
    sceneKey: responseBody.sceneArt?.sceneKey ?? null,
    promptHash: responseBody.sceneArt?.promptHash ?? null,
    status: responseBody.sceneArt?.status ?? null,
  });
}
import { buildFinalizedConsequenceResult } from "@/server/scene/finalized-consequence-result";
import { buildFinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";
import { projectLedgerEntries } from "@/server/scene/ledger-presentation";
import {
  buildTurnResolutionPresentation,
  type TurnResolutionOutcome,
} from "@/server/scene/turn-resolution-presentation";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import { resolveOpportunityResolutionModifier } from "@/lib/opportunity-resolution-modifier";
import type { OpportunityWindowState } from "@/lib/opportunity-window";

let sceneRenderSkippedCount = 0;
let sceneRenderQueuedCount = 0;
let sceneRenderLogCount = 0;
let sceneRenderSkippedTotal = 0;
let sceneRenderQueuedTotal = 0;
const renderReasonCounters = {
  fullSceneChange: 0,
  cameraChange: 0,
  subjectChange: 0,
  environmentChange: 0,
  degradedContinuity: 0,
};

type PostBody = {
  adventureId: string;
  playerText: string;
  action?: string;
  tags?: string[];
  rollTotal?: number;
  tier?: string;
  idempotencyKey?: string;
};

type StubModelResult = {
  scene: string;
  resolution: { notes: string; max_tokens: number };
  outputTokens: number;
};

type BudgetExceededCode = "CONCURRENCY_LIMIT_EXCEEDED" | "MONTHLY_TOKEN_CAP_EXCEEDED";
type TurnApiErrorCode = BudgetExceededCode | "RATE_LIMITED";


function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function shortKey(prefix: string, input: string): string {
  return `${prefix}_${hashHex(input).slice(0, 24)}`;
}

function parseRetryAt(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coalesceUnknownArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function readStateTime(state: Record<string, unknown> | null): number {
  const world = asRecord(state?.world);
  if (world && typeof world.time === "number" && Number.isFinite(world.time)) {
    return world.time;
  }
  const stats = asRecord(state?.stats);
  if (stats && typeof stats.time === "number" && Number.isFinite(stats.time)) {
    return stats.time;
  }
  if (state && typeof state.turns === "number" && Number.isFinite(state.turns)) {
    return state.turns;
  }
  return 0;
}

function readSection(state: Record<string, unknown> | null, key: string): unknown {
  if (!state) return null;
  if (state[key] !== undefined) return state[key];
  const player = asRecord(state.player);
  if (player?.[key] !== undefined) return player[key];
  return null;
}

function safeTurnErrorPayload(args: {
  error: string;
  code: TurnApiErrorCode;
  extra?: Record<string, unknown>;
}) {
  return {
    error: args.error,
    code: args.code,
    ...(args.extra ?? {}),
  };
}

function describeSceneTransition(transition: SceneTransition): string {
  switch (transition.type) {
    case "hold":
      return "The camera holds steady on the familiar scene.";
    case "advance":
      return "The scene advances while the subject remains in focus.";
    case "cut":
      return "A new composition takes over the frame.";
    case "reset":
      return "The scene resets into a fresh establishing shot.";
    default:
      return "A new composition takes over the frame.";
  }
}

export async function persistSceneTransitionMemory(args: {
  db: PrismaClient;
  adventureId: string;
  transitionMemory: SceneTransitionMemory;
  continuityState?: SceneCameraContinuityState | null;
}) {
  const update: Record<string, unknown> = {
    sceneTransitionMemory: args.transitionMemory,
  };
  if (args.continuityState !== undefined) {
    update.sceneCameraContinuityState = args.continuityState;
  }
  await args.db.adventure.update({
    where: { id: args.adventureId },
    data: update,
  });
}

const SHOT_SCALE_ORDER: SceneFramingState["shotScale"][] = ["wide", "medium", "close"];

function tightenShotScale(
  current: SceneFramingState["shotScale"],
  delta: 0 | 1,
): SceneFramingState["shotScale"] {
  if (delta <= 0) return current;
  const index = SHOT_SCALE_ORDER.indexOf(current);
  if (index < 0 || index >= SHOT_SCALE_ORDER.length - 1) return current;
  return SHOT_SCALE_ORDER[Math.min(index + delta, SHOT_SCALE_ORDER.length - 1)];
}

function deriveRenderPriority(
  transition: SceneTransition | null,
  escalation: SceneCameraEscalationDecision | null,
): SceneArtPriority {
  if (!transition) return "low";
  if (transition.type === "cut") return "critical";
  if (escalation?.shouldEscalateCamera) return "high";
  if (transition.type === "advance") return "normal";
  return "low";
}

export async function orchestrateLegacySceneArtDecision(args: {
  sceneArtPayload: SceneArtPayload | null;
  refreshDecision: SceneRefreshDecision | null;
  existingSceneArt: SceneArtRow | null;
  queueSceneArt: typeof queueSceneArt;
  renderPriority?: SceneArtPriority;
  renderMode?: RenderMode;
}): Promise<SceneArtRow | null> {
  const { sceneArtPayload, refreshDecision, existingSceneArt, queueSceneArt, renderPriority = "normal" } = args;
  if (!sceneArtPayload) return existingSceneArt ? { ...existingSceneArt } : null;
  if (existingSceneArt) return { ...existingSceneArt };
  const renderMode = args.renderMode ?? "full";
  if (refreshDecision?.shouldQueueRender) {
    const queued = await queueSceneArt(sceneArtPayload, ENGINE_VERSION, renderPriority, renderMode);
    return {
      sceneKey: sceneArtPayload.sceneKey,
      status: queued.status,
      imageUrl: queued.imageUrl,
      id: queued.id,
    };
  }
  return null;
}

async function runModelStub(args: { prompt: string; max_tokens: number }): Promise<StubModelResult> {
  const scene = `You pause at the cellar door. (Stub model, max_tokens=${args.max_tokens})`;
  const resolution = { notes: "Stub response.", max_tokens: args.max_tokens };
  const outputTokens = Math.min(args.max_tokens, estimateTokens(`${scene} ${JSON.stringify(resolution)}`));
  return { scene, resolution, outputTokens };
}

type PostHandlerDeps = {
  executeTurn?: typeof executeTurn;
  prismaClient?: PrismaClient;
  getUser?: (request: Request) => AuthenticatedUser;
  preflightHold?: typeof preflightHoldOrThrow;
};

export async function postTurn(req: Request, deps: PostHandlerDeps = {}) {
  const db = deps.prismaClient ?? prisma;
  const reserveBudget = deps.preflightHold ?? preflightHoldOrThrow;
  let holdKey = "";
  let leaseKeyForCleanup = "";
  let requestBody: Partial<PostBody> | null = null;
  let user: AuthenticatedUser | null = deps.getUser ? deps.getUser(req) : getOptionalUser(req);
  let renderMode: RenderMode = "full";
  let failForwardComplication: string | null = null;
  let opportunityResolutionModifier: string | null = null;
  let opportunityCost: string | null = null;

  if (!user && process.env.NODE_ENV !== "production") {
    user = { id: "dev-user", authMethod: "session" } as AuthenticatedUser;
  }

  if (!user) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await readJsonWithLimit<Partial<PostBody>>(req)) as Partial<PostBody>;
    requestBody = body;

    const logInvalidRequest = (reason: string) => {
      console.log("turn.request.invalid", {
        body,
        reason,
      });
    };

    if ("save_id" in (body ?? {}) || "player_input" in (body ?? {})) {
      logInvalidRequest("use adventureId and playerText");
      return errorResponse(400, "Use adventureId and playerText");
    }
    if (!body?.adventureId || typeof body.adventureId !== "string") {
      logInvalidRequest("missing/invalid adventureId");
      return errorResponse(400, "Missing/invalid adventureId");
    }
    if (!body?.playerText || typeof body.playerText !== "string") {
      logInvalidRequest("missing/invalid playerText");
      return errorResponse(400, "Missing/invalid playerText");
    }
    const action = typeof body.action === "string" ? body.action : null;
    const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string") : [];
    const rollTotal = typeof body.rollTotal === "number" && Number.isFinite(body.rollTotal) ? body.rollTotal : null;

    const adventureId: string = body.adventureId;
    const playerText: string = body.playerText;
    const normalizedInput = playerText.trim().toLowerCase();
    const requestedMode = normalizeIntentMode(typeof body.mode === "string" ? body.mode : null);
    if (!requestedMode) {
      logInvalidRequest("missing/invalid mode");
      return errorResponse(400, "Missing/invalid mode");
    }
    const playerIntentMode: IntentMode = requestedMode;
    // note: action/tags/rollTotal already derived above

    const now = new Date();
    const userId = user.id;
    const isDevSim = userId === "dev-user";
    let ownership;
    try {
      ownership = await getOrClaimAdventureForUser({
        db,
        adventureId,
        userId,
      });
    } catch (error) {
      if (isAdventureOwnershipError(error)) {
        console.log("turn.request.forbidden", {
          reason: error.code,
          adventureId,
          userId,
        });
        return errorResponse(error.status, error.code);
      }
      throw error;
    }

    if (!ownership.adventure) {
      return errorResponse(404, "Adventure not found");
    }
    if (userId === "dev-user") {
      console.log("turn.dev.bypass.v2", {
        adventureId,
        userId,
      });
    } else {
      const adventureRow = ownership.adventure as { ownerId?: string | null; userId?: string | null };
      const ownerId = adventureRow.ownerId ?? adventureRow.userId ?? null;
      if (ownerId !== userId) {
        console.log("turn.request.forbidden.v2", {
          reason: "ADVENTURE_FORBIDDEN",
          adventureId,
          userId,
          ownerId,
          isDevSim: false,
        });
        return errorResponse(403, "ADVENTURE_FORBIDDEN");
      }
    }

    // Dev-only bypass for smoke/budget harness traffic.
    const smokeBypassHeader = req.headers.get("x-smoke-bypass-soft-rate-limit");
    const smokeBypassRateLimit = process.env.NODE_ENV !== "production" && smokeBypassHeader === "1";
    let softRateResult: { allowed: boolean; retryAfterMs?: number; reason?: string } | null = null;
    let softRateAllowed = true;
    if (!smokeBypassRateLimit && !isDevSim) {
      const rateLimit = checkSoftRateLimit({
        action: "turn_post",
        actorKey: softRateActorKey(req, userId),
        limitPerMinute: softRateLimitTurnPostPerMinute(),
      });
      softRateAllowed = rateLimit.allowed;
      softRateResult = {
        allowed: softRateAllowed,
        retryAfterMs: Number(rateLimit.retryAfterSeconds) * 1000,
        reason: "soft limit",
      };
      if (!softRateAllowed) {
        console.log("turn.request.rate_limited", {
          adventureId,
          userId,
          isDevSim,
          softRateAllowed,
          usageAllowed: true,
        });
        return NextResponse.json(
          safeTurnErrorPayload({
            error: "RATE_LIMITED",
            code: "RATE_LIMITED",
          }),
          {
            status: 429,
            headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
          },
        );
      }
    } else {
      softRateResult = { allowed: true };
    }
    const tier = coerceTier(body.tier);
    const monthKey = monthKeyUtc(now);

    // Prefer client idempotency, else deterministic hash
    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : hashHex(`${adventureId}|${userId}|${tier}|${monthKey}|${playerText}|${action ?? ""}|${tags.join(",")}|${rollTotal ?? ""}`);

    // Idempotency replay: if we've already applied this idempotencyKey for this adventure,
    // return the previously persisted payload and do NOT re-run billing or create new Turn/TurnEvent.
    const prevApplied = await db.turnEvent.findFirst({
      where: {
        adventureId,
        idempotencyKey,
        status: "APPLIED",
      },
      orderBy: { seq: "desc" },
    });

    let sceneArtResult: CanonicalSceneArtState | null = null;

    if (prevApplied?.turnJson) {
      try {
        const parsed = JSON.parse(prevApplied.turnJson as string) as Record<string, unknown>;
        const replayStateDeltas = coalesceUnknownArray(parsed.stateDeltas, (parsed as any)?.turn?.stateDeltas);
        const replayLedgerAdds = coalesceUnknownArray(parsed.ledgerAdds, (parsed as any)?.turn?.ledgerAdds);

        const parsedTurn =
          parsed.turn && typeof parsed.turn === "object"
            ? {
                ...(parsed.turn as Record<string, unknown>),
                stateDeltas: asUnknownArray((parsed as any)?.turn?.stateDeltas),
                ledgerAdds: asUnknownArray((parsed as any)?.turn?.ledgerAdds),
              }
            : undefined;

        return NextResponse.json(
          {
            ok: true,
            replayed: true,
            ...parsed,
            action: parsed.action ?? action ?? null,
            tags: Array.isArray(parsed.tags) ? parsed.tags : tags,
            rollTotal: parsed.rollTotal ?? rollTotal ?? null,
            ...(parsedTurn ? { turn: parsedTurn } : {}),
            stateDeltas: replayStateDeltas,
            ledgerAdds: replayLedgerAdds,
          },
          { status: 200 }
        );
      } catch {
        // If turnJson is unexpectedly not JSON, still return a safe replay response.
        const persistedAdventureState = await db.adventure.findUnique({
          where: { id: adventureId },
          select: { state: true },
        });
        const persistedLatestTurn = await db.turn.findFirst({
          where: { adventureId },
          orderBy: { turnIndex: "desc" },
        });
        const persistedStateRecord = asRecord(persistedAdventureState?.state ?? null);
        const persistedVisualState = resolveSceneVisualState(persistedStateRecord);
        const persistedFramingState = resolveSceneFramingState({
          turn: persistedLatestTurn,
          visual: persistedVisualState,
          locationChanged: false,
        });
        const persistedSubjectState = resolveSceneSubjectState({
          state: persistedStateRecord,
          framing: persistedFramingState,
        });
        const persistedActorState = resolveSceneActorState({
          state: persistedStateRecord,
          subject: persistedSubjectState,
        });
        const persistedLatestTurnDebug = (asRecord(persistedLatestTurn?.debug ?? null) ?? {}) as Record<
          string,
          unknown
        >;
        const persistedLatestContinuityInfo =
          (persistedLatestTurnDebug?.sceneContinuityInfo as SceneContinuityInfo | null) ?? null;
        const fallbackTurnIndex = (persistedLatestTurn?.turnIndex ?? 0) + 1;
        const fallbackSceneContinuity = null;
        if (fallbackSceneContinuity && persistedLatestTurn?.id) {
          await db.turn.update({
            where: { id: persistedLatestTurn.id },
            data: {
              debug: {
                ...persistedLatestTurnDebug,
                sceneContinuityInfo: fallbackSceneContinuity,
              },
            },
          });
        }
        const persistedScenePresentation = persistedLatestTurnDebug?.scenePresentation as Record<string, unknown> | null;
        const persistedSceneIdentity = persistedLatestTurnDebug?.sceneIdentity as Record<string, unknown> | null;
        const persistedSceneContinuity = persistedLatestTurnDebug?.sceneContinuityInfo as Record<string, unknown> | null;
        const replaySceneKey =
          (typeof persistedSceneIdentity?.sceneKey === "string" && persistedSceneIdentity.sceneKey) ??
          (typeof persistedScenePresentation?.currentSceneKey === "string" && persistedScenePresentation.currentSceneKey) ??
          (typeof persistedSceneContinuity?.sceneKey === "string" && persistedSceneContinuity.sceneKey) ??
          null;
        const replayPromptHash =
          (typeof persistedSceneIdentity?.promptHash === "string" && persistedSceneIdentity.promptHash) ??
          (typeof persistedScenePresentation?.promptHash === "string" && persistedScenePresentation.promptHash) ??
          (typeof persistedSceneContinuity?.promptHash === "string" && persistedSceneContinuity.promptHash) ??
          null;
        const existingSceneArtRow =
          replaySceneKey && replayPromptHash
            ? await db.sceneArt.findUnique({
                where: {
                  sceneKey_promptHash: {
                    sceneKey: replaySceneKey,
                    promptHash: replayPromptHash,
                  },
                },
              })
            : null;
        const finalSceneArtRow = await resolveFinalSceneArtRow({
          existingSceneArt: existingSceneArtRow,
          refreshDecision: null,
          sceneArtPayload: null,
          renderPriority: "normal",
          renderMode: "full",
          engineVersion: ENGINE_VERSION,
        });

        const finalSceneArt = buildFinalSceneArtContract(finalSceneArtRow);
        console.log("turn.mode.summary", {
          mode: playerIntentMode ?? null,
          actionTags: [],
          progressDetected: null,
          costDetected: null,
        });
        console.log("turn.outcome.classification", {
          rawRoll: rollTotal ?? null,
          effectiveRollTotal: null,
          difficulty: null,
          margin: null,
          progressDetected: null,
          costDetected: null,
          selectedTier: null,
          modifiers: null,
          actionTags: [],
        });
        console.log("turn.debug.summary", {
          playerIntentMode,
          normalizedInput: playerText?.trim().toLowerCase() ?? null,
          outcomeTier: null,
          rawRoll: rollTotal ?? null,
          effectiveRollTotal: null,
          difficulty: null,
          margin: null,
          actionTags: [],
          authoredDeltaKinds: [],
          authoredLedgerCount: 0,
          hasProgress: null,
          hasCost: null,
        });
        console.log("TURN_SCENE_ART_RETURN (replay)", finalSceneArt);
        const responseBody = {
          ok: true,
          replayed: true,
          idempotencyKey,
          turnEventId: prevApplied.eventId,
          action: action ?? null,
          tags,
          rollTotal: rollTotal ?? null,
          stateDeltas: [],
          ledgerAdds: [],
          sceneArt: finalSceneArt,
          sceneContinuity: fallbackSceneContinuity,
        };
        logFinalSceneArtContract(responseBody);
        return NextResponse.json(responseBody, { status: 200 });
      }
    }

    holdKey = shortKey("hold", idempotencyKey);

    // IMPORTANT: lease must be per adventure+user for real concurrency gating
    const leaseKey = hashHex(`lease|${userId}|${adventureId}`);
    leaseKeyForCleanup = leaseKey;

    const estInputTokens = estimateTokens(playerText);
    // Dev-only: allow smoke harness to clamp monthly cap for deterministic cap-exceed test.
    const capOverrideHeader = req.headers.get("x-smoke-cap-override");
    const capOverrideTokens =
      process.env.NODE_ENV !== "production" && capOverrideHeader ? Number(capOverrideHeader) : undefined;

    const previousAdventureStateRow = await db.adventure.findUnique({
      where: { id: adventureId },
      select: {
        state: true,
        sceneTransitionMemory: true,
        sceneCameraContinuityState: true,
      },
    });
    const previousTransitionMemory: SceneTransitionMemory | null =
      (previousAdventureStateRow?.sceneTransitionMemory as SceneTransitionMemory | null) ?? null;
    const previousContinuityState: SceneCameraContinuityState =
      (previousAdventureStateRow?.sceneCameraContinuityState as SceneCameraContinuityState | null) ??
      INITIAL_SCENE_CAMERA_CONTINUITY;
    const previousStateRecord = asRecord(previousAdventureStateRow?.state ?? null);
    const previousStatsRecord = asRecord(previousStateRecord?.stats ?? null);
    const previousNoise = Number(previousStatsRecord?.noise ?? 0);
    const previousNpcSuspicion = Number(previousStatsRecord?.npcSuspicion ?? 0);
    const previousPositionPenalty = Number(previousStatsRecord?.positionPenalty ?? 0);
    const previousTimeAdvance = Number(previousStatsRecord?.timeAdvance ?? 0);
    let timeAdvanceDelta = 0;
    const previousSceneClock = Number(previousStateRecord?.sceneClock ?? 0);
    const previousWatchfulness =
      (previousStateRecord?.watchfulness as NpcWatchfulnessLevel | undefined) ?? "normal";
    const previousPositionActionFlags = resolvePositionActionFlags(previousPositionPenalty);
    const previousNoiseActionFlags = resolveNoiseActionFlags(previousNoise);
    let preflight;
    try {
      preflight = await db.$transaction((tx) =>
        reserveBudget(tx, {
          userId,
          adventureId,
          tier,
          holdKey,
          leaseKey,
          monthKey,
          now,
          estInputTokens,
          capOverrideTokens,
        })
      );
    } catch (err) {
      const be = err as unknown;
      if (be instanceof BillingError) {
        const details = (be as any).details ?? {};
        const code: BudgetExceededCode =
          be.code === "MONTHLY_TOKEN_CAP_EXCEEDED" ? "MONTHLY_TOKEN_CAP_EXCEEDED" : "CONCURRENCY_LIMIT_EXCEEDED";
        const retryAt =
          parseRetryAt(details?.retryAt) ??
          (code === "MONTHLY_TOKEN_CAP_EXCEEDED"
            ? new Date(new Date().getTime() + 60_000)
            : new Date(new Date().getTime() + 1_000));
        console.log("turn.request.rate_limited", {
          adventureId,
          userId,
          isDevSim,
          softRateAllowed,
          usageAllowed: false,
        });
        return NextResponse.json(
          safeTurnErrorPayload({
            error: "BUDGET_EXCEEDED",
            code,
            extra: {
              retryAt: retryAt.toISOString(),
              idempotencyKey,
              tier,
              monthKey,
              cap: details?.cap ?? null,
              used: details?.used ?? null,
              reserved: details?.reserved ?? null,
              requestedReserve: details?.requestedReserve ?? null,
            },
          }),
          { status: 429 }
        );
      }
      throw err;
    }

    const testLatencyMs = Number(process.env.BILLING_TEST_LATENCY_MS ?? "0");
    if (testLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, testLatencyMs));
    }

    // Dev-only: allow smoke harness to force real overlap for concurrency tests.
    const sleepMsHeader = req.headers.get("x-smoke-sleep-ms");
    const sleepMs = sleepMsHeader ? Number(sleepMsHeader) : 0;
    if (process.env.NODE_ENV !== "production" && Number.isFinite(sleepMs) && sleepMs > 0) {
      await new Promise((r) => setTimeout(r, sleepMs));
    }

    const model = await runModelStub({
      prompt: playerText,
      max_tokens: preflight.perTurnMaxOutputTokens,
    });
    const executor = deps.executeTurn ?? executeTurn;
    const finalized = await executor({
      userId,
      adventureId,
      idempotencyKey,
      normalizedInput: playerText,
      softRate: softRateResult,
      adventureLocked: false,
      usageVerdict: null,
      legacy: {
        args: {
          prisma: db,
          userId,
          adventureId,
          idempotencyKey,
          playerText,
          model,
          preflightMaxTokens: preflight.perTurnMaxOutputTokens,
          monthKey,
          holdKey,
          leaseKey,
          estInputTokens,
        },
        deps: {
          hashHex,
          asUnknownArray,
          commitUsageAndRelease,
        },
      },
      pipeline: {
        args: {
          userId,
          adventureId,
          idempotencyKey,
          normalizedInput: playerText,
          prisma: db,
          model,
          preflightMaxTokens: preflight.perTurnMaxOutputTokens,
          monthKey,
          holdKey,
          leaseKey,
          estInputTokens,
        },
        deps: {
          reserveUsageDayLock,
          hashHex,
          asUnknownArray,
          commitUsageAndRelease,
          generateTurn: async (tx, input) =>
            runModelStub({ prompt: input.normalizedInput, max_tokens: input.preflightMaxTokens }),
          persistTurn: async (args, tx) => turnPersistence(args, tx),
        },
      },
    });

    const turnStateDeltas = asUnknownArray((finalized as any)?.turn?.stateDeltas);
    const turnLedgerAdds = asUnknownArray((finalized as any)?.turn?.ledgerAdds);

    const updatedAdventureState = await db.adventure.findUnique({
      where: { id: adventureId },
      select: { state: true },
    });
    const stateRecord = asRecord(updatedAdventureState?.state ?? null);
    applyTurnStateDeltas(stateRecord, turnStateDeltas);
    const currentStatsAfterDeltas = asRecord(stateRecord.stats) ?? {};
    const currentTimeAdvanceAfterDeltas = Number(currentStatsAfterDeltas.timeAdvance ?? 0);
    timeAdvanceDelta = computeTimeAdvanceDelta(currentTimeAdvanceAfterDeltas, previousTimeAdvance);
    const currentSceneClockBefore = Number(stateRecord.sceneClock ?? 0);
    const currentSceneClock = currentSceneClockBefore + timeAdvanceDelta;
    stateRecord.sceneClock = currentSceneClock;
    const currentSceneIdentity = deriveSceneIdentityFromTurnState(stateRecord);
    const previousSceneIdentity =
      previousStateRecord !== null ? deriveSceneIdentityFromTurnState(previousStateRecord) : null;
    const identityMinutesElapsed = Math.max(
      0,
      readStateTime(stateRecord) - readStateTime(previousStateRecord),
    );
    const derivedSceneDeltaKind: SceneDeltaKind = decideSceneDeltaKind({
      previous: previousSceneIdentity,
      current: currentSceneIdentity,
      minutesElapsed: identityMinutesElapsed,
      detailOnlyChange: false,
    });
    const identityChangedAnchors = describeSceneIdentityChanges(previousSceneIdentity, currentSceneIdentity);
    const currentSceneIdentityKey = buildSceneIdentityKey(currentSceneIdentity);
    const previousSceneIdentityKey = previousSceneIdentity
      ? buildSceneIdentityKey(previousSceneIdentity)
      : null;
    const latestTurn = await db.turn.findFirst({
      where: { adventureId },
      orderBy: { turnIndex: "desc" },
    });
    const previousTurn =
      latestTurn && typeof latestTurn.turnIndex === "number" && latestTurn.turnIndex > 0
        ? await db.turn.findFirst({
            where: { adventureId, turnIndex: latestTurn.turnIndex - 1 },
            select: { id: true, turnIndex: true, debug: true },
          })
        : null;
    const previousTurnDebug = previousTurn ? asRecord(previousTurn.debug ?? null) : null;
    const previousTurnSceneContinuityInfo =
      (previousTurnDebug?.sceneContinuityInfo as SceneContinuityInfo | null) ?? null;
    const previousVisualState = previousStateRecord
      ? resolveSceneVisualState(previousStateRecord)
      : null;
    const previousFramingState =
      previousTurn && previousVisualState
        ? resolveSceneFramingState({
            turn: previousTurn,
            visual: previousVisualState,
            locationChanged: false,
          })
        : null;
    const previousSubjectState =
      previousFramingState && previousStateRecord
        ? resolveSceneSubjectState({
            state: previousStateRecord,
            framing: previousFramingState,
          })
        : null;
    const previousActorState =
      previousSubjectState && previousStateRecord
        ? resolveSceneActorState({
            state: previousStateRecord,
            subject: previousSubjectState,
          })
        : null;
    const previousFocusState =
      previousActorState && previousFramingState && previousStateRecord
        ? resolveSceneFocusState({
            state: previousStateRecord,
            framing: previousFramingState,
            subject: previousSubjectState,
            actor: previousActorState,
          })
        : null;
    const previousSceneComposition =
      previousVisualState &&
      previousFramingState &&
      previousSubjectState &&
      previousActorState &&
      previousFocusState
        ? {
            visual: previousVisualState,
            framing: previousFramingState,
            subject: previousSubjectState,
            actor: previousActorState,
            focus: previousFocusState,
          }
        : null;
    const previousComposition = previousVisualState
      ? {
          visual: previousVisualState,
        }
      : null;
    const previousSceneContinuity = await hydrateContinuity({
      previousTurn,
      previousStateRecord,
      previousTurnSceneContinuityInfo,
    });
    const previousShotDuration = previousTurnSceneContinuityInfo?.shotDuration ?? 0;
    const previousShotKey = previousSceneContinuity.shotKey ?? null;
    const hydratedPreviousSceneIdentityKey =
      previousSceneIdentity ? buildSceneIdentityKey(previousSceneIdentity) : previousSceneContinuity.identityKey ?? null;
    console.log("scene.previousTurn.lookup", {
      adventureId,
      turnIndex: latestTurn?.turnIndex ?? null,
      previousTurnFound: Boolean(previousTurn),
      previousTurnHasContinuityInfo: Boolean(previousTurnSceneContinuityInfo),
      hydratedPreviousSceneKey: previousSceneContinuity?.sceneKey ?? null,
      hydratedPreviousIdentityKey: hydratedPreviousSceneIdentityKey,
    });
    const hasPreviousSceneContinuity =
      Boolean(previousSceneContinuity.sceneKey) ||
      Boolean(previousSceneContinuity.canonicalPayload) ||
      Boolean(previousSceneContinuity.sceneArt);
    const hasPreviousSceneArt = Boolean(previousSceneContinuity.sceneArt);
    const previousCanonicalKey = previousSceneContinuity.sceneKey ?? null;
    console.log("scene.continuity.hydration", {
      previousTurnIndex: previousTurn?.turnIndex ?? null,
      previousTurnSceneKey: previousTurnSceneContinuityInfo?.sceneKey ?? null,
      hasPreviousContinuityInfo: hasPreviousSceneContinuity,
      hasPreviousCanonicalPayload: Boolean(previousSceneContinuity.canonicalPayload),
      hasPreviousSceneArt,
      hydratedPreviousSceneKey: previousSceneContinuity.sceneKey ?? null,
    });
    const nextVisualState = resolveSceneVisualState(stateRecord);
    const nextFramingState = resolveSceneFramingState({
      turn: latestTurn,
      visual: nextVisualState,
      locationChanged: false,
    });
    const nextSubjectState = resolveSceneSubjectState({
      state: stateRecord,
      framing: nextFramingState,
    });
    const nextActorState = resolveSceneActorState({
      state: stateRecord,
      subject: nextSubjectState,
    });
    const nextFocusState = resolveSceneFocusState({
      state: stateRecord,
      framing: nextFramingState,
      subject: nextSubjectState,
      actor: nextActorState,
    });
    const currentShotIdentity = {
      frameKind: nextFramingState.frameKind,
      shotScale: nextFramingState.shotScale,
      cameraAngle: nextFramingState.cameraAngle,
      subjectFocus: nextFramingState.subjectFocus,
      primarySubjectId: nextSubjectState.primarySubjectId,
    };
    const currentShotKey = buildSceneShotKey(currentShotIdentity);
    const shotPersisted = previousShotKey !== null && currentShotKey === previousShotKey;
    const shouldReuseCachedPayload =
      shotPersisted &&
      previousSceneContinuity.canonicalPayload &&
      typeof previousSceneContinuity.canonicalPayload.promptHash === "string" &&
      previousSceneContinuity.canonicalPayload.promptHash.length > 0;
    const canonicalSceneArtPayload = shouldReuseCachedPayload
      ? previousSceneContinuity.canonicalPayload!
      : buildCanonicalSceneArtPayload({
          turn: latestTurn,
          state: stateRecord,
        });
    if (canonicalSceneArtPayload && !canonicalSceneArtPayload.promptHash) {
      throw new Error("scene-art invariant violated: canonical payload missing promptHash");
    }
    const sceneIdentity =
      canonicalSceneArtPayload?.sceneKey && canonicalSceneArtPayload?.promptHash
        ? {
            sceneKey: canonicalSceneArtPayload.sceneKey,
            promptHash: canonicalSceneArtPayload.promptHash,
          }
        : null;
    const canonicalSceneIdentityLog = {
      sceneKey: sceneIdentity?.sceneKey ?? null,
      promptHash: sceneIdentity?.promptHash ?? null,
    };
    console.log("scene.identity.canonical_source", canonicalSceneIdentityLog);
    if (canonicalSceneArtPayload && !sceneIdentity) {
      console.error("scene.identity.invalid", {
        sceneKey: canonicalSceneArtPayload.sceneKey ?? null,
        promptHash: canonicalSceneArtPayload.promptHash ?? null,
      });
    }
    const sceneArtPayload = canonicalSceneArtPayload;
    if (sceneArtPayload) {
      void runSceneArtTriggerIntegration({
        sceneArtPayload,
        previousState: previousStateRecord,
        currentState: stateRecord,
        previousSceneIdentity,
        currentSceneIdentity,
        latestTurnScene: latestTurn?.scene ?? null,
        renderMode,
      });
    }
    const { shotDuration } = persistShot({
      previousShotKey,
      currentShotKey,
      previousShotDuration,
      shotPersisted,
    });
    const maybeCacheSceneArt = async (sceneArt: SceneArtRow | null) => {
      if (!sceneArt || !sceneArt.id || !sceneArtPayload || !currentShotKey) return;
      await writeCachedSceneArt(sceneArtPayload.sceneKey, currentShotKey, sceneArt.id);
    };
    const cachedSceneArt =
      sceneArtPayload && currentShotKey
        ? await getCachedSceneArt(sceneArtPayload.sceneKey, currentShotKey)
        : null;
    const sceneArtLookup = sceneIdentity
      ? { sceneKey: sceneIdentity.sceneKey, promptHash: sceneIdentity.promptHash }
      : null;
    let existingSceneArt =
      cachedSceneArt ??
      (sceneArtLookup ? await findSceneArt(sceneArtLookup) : null);
    if (!cachedSceneArt && existingSceneArt) {
      await maybeCacheSceneArt(existingSceneArt);
    }
    if (shotPersisted) {
      console.info("scene.shot.persisted", {
        shotKey: currentShotKey,
        previousShotKey,
        sceneKey: sceneArtPayload?.sceneKey ?? null,
      });
    }
    const currentCameraMemory = {
      shotScale: nextFramingState.shotScale,
      cameraAngle: nextFramingState.cameraAngle,
      frameKind: nextFramingState.frameKind,
      subjectFocus: nextFramingState.subjectFocus,
    };
    const memoryShouldRefresh = derivedSceneDeltaKind !== "none";
    const nextCameraMemory =
      memoryShouldRefresh || !previousContinuityState.cameraMemory
        ? currentCameraMemory
        : previousContinuityState.cameraMemory;
    const basePresentation = sceneArtPayload
      ? resolveTurnSceneArtPresentation({
          turn: latestTurn,
          state: stateRecord,
          resolvedSceneState: {
            visualState: nextVisualState,
            framingState: nextFramingState,
            subjectState: nextSubjectState,
            actorState: nextActorState,
            focusState: nextFocusState,
          },
          previousSceneComposition: previousSceneComposition,
          previousSceneArt: existingSceneArt,
          previousTransitionMemory,
          previousSceneContinuity,
          pressureStage: nextVisualState.pressureStage ?? null,
          modelStatus: "ok",
          sceneDeltaKind: derivedSceneDeltaKind,
          cameraMemory: nextCameraMemory,
          previousDirectorDecision: previousContinuityState.directorMemory,
        })
      : {
        canonicalPayload: null,
        sceneTransition: null,
        refreshDecision: null,
        transitionMemory: previousTransitionMemory ?? EMPTY_SCENE_TRANSITION_MEMORY,
        sceneArtResult: null,
        shouldCreateSceneArt: false,
        scenePresentation: null,
        sceneDeltaKind: derivedSceneDeltaKind,
      };
    let presentation = basePresentation;
    let continuityState = previousContinuityState;
    let escalation: SceneCameraEscalationDecision | null = null;
    if (sceneArtPayload) {
      escalation = resolveSceneCameraEscalationDecision({
        transitionType: basePresentation.sceneTransition?.type ?? null,
        transitionMemory: basePresentation.transitionMemory,
        currentFraming: nextFramingState,
        currentFocus: nextFocusState,
        pressureStage: nextVisualState.pressureStage ?? null,
        previousContinuityState,
      });
      const nextDirectorMemory = presentation.scenePresentation?.directorDecision ?? previousContinuityState.directorMemory;
      continuityState = {
        ...escalation.nextContinuityState,
        cameraMemory: nextCameraMemory,
        directorMemory: nextDirectorMemory,
      };
      if (escalation.shouldEscalateCamera && escalation.preferredScaleDelta > 0) {
        const tightenedFramingState = tightenShotScale(nextFramingState, escalation.preferredScaleDelta);
        const tightenedFocusState = resolveSceneFocusState({
          state: stateRecord,
          framing: tightenedFramingState,
          subject: nextSubjectState,
          actor: nextActorState,
        });
        presentation = resolveTurnSceneArtPresentation({
          turn: latestTurn,
          state: stateRecord,
          resolvedSceneState: {
            visualState: nextVisualState,
            framingState: tightenedFramingState,
            subjectState: nextSubjectState,
            actorState: nextActorState,
            focusState: tightenedFocusState,
          },
          previousSceneComposition: previousSceneComposition,
          previousSceneArt: existingSceneArt,
          previousTransitionMemory,
          previousSceneContinuity,
          pressureStage: nextVisualState.pressureStage ?? null,
          modelStatus: "ok",
          sceneDeltaKind: preliminarySceneDeltaKind,
          cameraMemory: nextCameraMemory,
          previousDirectorDecision: previousContinuityState.directorMemory,
        });
      }
    }
    sceneArtResult = presentation.sceneArtResult;
    let canonicalPayload = presentation.canonicalPayload;
    if (shotPersisted && previousSceneContinuity.canonicalPayload) {
      canonicalPayload = previousSceneContinuity.canonicalPayload;
    }
    if (
      shotPersisted &&
      previousSceneContinuity.sceneKey &&
      canonicalPayload &&
      canonicalPayload.sceneKey !== previousSceneContinuity.sceneKey
    ) {
      throw new Error(
        "scene shot persistence invariant violated: persisted shot must reuse the previous scene key",
      );
    }
    const sceneTransition = presentation.sceneTransition;
    const sceneTransitionWithEscalation = sceneTransition
      ? {
          ...sceneTransition,
          shouldEscalateCamera: escalation?.shouldEscalateCamera ?? false,
        }
      : null;
    let transitionMemory = presentation.transitionMemory;
    const refreshDecision = presentation.refreshDecision;
    const rawCurrentSceneKey = canonicalPayload?.sceneKey ?? null;
    let currentCanonicalKey = rawCurrentSceneKey;
    const identityStabilization = checkIdentityDrift({
      adventureId,
      currentSceneKey: rawCurrentSceneKey,
      previousSceneKey: previousCanonicalKey,
      turnIndex: latestTurn?.turnIndex ?? null,
    });
    if (identityStabilization.correctedSceneKey) {
      currentCanonicalKey = identityStabilization.correctedSceneKey;
    }
    const effectiveSceneKey = currentCanonicalKey ?? rawCurrentSceneKey;
    console.log("scene.identity.stabilization", {
      turnIndex: latestTurn?.turnIndex ?? null,
      rawCurrentSceneKey,
      correctedSceneKey: identityStabilization.correctedSceneKey ?? null,
      appliedCorrection: Boolean(identityStabilization.correctedSceneKey),
      effectiveSceneKey,
    });
    const sameScene =
      previousSceneIdentityKey !== null &&
      currentSceneIdentityKey !== null &&
      previousSceneIdentityKey === currentSceneIdentityKey;
    const sceneKeysMatch = sameScene;
    const sceneClockPressureResult = resolveSceneClockPressure({
      sceneClock: currentSceneClock,
      sameScene,
      encounterPhase: currentSceneIdentity.encounterPhase,
      currentPressure: Number(stateRecord.pressure ?? 0),
    });
    const sceneClockPressureEffect = sceneClockPressureResult.timingStateEffect;
    const finalizedSceneDeltaKind: SceneDeltaKind =
      sceneClockPressureResult.deltaKindOverride ?? derivedSceneDeltaKind;
    const resetSceneTransition: SceneTransition = {
      type: "reset",
      preserveFraming: false,
      preserveSubject: false,
      preserveActor: false,
      preserveFocus: false,
      focusHeld: false,
    };
    let effectiveSceneDeltaKind: SceneDeltaKind = finalizedSceneDeltaKind;
    let finalSceneTransition =
      effectiveSceneDeltaKind === "full"
        ? resetSceneTransition
        : sceneTransitionWithEscalation ?? sceneTransition;
    console.log("scene.keys", {
      previousCanonicalKey,
      currentCanonicalKey,
      previousSceneIdentityKey,
      currentSceneIdentityKey,
      derivedSceneDeltaKind,
      sameScene,
      sceneClockDeltaOverride: sceneClockPressureResult.deltaKindOverride ?? null,
      sceneClockPressureEffect: sceneClockPressureEffect ?? null,
      currentSceneClock,
    });
    // Continuity maintenance checklist:
    // - finalize the canonical identity before any downstream logs/metrics/ledger are computed
    // - downstream consumers must all read from the finalized continuity bundle
    // - hydrate the parent turn strictly via turnIndex - 1
    // - treat any drift between finalized continuity and persistence/telemetry as hard errors
    let computedContinuityInfo: SceneContinuityInfo | null = null;
    let finalContinuityInfo: SceneContinuityInfo | null = null;
    let hasHydratedPreviousSceneKey = false;
    let hasPreviousCanonicalPayload = false;
    let debugHasPreviousSceneArt = false;
    let renderDecisionOutcome: ReturnType<typeof decideRender> | null = null;
    renderMode = "full";
    if (refreshDecision && canonicalPayload) {
      const isInitialTurn = previousTurn === null;
      const continuityReason: SceneContinuityReason = (() => {
        if (!previousSceneContinuity.canonicalPayload) {
          return isInitialTurn ? "INITIAL_RENDER" : "NO_PREVIOUS_CANONICAL_PAYLOAD";
        }
        if (previousSceneContinuity.sceneArtKeyMismatch) {
          return "KEY_MISMATCH";
        }
        if (!previousSceneContinuity.sceneArt) {
          return "NO_PREVIOUS_SCENE_ART";
        }
        return refreshDecision.renderPlan === "reuse-current" ? "REUSE_OK" : "FULL_RENDER_REQUIRED";
      })();
      const continuityBucket: SceneContinuityBucket = (() => {
        if (continuityReason === "INITIAL_RENDER") return "bootstrap";
        if (
          continuityReason === "NO_PREVIOUS_CANONICAL_PAYLOAD" ||
          continuityReason === "NO_PREVIOUS_SCENE_ART" ||
          continuityReason === "KEY_MISMATCH"
        ) {
          return "degraded";
        }
        return "decision";
      })();
      hasHydratedPreviousSceneKey = Boolean(previousCanonicalKey);
      hasPreviousCanonicalPayload = Boolean(previousSceneContinuity?.canonicalPayload);
      debugHasPreviousSceneArt = Boolean(previousSceneContinuity?.sceneArt);
      renderDecisionOutcome = decideRender({
        sameScene,
        hasHydratedPreviousSceneKey,
        hasPreviousCanonicalPayload,
        hasPreviousSceneArt: debugHasPreviousSceneArt,
        sceneArtKeyMismatch: previousSceneContinuity?.sceneArtKeyMismatch ?? false,
        deltaKind: finalizedSceneDeltaKind,
      });
      renderMode = renderDecisionOutcome.renderMode;
      effectiveSceneDeltaKind =
        sameScene && renderDecisionOutcome.renderPlan === "reuse-current"
          ? "none"
          : finalizedSceneDeltaKind;
      finalSceneTransition =
        effectiveSceneDeltaKind === "full"
          ? resetSceneTransition
          : sceneTransitionWithEscalation ?? sceneTransition;
      const shotTransitionAdjustment = applyShotTransitionRules({
        deltaKind: effectiveSceneDeltaKind,
        sameScene,
        shotDuration,
        transitionMemory,
        continuityState,
        nextCameraMemory,
      });
      transitionMemory = shotTransitionAdjustment.transitionMemory;
      continuityState = shotTransitionAdjustment.continuityState;
      const baseLogPayload = {
        sceneKey: effectiveSceneKey,
        deltaKind: effectiveSceneDeltaKind,
        renderPlan: renderDecisionOutcome.renderPlan,
        renderMode,
        reason: continuityReason,
        continuityBucket,
      };
      const deltaLabel = effectiveSceneDeltaKind ?? "missing";
      const captureRenderMetrics = () => {
        const reused = sceneRenderSkippedTotal;
        const rendered = sceneRenderQueuedTotal;
        const total = reused + rendered;
        return {
          reused,
          rendered,
          reuseRate: total ? reused / total : 1,
        };
      };
      const renderReasonRenderPlan = (() => {
        const isDegraded =
          continuityReason === "NO_PREVIOUS_CANONICAL_PAYLOAD" ||
          continuityReason === "NO_PREVIOUS_SCENE_ART" ||
          continuityReason === "KEY_MISMATCH";
        if (isDegraded) return "degradedContinuity";
        switch (deltaLabel) {
          case "camera":
            return "cameraChange";
          case "subject":
            return "subjectChange";
          case "environment":
            return "environmentChange";
          case "full":
          default:
            return "fullSceneChange";
        }
      })();
      let renderMetricsForTurn = captureRenderMetrics();
      if (renderDecisionOutcome.shouldQueueRender) {
        sceneRenderQueuedCount += 1;
        sceneRenderQueuedTotal += 1;
        renderReasonCounters[renderReasonRenderPlan] += 1;
        renderMetricsForTurn = captureRenderMetrics();
        console.info("scene.render.queued", {
          ...baseLogPayload,
          renderMetrics: renderMetricsForTurn,
          renderReasons: { ...renderReasonCounters },
          counts: {
            queued: sceneRenderQueuedCount,
            skipped: sceneRenderSkippedCount,
          },
        });
      } else {
        sceneRenderSkippedCount += 1;
        sceneRenderSkippedTotal += 1;
        renderMetricsForTurn = captureRenderMetrics();
        console.info("scene.render.skipped", {
          ...baseLogPayload,
          renderMetrics: renderMetricsForTurn,
          renderReasons: { ...renderReasonCounters },
          counts: {
            queued: sceneRenderQueuedCount,
            skipped: sceneRenderSkippedCount,
          },
        });
      }
      sceneRenderLogCount += 1;
      console.info("scene.render.plan", {
        ...baseLogPayload,
        renderMetrics: renderMetricsForTurn,
        renderReasons: { ...renderReasonCounters },
        counts: {
          queued: sceneRenderQueuedCount,
          skipped: sceneRenderSkippedCount,
        },
      });
      if (sceneRenderLogCount % 50 === 0) {
        const totalForMetrics = sceneRenderSkippedTotal + sceneRenderQueuedTotal;
        const reuseRate = totalForMetrics
          ? sceneRenderSkippedTotal / totalForMetrics
          : 1;
        console.info("scene.render.metrics", {
          reuseRate,
          renderMetrics: {
            reused: sceneRenderSkippedTotal,
            rendered: sceneRenderQueuedTotal,
          },
          renderReasons: { ...renderReasonCounters },
        });
        console.info("scene.render.stats", {
          skippedCount: sceneRenderSkippedCount,
          queuedCount: sceneRenderQueuedCount,
        });
        sceneRenderSkippedCount = 0;
        sceneRenderQueuedCount = 0;
        sceneRenderSkippedTotal = 0;
        sceneRenderQueuedTotal = 0;
        for (const key of Object.keys(renderReasonCounters) as Array<keyof typeof renderReasonCounters>) {
          renderReasonCounters[key] = 0;
        }
      }
      const reuseRate = renderMetricsForTurn.reuseRate;
      computedContinuityInfo = {
        sceneKey: effectiveSceneKey,
        identityKey: currentSceneIdentityKey,
        previousSceneKey: previousSceneContinuity.sceneKey,
        previousSceneArtKeyMismatch: Boolean(previousSceneContinuity.sceneArtKeyMismatch),
        deltaKind: effectiveSceneDeltaKind,
        renderPlan: renderDecisionOutcome.renderPlan,
        continuityReason,
        continuityBucket,
        shotKey: currentShotKey,
        previousShotKey,
        shotDuration,
        reuseRate,
      };
      const directorDecision = presentation.scenePresentation?.directorDecision;
      if (directorDecision) {
        console.info("scene.director.decision", {
          sceneKey: canonicalPayload.sceneKey,
          emphasis: directorDecision.emphasis,
          shotScale: directorDecision.shotScale,
          cameraAngle: directorDecision.cameraAngle,
          focusSubject: directorDecision.focusSubject,
          compositionBias: directorDecision.compositionBias,
        });
      }
    }
    const correctedSceneKey = effectiveSceneKey ?? previousSceneContinuity.sceneKey ?? null;
    if (!correctedSceneKey) {
      throw new Error("INVALID_CONTINUITY_SCENE_KEY");
    }
    finalContinuityInfo = finalizeContinuityInfo({
      candidate: computedContinuityInfo,
      correctedSceneKey,
      identityKey: currentSceneIdentityKey,
      previous: previousSceneContinuity,
      turnIndex: latestTurn?.turnIndex ?? 0,
    });
    assertContinuityReady({
      continuityInfo: finalContinuityInfo,
      turnIndex: latestTurn?.turnIndex ?? 0,
    });
    console.info("scene.continuity.persisted", {
      adventureId,
      turnIndex: latestTurn?.turnIndex ?? null,
      sceneKey: finalContinuityInfo.sceneKey,
      identityKey: finalContinuityInfo.identityKey,
      previousSceneKey: finalContinuityInfo.previousSceneKey,
      deltaKind: finalContinuityInfo.deltaKind,
      renderPlan: finalContinuityInfo.renderPlan,
      shotKey: finalContinuityInfo.shotKey,
      previousShotKey: finalContinuityInfo.previousShotKey,
      shotDuration: finalContinuityInfo.shotDuration,
      reuseRate: finalContinuityInfo.reuseRate,
      persistedTurnId: latestTurn?.id ?? null,
    });
    const persistedSceneKeyFromTurn = (finalized as any)?.turn?.sceneKey;
    if (persistedSceneKeyFromTurn && persistedSceneKeyFromTurn !== finalContinuityInfo.sceneKey) {
      throw new Error("CONTINUITY_SCENE_KEY_MISMATCH");
    }
    if (finalContinuityInfo.deltaKind !== effectiveSceneDeltaKind) {
      throw new Error("CONTINUITY_DELTA_MISMATCH");
    }
    const timelineSceneKey = finalContinuityInfo.sceneKey;
    const timelineDeltaKind = finalContinuityInfo.deltaKind ?? effectiveSceneDeltaKind;
    const timelineRenderPlan = finalContinuityInfo.renderPlan;
    const timelineReuseRate = finalContinuityInfo.reuseRate;
    console.info("scene.timeline", {
      turnIndex: latestTurn?.turnIndex ?? null,
      shotKey: currentShotKey,
      sceneKey: timelineSceneKey,
      shotPersisted,
      shotDuration,
      deltaKind: timelineDeltaKind,
      renderPlan: timelineRenderPlan,
      renderMode,
      reuseRate: timelineReuseRate,
    });
    logSceneMetrics({
      sceneKey: timelineSceneKey,
      turnIndex: latestTurn?.turnIndex ?? null,
      reuseRate: timelineReuseRate,
      shotDuration,
      renderPlan: timelineRenderPlan,
      deltaKind: timelineDeltaKind,
    });
    checkRenderAnomaly({
      adventureId,
      sceneKey: timelineSceneKey,
      reuseRate: timelineReuseRate,
      turnIndex: latestTurn?.turnIndex ?? null,
    });
    checkRenderThrottle({
      adventureId,
      sceneKey: timelineSceneKey,
      reuseRate: timelineReuseRate,
      turnIndex: latestTurn?.turnIndex ?? null,
    });
    console.log("scene.continuity.lineage", {
      turnIndex: latestTurn?.turnIndex ?? null,
      previousSceneKey: finalContinuityInfo.previousSceneKey ?? null,
      currentSceneKey: finalContinuityInfo.sceneKey,
      shotKey: currentShotKey,
      shotDuration,
    });
    if (latestTurn?.turnIndex && latestTurn.turnIndex > 0 && !finalContinuityInfo.previousSceneKey) {
      console.warn("scene.continuity.previousSceneKey.null_after_bootstrap", {
        adventureId,
        turnIndex: latestTurn.turnIndex,
        sceneKey: finalContinuityInfo.sceneKey,
      });
    }
    const fullMemoryPreserved =
      Boolean(transitionMemory) &&
      transitionMemory.preserveFraming &&
      transitionMemory.preserveSubject &&
      transitionMemory.preserveActor &&
      transitionMemory.preserveFocus;
    await persistSceneTransitionMemory({
      db,
      adventureId,
      transitionMemory,
      continuityState,
    });
    console.log("scene.continuity.debug", {
      previousTurnIndex: previousTurn?.turnIndex ?? null,
      previousSceneKey: previousSceneContinuity.sceneKey,
      previousIdentityKey: previousSceneIdentityKey,
      currentSceneKey: finalContinuityInfo?.sceneKey ?? effectiveSceneKey,
      currentIdentityKey: finalContinuityInfo?.identityKey ?? currentSceneIdentityKey,
      sceneKeysMatch,
      fullMemoryPreserved,
      sameScene,
      deltaKind: finalContinuityInfo?.deltaKind ?? effectiveSceneDeltaKind,
      renderPlan: finalContinuityInfo?.renderPlan ?? null,
      transitionMemory,
      transition: finalSceneTransition,
      legacyRefreshDecision: refreshDecision,
      finalRenderDecision: renderDecisionOutcome,
    });
    if (sceneArtPayload && (!sceneIdentity?.sceneKey || !sceneIdentity?.promptHash)) {
      console.error("scene.identity.invalid_before_persist", {
        sceneArtPayload,
        sceneIdentity,
      });
    }
    if (finalContinuityInfo && latestTurn?.id) {
      const latestTurnDebug = asRecord(latestTurn.debug ?? null) ?? {};
      const debugSceneIdentity = latestTurnDebug.sceneIdentity ?? null;
      console.log("scene.identity.persist_write", {
        sceneIdentity,
        debugSceneIdentity,
      });
      latestTurnDebug.failForwardComplication = failForwardComplication ?? null;
      await db.turn.update({
        where: { id: latestTurn.id },
        data: {
          debug: {
            ...latestTurnDebug,
            sceneContinuityInfo: finalContinuityInfo,
            sceneIdentity: sceneIdentity ?? null,
          },
        },
      });
    }
    const scenePresentation = presentation.scenePresentation;
    const visualStateDeltas = diffSceneVisualState(previousVisualState, nextVisualState);
    const visualLedgerEntries = visualStateDeltas.map((delta) => ({
      kind: "visual_state",
      domain: "visual",
      cause: `Visual ${delta.key}`,
      effect: delta.message,
    }));
    const sceneTransitionPayload = finalSceneTransition;
    const transitionLedgerEntry = previousComposition && finalSceneTransition
      ? {
          kind: "scene_transition",
          domain: "visual",
          cause: `Scene ${finalSceneTransition.type}`,
          effect: describeSceneTransition(finalSceneTransition),
        }
      : null;
    const previousSceneKeyForLedger = finalContinuityInfo.previousSceneKey;
    const sceneIdentityLedgerEntry = previousSceneKeyForLedger
      ? buildSceneTransitionLedgerEntry({
          previousSceneKey: previousSceneKeyForLedger,
          sceneKey: finalContinuityInfo.sceneKey,
          deltaKind: finalizedSceneDeltaKind,
          changedAnchors: identityChangedAnchors,
        })
      : null;
    const pressureResult = describeScenePressureChange({
      previous: previousSceneIdentity,
      current: currentSceneIdentity,
      deltaKind: finalizedSceneDeltaKind,
    });
    const previousPressureValue = Number(stateRecord.pressure ?? 0);
    const nextPressureValue = Math.max(0, previousPressureValue + pressureResult.pressureDelta);
    stateRecord.pressure = nextPressureValue;
    await db.adventure.update({
      where: { id: adventureId },
      data: { state: stateRecord },
    });
    const pressureLedgerEntry = pressureResult.pressureDelta
      ? {
          kind: "pressure.changed",
          domain: "pressure",
          cause: pressureResult.reason ?? "pressure.changed",
          effect: "pressure.changed",
          data: {
            delta: pressureResult.pressureDelta,
            value: nextPressureValue,
          },
        }
      : null;
    const failForwardSignal = describeFailForwardSignal({
      pressure: nextPressureValue,
      previousPressure: previousPressureValue,
      deltaKind: finalizedSceneDeltaKind,
      currentPhase: currentSceneIdentity.encounterPhase,
      previousPhase: previousSceneIdentity?.encounterPhase ?? null,
    });
    if (failForwardSignal.pressure !== nextPressureValue) {
      throw new Error("FAIL_FORWARD_PRESSURE_MISMATCH");
    }
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
    failForwardComplication = resolveFailForwardComplication({
      signal: failForwardSignal,
      encounterPhase: currentSceneIdentity.encounterPhase,
      deltaKind: finalizedSceneDeltaKind,
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
            deltaKind: finalizedSceneDeltaKind,
            encounterPhase: currentSceneIdentity.encounterPhase,
          },
        }
      : null;
    const complicationStateDelta = failForwardComplication
      ? resolveFailForwardStateDelta(failForwardComplication)
      : null;
    if (complicationStateDelta) {
      const complicationStateDeltaRecord = {
        key: "Fail-forward complication",
        detail: complicationStateDelta,
      };
      turnStateDeltas.push(complicationStateDeltaRecord);
    }
    applyTurnStateDeltas(stateRecord, turnStateDeltas);
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
    const currentStats = asRecord(stateRecord.stats) ?? {};
    const currentNoise = Number(currentStats.noise ?? 0);
    const currentNpcSuspicion = Number(currentStats.npcSuspicion ?? 0);
    const currentPositionPenalty = Number(currentStats.positionPenalty ?? 0);
    const currentTimeAdvance = Number(currentStats.timeAdvance ?? 0);
    const previousNpcStance = (previousStateRecord?.npcStance as string | undefined) ?? "calm";
    const npcStance = resolveNpcSuspicionStance(currentNpcSuspicion);
    stateRecord.npcStance = npcStance;
    const npcStanceEntry = npcStance !== previousNpcStance
      ? {
          kind: "npc.stance",
          domain: "npc",
          cause: "npc.suspicion",
          effect: npcStance,
          data: {
            npcSuspicion: currentNpcSuspicion,
            previousStance: previousNpcStance,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const watchfulness = resolveNpcWatchfulness(npcStance);
    const watchfulnessActionFlags = resolveWatchfulnessActionFlags({
      watchfulness: watchfulness.level,
      mode: playerIntentMode,
    });
    const persistedPositionActionFlags = resolvePositionActionFlags(currentPositionPenalty);
    const persistedNoiseActionFlags = resolveNoiseActionFlags(currentNoise);
    stateRecord.watchfulness = watchfulness.level;
    stateRecord.watchfulnessCostDelta = watchfulness.costDelta;
    stateRecord.watchfulnessActionFlags = watchfulnessActionFlags;
    stateRecord.positionPenaltyActionFlags = persistedPositionActionFlags;
    stateRecord.noiseActionFlags = persistedNoiseActionFlags;
    const resolverLadder = buildResolverLadder({
      watchfulnessActionFlags,
      positionActionFlags: persistedPositionActionFlags,
      noiseActionFlags: persistedNoiseActionFlags,
    });
    const actionConstraintPressure = {
      constraintPressure: resolverLadder.constraintPressure,
      activeConstraints: resolverLadder.constraintPressureActive,
    };
    stateRecord.actionConstraints = resolverLadder.actionConstraints;
    stateRecord.constraintPressure = resolverLadder.constraintPressure;
    stateRecord.constraintPressureActive = resolverLadder.constraintPressureActive;
    const actionRisk = resolverLadder.actionRisk;
    const complicationWeight = resolverLadder.complicationWeight;
    const complicationTier = resolverLadder.complicationTier;
    stateRecord.actionRiskDelta = actionRisk.actionRiskDelta;
    stateRecord.actionRiskTier = actionRisk.riskTier;
    stateRecord.complicationWeightDelta = complicationWeight.complicationWeightDelta;
    stateRecord.complicationTier = complicationTier.complicationTier;
    stateRecord.forcedComplicationCount = resolverLadder.forcedComplicationCount;
    const forcedComplicationCount = resolverLadder.forcedComplicationCount ?? 0;
    const outcomeSeverity = resolverLadder.outcomeSeverity;
    stateRecord.outcomeSeverity = outcomeSeverity;
    stateRecord.consequenceBudgetExtraCostCount = resolverLadder.consequenceBudgetExtraCostCount;
    const watchfulnessEntry = watchfulness.level !== previousWatchfulness
      ? {
          kind: "npc.watchfulness",
          domain: "npc",
          cause: "npc.suspicion",
          effect: `watchfulness.${watchfulness.level}`,
          data: {
            level: watchfulness.level,
            costDelta: watchfulness.costDelta,
            previousLevel: previousWatchfulness,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
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
              watchfulness: previousWatchfulness,
              mode: playerIntentMode,
              stealthDisadvantage: watchfulnessActionFlags.stealthDisadvantage,
              deceptionDisadvantage: watchfulnessActionFlags.deceptionDisadvantage,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    const noiseEscalationEntry = currentNoise >= 1
      ? {
          kind: "noise.escalation",
          domain: "pressure",
          cause: "noise.persisted",
          effect: "noise.persisted",
          data: {
            noise: currentNoise,
            previousNoise,
            sameScene,
            turnIndex: latestTurn?.turnIndex ?? null,
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
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const actionConstraintEntry = actionConstraintPressure.constraintPressure > 0
      ? {
          kind: "action.constraint",
          domain: "pressure",
          cause: "action.constraints",
          effect: "constraint.pressure",
          data: {
            constraintPressure: actionConstraintPressure.constraintPressure,
            activeConstraints: actionConstraintPressure.activeConstraints,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const actionRiskEntry = actionRisk.riskTier !== "none"
      ? {
          kind: "action.risk",
          domain: "resolution",
          cause: "action.constraints",
          effect: `action-risk.${actionRisk.riskTier}`,
          data: {
            actionRiskDelta: actionRisk.actionRiskDelta,
            constraintPressure: actionConstraintPressure.constraintPressure,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const complicationWeightEntry = complicationWeight.complicationWeightDelta > 0
      ? {
          kind: "complication.weight",
          domain: "resolution",
          cause: "action.risk",
          effect: "complication-weight.elevated",
          data: {
            complicationWeightDelta: complicationWeight.complicationWeightDelta,
            actionRiskDelta: actionRisk.actionRiskDelta,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const complicationTierEntry = complicationTier.complicationTier !== "none"
      ? {
          kind: "complication.tier",
          domain: "resolution",
          cause: "complication.weight",
          effect: `complication-tier.${complicationTier.complicationTier}`,
          data: {
            complicationTier: complicationTier.complicationTier,
            complicationWeightDelta: complicationWeight.complicationWeightDelta,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const complicationPolicyEntry = forcedComplicationCount > 0
      ? {
          kind: "complication.policy",
          domain: "resolution",
          cause: "complication.tier",
          effect: `complication-policy.${complicationTier.complicationTier}`,
          data: {
            forcedComplicationCount,
            complicationTier: complicationTier.complicationTier,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const positionActionEntry =
      previousPositionActionFlags.mobilityDisadvantage || previousPositionActionFlags.coverLost
        ? {
            kind: "position.penalty.action",
            domain: "pressure",
            cause: "position.penalty",
            effect: previousPositionActionFlags.coverLost ? "position.cover-lost" : "position.mobility.disadvantage",
            data: {
              positionPenalty: previousPositionPenalty,
              mobilityDisadvantage: previousPositionActionFlags.mobilityDisadvantage,
              coverLost: previousPositionActionFlags.coverLost,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    const npcSuspicionEffect = resolveNpcSuspicionEffect(currentNpcSuspicion);
    const npcSuspicionEntry = npcSuspicionEffect
      ? {
          kind: "npc.suspicion",
          domain: "npc",
      cause: "npc.suspicion",
          effect: npcSuspicionEffect,
          data: {
            value: currentNpcSuspicion,
            turnIndex: latestTurn?.turnIndex ?? null,
            sameScene,
            previousNpcSuspicion: Number(previousStatsRecord?.npcSuspicion ?? 0),
          },
        }
      : null;
    const positionPenaltyEffect = resolvePositionPenaltyEffect(currentPositionPenalty);
    const positionPenaltyEntry = positionPenaltyEffect
      ? {
          kind: "position.penalty",
          domain: "pressure",
          cause: "position.penalty",
          effect: positionPenaltyEffect,
          data: {
            value: currentPositionPenalty,
            turnIndex: latestTurn?.turnIndex ?? null,
            sameScene,
            previousPositionPenalty: Number(previousStatsRecord?.positionPenalty ?? 0),
          },
        }
      : null;
    const nextSceneClock = previousSceneClock + timeAdvanceDelta;
    stateRecord.sceneClock = nextSceneClock;
    const sceneTimeEffect = resolveSceneTimeEffect({
      sceneClock: nextSceneClock,
      sameScene,
      timeAdvanceDelta,
    });
    const sceneTimeEntry = sceneTimeEffect
      ? {
          kind: "time.advance",
          domain: "time",
          cause: "time.advance",
          effect: sceneTimeEffect,
          data: {
      value: nextSceneClock,
            timeAdvanceDelta,
            turnIndex: latestTurn?.turnIndex ?? null,
            sameScene,
            previousSceneClock,
          },
        }
      : null;
    const sceneClockPressureEntry = sceneClockPressureEffect
      ? {
          kind: "scene.clock",
          domain: "time",
          cause: "scene.clock.pressure",
          effect: sceneClockPressureEffect,
          data: {
            sceneClock: nextSceneClock,
            previousSceneClock,
            deltaKind: finalizedSceneDeltaKind,
            sameScene,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const watchfulnessEffectSummary: FinalizedEffectSummary | null =
      watchfulness.level === "normal"
        ? null
        : (`watchfulness.${watchfulness.level}` as FinalizedEffectSummary);
    const constraintPressureEffect: FinalizedEffectSummary | null =
      actionConstraintPressure.constraintPressure > 0 ? "constraint.pressure" : null;
    const actionRiskEffect: FinalizedEffectSummary | null =
      actionRisk.riskTier !== "none" ? (`action-risk.${actionRisk.riskTier}` as FinalizedEffectSummary) : null;
    const outcomeSeverityEntry = outcomeSeverity !== "normal"
      ? {
          kind: "outcome.severity",
          domain: "resolution",
          cause: "complication.policy",
          effect: `outcome-severity.${outcomeSeverity}` as FinalizedEffectSummary,
          data: {
            outcomeSeverity,
            forcedComplicationCount,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const consequenceBudget = { extraCostCount: resolverLadder.consequenceBudgetExtraCostCount };
    const consequenceBudgetEntry = consequenceBudget.extraCostCount > 0
      ? {
          kind: "consequence.budget",
          domain: "resolution",
          cause: "outcome.severity",
          effect: `consequence-budget.extraCost-${consequenceBudget.extraCostCount}` as FinalizedEffectSummary,
          data: {
            extraCostCount: consequenceBudget.extraCostCount,
            outcomeSeverity,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const opportunityCostEffect = resolveOpportunityCostEffect({ opportunityCost });
    const opportunityCostEffectEntry =
      (opportunityCostEffect.riskLevelDelta || opportunityCostEffect.costBudgetDelta)
        ? {
            kind: "opportunity.cost.effect",
            domain: "resolution",
            cause: "opportunity.tier",
            effect: "opportunity.cost.effect",
            data: {
              riskLevelDelta: opportunityCostEffect.riskLevelDelta,
              costBudgetDelta: opportunityCostEffect.costBudgetDelta,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    const watchfulnessCostDelta = watchfulness.costDelta;
    const resolutionCostBaseDelta = opportunityCostEffect.riskLevelDelta ?? 0;
    const resolutionCostDelta = resolutionCostBaseDelta + watchfulnessCostDelta;
    const previousResolutionCost = Number(stateRecord.resolutionCost ?? 0);
    const nextResolutionCost = Math.max(0, previousResolutionCost + resolutionCostDelta);
    stateRecord.resolutionCost = nextResolutionCost;
    const resolutionCostEntry =
      resolutionCostDelta
        ? {
            kind: "resolution.cost",
            domain: "resolution",
            cause: "opportunity.cost",
            effect: "resolution.cost",
            data: {
              delta: resolutionCostDelta,
              value: nextResolutionCost,
              turnIndex: latestTurn?.turnIndex ?? null,
              watchfulnessCostDelta,
            },
          }
        : null;
    const resolutionCostEffect = resolveResolutionCostEffect({ resolutionCost: nextResolutionCost });
    const resolutionCostEffectEntry = resolutionCostEffect.higherComplicationRisk
      ? {
          kind: "resolution.cost.effect",
          domain: "resolution",
          cause: "resolution.cost",
          effect: "higher-complication-risk",
          data: {
            resolutionCost: nextResolutionCost,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const complicationRiskEffect = resolveComplicationRiskEffect({
      higherComplicationRisk: resolutionCostEffect.higherComplicationRisk,
    });
    const complicationRiskEntry = complicationRiskEffect.complicationLikely
      ? {
          kind: "resolution.complication",
          domain: "resolution",
          cause: "complication.risk",
          effect: "complication-likely",
          data: {
            turnIndex: latestTurn?.turnIndex ?? null,
            resolutionCost: nextResolutionCost,
          },
        }
      : null;
    const complicationOutcomeEffect = resolveComplicationOutcomeEffect({
      complicationLikely: complicationRiskEffect.complicationLikely,
    });
    const complicationOutcomeEntry =
      complicationOutcomeEffect.minimumComplicationCount > 0
        ? {
            kind: "complication.outcome",
            domain: "resolution",
            cause: "complication.likely",
            effect: "complication-likely",
            data: {
              minimumComplicationCount: complicationOutcomeEffect.minimumComplicationCount,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    const resolvedFinalizedComplications = resolveFinalizedComplications({
      minimumComplicationCount: complicationOutcomeEffect.minimumComplicationCount,
      failForwardComplication,
    });
    const complicationPolicyResult = enforceComplicationPolicy({
      finalizedComplications: resolvedFinalizedComplications,
      forcedComplicationCount,
    });
    const enforcedFinalizedComplications = complicationPolicyResult.finalizedComplications;
    if (enforcedFinalizedComplications.length < forcedComplicationCount) {
      throw new Error("COMPULSION_POLICY_INVARIANT_FAILED");
    }
    const finalizedComplicationDeltas = resolveFinalizedComplicationDeltas(enforcedFinalizedComplications);
    const hasComplicationDelta =
      (finalizedComplicationDeltas.noise ?? 0) ||
      (finalizedComplicationDeltas.npcSuspicion ?? 0) ||
      (finalizedComplicationDeltas.positionPenalty ?? 0) ||
      (finalizedComplicationDeltas.timeAdvance ?? 0);
    const applyComplicationDeltas = hasComplicationDelta && !failForwardComplication;
    if (applyComplicationDeltas) {
      turnStateDeltas.push({
        key: "Finalized complications",
        detail: finalizedComplicationDeltas,
      });
    }
    if (failForwardComplication && applyComplicationDeltas) {
      throw new Error("FINALIZED_COMPILATION_DOUBLE_APPLY");
    }
    if (!failForwardComplication && hasComplicationDelta && !applyComplicationDeltas) {
      throw new Error("FINALIZED_COMPILATION_NOT_APPLIED");
    }
    if (failForwardComplication) {
      const normalizedFinalizedComplicationDeltas = {
        noise: finalizedComplicationDeltas.noise ?? 0,
        npcSuspicion: finalizedComplicationDeltas.npcSuspicion ?? 0,
        positionPenalty: finalizedComplicationDeltas.positionPenalty ?? 0,
        timeAdvance: finalizedComplicationDeltas.timeAdvance ?? 0,
      };
      const normalizedFailForwardDelta = {
        noise: complicationStateDelta?.noise ?? 0,
        npcSuspicion: complicationStateDelta?.npcSuspicion ?? 0,
        positionPenalty: complicationStateDelta?.positionPenalty ?? 0,
        timeAdvance: complicationStateDelta?.timeAdvance ?? 0,
      };
      if (
        normalizedFinalizedComplicationDeltas.noise !== normalizedFailForwardDelta.noise ||
        normalizedFinalizedComplicationDeltas.npcSuspicion !== normalizedFailForwardDelta.npcSuspicion ||
        normalizedFinalizedComplicationDeltas.positionPenalty !== normalizedFailForwardDelta.positionPenalty ||
        normalizedFinalizedComplicationDeltas.timeAdvance !== normalizedFailForwardDelta.timeAdvance
      ) {
        throw new Error("FINALIZED_COMPILATION_DELTA_MISMATCH");
      }
    }

    const finalizedEffectSummaries: FinalizedEffectSummary[] = [
      ...(noiseEscalationEntry ? ["noise.escalation"] : []),
      ...(npcSuspicionEntry ? ["npc.suspicion"] : []),
      ...(positionPenaltyEntry ? ["position.penalty"] : []),
      ...(constraintPressureEffect ? [constraintPressureEffect] : []),
      ...(actionRiskEffect ? [actionRiskEffect] : []),
      ...(complicationWeightEntry ? ([complicationWeightEntry.effect] as FinalizedEffectSummary[]) : []),
      ...(complicationTierEntry ? ([complicationTierEntry.effect] as FinalizedEffectSummary[]) : []),
      ...(complicationPolicyEntry ? ([complicationPolicyEntry.effect] as FinalizedEffectSummary[]) : []),
      ...(sceneTimeEffect ? [sceneTimeEffect] : []),
      ...(sceneClockPressureEffect ? [sceneClockPressureEffect] : []),
      ...(opportunityResolutionModifier ? [opportunityResolutionModifier] : []),
      ...(opportunityCost ? [opportunityCost] : []),
      ...(resolutionCostDelta > 0 ? ["resolution.cost"] : []),
      ...(resolutionCostEffect.higherComplicationRisk ? ["higher-complication-risk"] : []),
      ...(complicationRiskEffect.complicationLikely ? ["complication-likely"] : []),
      ...(complicationOutcomeEffect.minimumComplicationCount > 0 ? ["complication.outcome"] : []),
      ...(enforcedFinalizedComplications.includes("complication-applied") ? ["complication-applied"] : []),
      ...(watchfulnessEffectSummary ? [watchfulnessEffectSummary] : []),
      ...(positionActionEntry ? ([positionActionEntry.effect] as FinalizedEffectSummary[]) : []),
      ...(noiseActionEntry ? ([noiseActionEntry.effect] as FinalizedEffectSummary[]) : []),
    ];
    const previousOpportunityTier =
      (previousStateRecord?.opportunityTier as OpportunityWindowState["opportunityTier"]) ?? "normal";
    const opportunityWindowState = resolveOpportunityWindow({
      effectSummaries: finalizedEffectSummaries,
      sceneClock: nextSceneClock,
    });
    stateRecord.opportunityTier = opportunityWindowState.opportunityTier;
    stateRecord.opportunityWindowNarrowed = opportunityWindowState.windowNarrowed;
    const opportunityLedgerEntry =
      opportunityWindowState.windowNarrowed &&
      previousOpportunityTier !== opportunityWindowState.opportunityTier
        ? {
            kind: "opportunity.window",
            domain: "world",
            cause: "opportunity.window-pressure",
            effect: "opportunity.window-narrowed",
            data: {
              sceneClock: nextSceneClock,
              opportunityTier: opportunityWindowState.opportunityTier,
              previousOpportunityTier,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    opportunityResolutionModifier = resolveOpportunityResolutionModifier({
      opportunityTier: opportunityWindowState.opportunityTier,
    });
    opportunityCost = resolveOpportunityCost({
      opportunityResolutionModifier,
      deltaKind: finalizedSceneDeltaKind,
      encounterPhase: currentSceneIdentity.encounterPhase,
    });
    const opportunityCostEntry =
      opportunityCost && opportunityWindowState.windowNarrowed
        ? {
            kind: "opportunity.cost",
            domain: "resolution",
            cause: "opportunity.tier",
            effect: opportunityCost,
            data: {
              opportunityTier: opportunityWindowState.opportunityTier,
              turnIndex: latestTurn?.turnIndex ?? null,
              deltaKind: finalizedSceneDeltaKind,
            },
          }
        : null;
    const opportunityResolutionEntry = opportunityResolutionModifier
      ? {
          kind: "opportunity.resolution",
          domain: "resolution",
          cause: "opportunity.tier",
          effect: opportunityResolutionModifier,
          data: {
            opportunityTier: opportunityWindowState.opportunityTier,
            turnIndex: latestTurn?.turnIndex ?? null,
          },
        }
      : null;
    const opportunityCostStateDeltaRecord =
      resolutionCostDelta || opportunityCostEffect.costBudgetDelta
        ? {
            key: "Opportunity cost",
            detail: {
              riskLevelDelta: resolutionCostDelta,
              costBudgetDelta: opportunityCostEffect.costBudgetDelta,
            },
          }
        : null;
    if (opportunityCostStateDeltaRecord) {
      turnStateDeltas.push(opportunityCostStateDeltaRecord);
      const statsRecord = asRecord(stateRecord.stats) ?? {};
      statsRecord.riskLevel = Number(statsRecord.riskLevel ?? 0) + resolutionCostDelta;
      statsRecord.costBudget =
        Number(statsRecord.costBudget ?? 0) + opportunityCostEffect.costBudgetDelta;
      stateRecord.stats = { ...statsRecord };
    }

    const complicationAppliedEntry = enforcedFinalizedComplications.includes("complication-applied")
      ? {
          kind: "complication",
          domain: "resolution",
          cause: "complication.outcome",
          effect: "complication-applied",
          data: {
            turnIndex: latestTurn?.turnIndex ?? null,
            resolutionCost: nextResolutionCost,
          },
        }
      : null;
    const complicationDeltaEntry =
      applyComplicationDeltas && hasComplicationDelta
        ? {
            kind: "complication.deltas",
            domain: "resolution",
            cause: "complication.selection",
            effect: "complication.deltas",
            data: {
              detail: finalizedComplicationDeltas,
              turnIndex: latestTurn?.turnIndex ?? null,
            },
          }
        : null;
    const modifiers = applyWorldStateModifiers({
      stateRecord,
      mode: playerIntentMode ?? "LOOK",
    });
    const baseDifficulty = Number(stateRecord.difficulty ?? 0);
    const adjustedDifficulty = baseDifficulty + modifiers.difficultyModifier;
    const effectiveRollTotal =
      typeof rollTotal === "number" && Number.isFinite(rollTotal)
        ? rollTotal + modifiers.rollAdjustment
        : null;
    const hasRoll = effectiveRollTotal !== null;
    const resolvedOutcomeTier: OutcomeTier = hasRoll
      ? resolveOutcomeTier({
          rollTotal: effectiveRollTotal,
          difficulty: adjustedDifficulty,
        })
      : "mixed";
    const resolvedRoll =
      hasRoll
        ? {
            formula: "turn-resolution",
            total: effectiveRollTotal,
            difficulty: adjustedDifficulty,
            margin: effectiveRollTotal - adjustedDifficulty,
          }
        : null;
    if (playerIntentMode === "LOOK" || playerIntentMode === "DO" || playerIntentMode === "SAY") {
      console.log("turn.authored.input", {
        playerIntentMode,
        normalizedInput,
        outcomeTier: resolvedOutcomeTier,
      });
    }
    const authoredEffects =
      playerIntentMode === "LOOK" || playerIntentMode === "DO" || playerIntentMode === "SAY"
        ? resolveActionEffects({
            mode: playerIntentMode ?? "LOOK",
            playerText,
            state: stateRecord,
            outcomeTier: resolvedOutcomeTier,
          })
        : null;

    const ledgerAddsWithVisual = [
      ...turnLedgerAdds,
      ...visualLedgerEntries,
      ...(transitionLedgerEntry ? [transitionLedgerEntry] : []),
      ...(sceneIdentityLedgerEntry ? [sceneIdentityLedgerEntry] : []),
      ...(pressureLedgerEntry ? [pressureLedgerEntry] : []),
      ...(failForwardEntry ? [failForwardEntry] : []),
      ...(complicationEntry ? [complicationEntry] : []),
      ...(complicationStateDeltaEntry ? [complicationStateDeltaEntry] : []),
      ...(noiseEscalationEntry ? [noiseEscalationEntry] : []),
      ...(noiseActionEntry ? [noiseActionEntry] : []),
      ...(actionConstraintEntry ? [actionConstraintEntry] : []),
      ...(actionRiskEntry ? [actionRiskEntry] : []),
      ...(npcStanceEntry ? [npcStanceEntry] : []),
      ...(watchfulnessEntry ? [watchfulnessEntry] : []),
      ...(watchfulnessActionEntry ? [watchfulnessActionEntry] : []),
      ...(positionActionEntry ? [positionActionEntry] : []),
      ...(npcSuspicionEntry ? [npcSuspicionEntry] : []),
      ...(positionPenaltyEntry ? [positionPenaltyEntry] : []),
      ...(sceneTimeEntry ? [sceneTimeEntry] : []),
      ...(sceneClockPressureEntry ? [sceneClockPressureEntry] : []),
      ...(opportunityLedgerEntry ? [opportunityLedgerEntry] : []),
      ...(opportunityResolutionEntry ? [opportunityResolutionEntry] : []),
      ...(opportunityCostEntry ? [opportunityCostEntry] : []),
      ...(opportunityCostEffectEntry ? [opportunityCostEffectEntry] : []),
      ...(resolutionCostEntry ? [resolutionCostEntry] : []),
      ...(resolutionCostEffectEntry ? [resolutionCostEffectEntry] : []),
      ...(complicationRiskEntry ? [complicationRiskEntry] : []),
      ...(complicationOutcomeEntry ? [complicationOutcomeEntry] : []),
      ...(complicationAppliedEntry ? [complicationAppliedEntry] : []),
      ...(complicationWeightEntry ? [complicationWeightEntry] : []),
      ...(complicationTierEntry ? [complicationTierEntry] : []),
      ...(complicationPolicyEntry ? [complicationPolicyEntry] : []),
      ...(consequenceBudgetEntry ? [consequenceBudgetEntry] : []),
      ...(outcomeSeverityEntry ? [outcomeSeverityEntry] : []),
      ...(consequenceBudgetEntry ? [consequenceBudgetEntry.effect as FinalizedEffectSummary] : []),
      ...(outcomeSeverityEntry ? [outcomeSeverityEntry] : []),
      ...(complicationWeightEntry ? [complicationWeightEntry] : []),
      ...(complicationDeltaEntry ? [complicationDeltaEntry] : []),
      ...(authoredEffects?.ledgerAdds ?? []),
    ];
    const normalizedLedgerAdds = ledgerAddsWithVisual.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      if (!Object.prototype.hasOwnProperty.call(entry, "outcome")) return entry;
      const { outcome, ...rest } = entry as Record<string, unknown>;
      return rest;
    });
    if (stateRecord.npcStance !== resolveNpcSuspicionStance(Number(currentStats.npcSuspicion ?? 0))) {
      throw new Error("NPC_STANCE_MISMATCH");
    }
    const derivedWatchfulness = resolveNpcWatchfulness(stateRecord.npcStance as NpcSuspicionStance);
    if (stateRecord.watchfulness !== derivedWatchfulness.level) {
      throw new Error("WATCHFULNESS_MISMATCH");
    }
    if (stateRecord.watchfulnessCostDelta !== derivedWatchfulness.costDelta) {
      throw new Error("WATCHFULNESS_COST_MISMATCH");
    }
    const watchfulnessActionFlagsRecord = stateRecord.watchfulnessActionFlags as WatchfulnessActionFlags | null;
    const normalizedWatchfulnessFlags = resolveWatchfulnessActionFlags({
      watchfulness: (stateRecord.watchfulness as NpcWatchfulnessLevel) ?? "normal",
      mode: playerIntentMode,
    });
    if (
      watchfulnessActionFlagsRecord?.stealthDisadvantage !== normalizedWatchfulnessFlags.stealthDisadvantage ||
      watchfulnessActionFlagsRecord?.deceptionDisadvantage !== normalizedWatchfulnessFlags.deceptionDisadvantage
    ) {
      throw new Error("WATCHFULNESS_ACTION_FLAG_MISMATCH");
    }
    const persistedPositionFlags = stateRecord.positionPenaltyActionFlags as PositionActionFlags | null;
    if (
      persistedPositionFlags?.mobilityDisadvantage !== persistedPositionActionFlags.mobilityDisadvantage ||
      persistedPositionFlags?.coverLost !== persistedPositionActionFlags.coverLost
    ) {
      throw new Error("POSITION_ACTION_FLAG_MISMATCH");
    }
    const persistedNoiseFlags = stateRecord.noiseActionFlags as NoiseActionFlags | null;
    if (
      persistedNoiseFlags?.attentionDrawn !== persistedNoiseActionFlags.attentionDrawn ||
      persistedNoiseFlags?.searchPressure !== persistedNoiseActionFlags.searchPressure
    ) {
      throw new Error("NOISE_ACTION_FLAG_MISMATCH");
    }
    const normalizedLadder = buildResolverLadder({
      watchfulnessActionFlags: normalizedWatchfulnessFlags,
      positionActionFlags: persistedPositionActionFlags,
      noiseActionFlags: persistedNoiseActionFlags,
    });
    const persistedActionConstraints = asRecord(stateRecord.actionConstraints ?? null) ?? {};
    for (const key of Object.keys(normalizedLadder.actionConstraints) as Array<keyof typeof normalizedLadder.actionConstraints>) {
      if (persistedActionConstraints[key] !== normalizedLadder.actionConstraints[key]) {
        throw new Error("ACTION_CONSTRAINTS_MISMATCH");
      }
    }
    if (stateRecord.constraintPressure !== normalizedLadder.constraintPressure) {
      throw new Error("CONSTRAINT_PRESSURE_MISMATCH");
    }
    if (
      actionRisk.actionRiskDelta !== normalizedLadder.actionRisk.actionRiskDelta ||
      actionRisk.riskTier !== normalizedLadder.actionRisk.riskTier
    ) {
      throw new Error("ACTION_RISK_MISMATCH");
    }
    if (complicationWeight.complicationWeightDelta !== normalizedLadder.complicationWeight.complicationWeightDelta) {
      throw new Error("COMPLICATION_WEIGHT_MISMATCH");
    }
    if (complicationTier.complicationTier !== normalizedLadder.complicationTier.complicationTier) {
      throw new Error("COMPLICATION_TIER_MISMATCH");
    }
    if (stateRecord.forcedComplicationCount !== normalizedLadder.forcedComplicationCount) {
      throw new Error("FORCED_COMPLICATION_COUNT_MISMATCH");
    }
    if (outcomeSeverity !== normalizedLadder.outcomeSeverity) {
      throw new Error("OUTCOME_SEVERITY_MISMATCH");
    }
    if (stateRecord.consequenceBudgetExtraCostCount !== normalizedLadder.consequenceBudgetExtraCostCount) {
      throw new Error("CONSEQUENCE_BUDGET_MISMATCH");
    }
    const consequenceBundle = resolverLadder.consequenceBundle;
    const finalizedConsequenceResult = buildFinalizedConsequenceResult({
      forcedComplicationCount: resolverLadder.forcedComplicationCount,
      outcomeSeverity: resolverLadder.outcomeSeverity,
      consequenceBudgetExtraCostCount: resolverLadder.consequenceBudgetExtraCostCount,
      consequenceComplicationEntries: consequenceBundle.complicationEntries,
      consequenceExtraCostEntries: consequenceBundle.extraCostEntries,
    });
    const finalizedConsequenceNarration = buildFinalizedConsequenceNarration({
      outcomeSeverity: finalizedConsequenceResult.outcomeSeverity,
      consequenceComplicationEntries: finalizedConsequenceResult.consequenceComplicationEntries,
      consequenceExtraCostEntries: finalizedConsequenceResult.consequenceExtraCostEntries,
    });
    const resolutionOutcome: TurnResolutionOutcome = failForwardSignal.active
      ? "FAIL_FORWARD"
      : finalizedConsequenceResult.outcomeSeverity === "strained"
      ? "SUCCESS_WITH_COST"
      : finalizedConsequenceResult.outcomeSeverity === "harsh"
      ? "SUCCESS_WITH_COMPLICATION"
      : "SUCCESS";
    const resolutionPresentation = buildTurnResolutionPresentation({
      outcome: resolutionOutcome,
      rollTotal: rollTotal ?? null,
      resultLabel: finalizedConsequenceResult.outcomeSeverity,
    });
    const consequencePresentationEntries = [
      ...finalizedConsequenceResult.consequenceComplicationEntries,
      ...finalizedConsequenceResult.consequenceExtraCostEntries,
    ];
    presentation = {
      resolution: resolutionPresentation,
      narration: finalizedConsequenceNarration,
      ledgerEntries: projectLedgerEntries(consequencePresentationEntries),
    };
    const finalTurnPayload = (finalized as any)?.turn ?? {};
    finalTurnPayload.presentation = presentation;
    finalTurnPayload.failForwardComplication = failForwardComplication ?? null;
    finalTurnPayload.effectSummaries = finalizedEffectSummaries;
    finalTurnPayload.opportunityWindow = opportunityWindowState;
    finalTurnPayload.opportunityResolutionModifier = opportunityResolutionModifier;
    finalTurnPayload.opportunityCost = opportunityCost;
    finalTurnPayload.opportunityCostEffect = opportunityCostEffect;
    finalTurnPayload.resolutionCost = typeof stateRecord.resolutionCost === "number" ? stateRecord.resolutionCost : null;
    finalTurnPayload.resolutionCostDelta = resolutionCostDelta || null;
    finalTurnPayload.resolutionCostEffect = resolutionCostEffect;
    finalTurnPayload.complicationRiskEffect = complicationRiskEffect;
    finalTurnPayload.complicationOutcomeEffect = complicationOutcomeEffect;
    finalTurnPayload.finalizedComplications = enforcedFinalizedComplications;
    finalTurnPayload.complicationApplied = enforcedFinalizedComplications.includes("complication-applied");
    finalTurnPayload.complicationPolicyApplied = complicationPolicyResult.policyApplied;
    finalTurnPayload.outcomeSeverity = finalizedConsequenceResult.outcomeSeverity;
    finalTurnPayload.consequenceBudgetExtraCostCount = finalizedConsequenceResult.consequenceBudgetExtraCostCount;
    finalTurnPayload.finalizedComplicationDeltas = finalizedComplicationDeltas;
    finalTurnPayload.complicationDeltaApplied = applyComplicationDeltas;
    finalTurnPayload.npcStance = npcStance;
    finalTurnPayload.watchfulness = watchfulness.level;
    finalTurnPayload.watchfulnessCostDelta = watchfulness.costDelta;
    finalTurnPayload.watchfulnessEffect = watchfulnessEffectSummary;
    finalTurnPayload.positionActionFlags = persistedPositionActionFlags;
    finalTurnPayload.watchfulnessActionFlags = watchfulnessActionFlags;
    finalTurnPayload.noiseActionFlags = persistedNoiseActionFlags;
    finalTurnPayload.actionConstraints = resolverLadder.actionConstraints;
    finalTurnPayload.constraintPressure = resolverLadder.constraintPressure;
    finalTurnPayload.constraintPressureActive = resolverLadder.constraintPressureActive;
    finalTurnPayload.actionRiskDelta = actionRisk.actionRiskDelta;
    finalTurnPayload.actionRiskTier = actionRisk.riskTier;
    finalTurnPayload.complicationWeightDelta = complicationWeight.complicationWeightDelta;
    finalTurnPayload.complicationTier = complicationTier.complicationTier;
    finalTurnPayload.forcedComplicationCount = finalizedConsequenceResult.forcedComplicationCount;
    finalTurnPayload.consequenceComplicationEntries = finalizedConsequenceResult.consequenceComplicationEntries;
    finalTurnPayload.consequenceExtraCostEntries = finalizedConsequenceResult.consequenceExtraCostEntries;
    finalTurnPayload.consequenceNarration = finalizedConsequenceNarration;
    (finalized as any).presentation = presentation;
    (finalized as any).turn = finalTurnPayload;
    (finalized as any).failForwardComplication = failForwardComplication ?? null;
    (finalized as any).effectSummaries = finalizedEffectSummaries;
    (finalized as any).opportunityWindow = opportunityWindowState;
    (finalized as any).opportunityResolutionModifier = opportunityResolutionModifier;
    (finalized as any).opportunityCost = opportunityCost;
    (finalized as any).opportunityCostEffect = opportunityCostEffect;
    (finalized as any).resolutionCost = stateRecord.resolutionCost;
    (finalized as any).resolutionCostDelta = resolutionCostDelta || null;
    (finalized as any).resolutionCostEffect = resolutionCostEffect;
    (finalized as any).complicationRiskEffect = complicationRiskEffect;
    (finalized as any).complicationOutcomeEffect = complicationOutcomeEffect;
    (finalized as any).finalizedComplications = enforcedFinalizedComplications;
    (finalized as any).complicationApplied = enforcedFinalizedComplications.includes("complication-applied");
    (finalized as any).complicationPolicyApplied = complicationPolicyResult.policyApplied;
    (finalized as any).outcomeSeverity = finalizedConsequenceResult.outcomeSeverity;
    (finalized as any).consequenceBudgetExtraCostCount = finalizedConsequenceResult.consequenceBudgetExtraCostCount;
    (finalized as any).finalizedComplicationDeltas = finalizedComplicationDeltas;
    (finalized as any).complicationDeltaApplied = applyComplicationDeltas;
    (finalized as any).npcStance = npcStance;
    (finalized as any).watchfulness = watchfulness.level;
    (finalized as any).watchfulnessCostDelta = watchfulness.costDelta;
    (finalized as any).watchfulnessEffect = watchfulnessEffectSummary;
    (finalized as any).watchfulnessActionFlags = watchfulnessActionFlags;
    (finalized as any).positionActionFlags = persistedPositionActionFlags;
    (finalized as any).noiseActionFlags = persistedNoiseActionFlags;
    (finalized as any).actionConstraints = resolverLadder.actionConstraints;
    (finalized as any).constraintPressure = resolverLadder.constraintPressure;
    (finalized as any).constraintPressureActive = resolverLadder.constraintPressureActive;
    (finalized as any).actionRiskDelta = actionRisk.actionRiskDelta;
    (finalized as any).actionRiskTier = actionRisk.riskTier;
    (finalized as any).complicationWeightDelta = complicationWeight.complicationWeightDelta;
    (finalized as any).complicationTier = complicationTier.complicationTier;
    (finalized as any).forcedComplicationCount = finalizedConsequenceResult.forcedComplicationCount;
    (finalized as any).consequenceComplicationEntries = finalizedConsequenceResult.consequenceComplicationEntries;
    (finalized as any).consequenceExtraCostEntries = finalizedConsequenceResult.consequenceExtraCostEntries;
    (finalized as any).consequenceNarration = finalizedConsequenceNarration;
    const renderPriority = deriveRenderPriority(finalSceneTransition, escalation);
    console.log("scene.branch.debug", {
      adventureId,
      turnIndex: latestTurn?.turnIndex ?? null,
      modelStatus: "ok",
      hasPreviousSceneContinuity: Boolean(previousSceneContinuity),
      hasCanonicalPayload: Boolean(canonicalPayload),
      hasPreviousCanonicalPayload: Boolean(previousSceneContinuity?.canonicalPayload),
      hasPreviousSceneArt: Boolean(previousSceneContinuity?.sceneArt),
    });

    const debugHasHydratedPreviousSceneContinuity =
      hasHydratedPreviousSceneKey ||
      hasPreviousCanonicalPayload ||
      debugHasPreviousSceneArt;
    console.log("scene.reuse.inputs", {
      previousCanonicalKey,
      currentCanonicalKey,
      previousSceneIdentityKey,
      currentSceneIdentityKey,
      sameScene,
      hasPreviousSceneContinuity: debugHasHydratedPreviousSceneContinuity,
      hasHydratedPreviousSceneKey,
      hasPreviousCanonicalPayload,
      hasPreviousSceneArt: debugHasPreviousSceneArt,
      sceneArtKeyMismatch: previousSceneContinuity?.sceneArtKeyMismatch ?? null,
      previousShotKey: previousSceneContinuity?.shotKey ?? null,
      canUseSceneDelta: renderDecisionOutcome.canUseSceneDelta,
      canReusePreviousSceneArt: renderDecisionOutcome.canReusePreviousSceneArt,
    });
    if (!renderDecisionOutcome.canUseSceneDelta && !previousSceneContinuity?.sceneKey) {
      console.log("scene.delta.missing", {
        sceneKey: currentCanonicalKey,
        previousSceneKey: previousCanonicalKey,
      });
    }
    console.log("scene.branch.selector", {
      previousCanonicalKey,
      currentCanonicalKey,
      sameScene,
      hasPreviousCanonicalPayload,
      hasPreviousSceneArt: debugHasPreviousSceneArt,
      sceneArtKeyMismatch: previousSceneContinuity?.sceneArtKeyMismatch ?? null,
      canUseSceneDelta: renderDecisionOutcome.canUseSceneDelta,
      canReusePreviousSceneArt: renderDecisionOutcome.canReusePreviousSceneArt,
    });
    const branch = (finalized as any)?.branch ?? "legacy";

    if (branch === "legacy" && canonicalPayload && refreshDecision) {
      const legacySceneArt = await orchestrateLegacySceneArtDecision({
        sceneArtPayload: canonicalPayload,
        refreshDecision,
        existingSceneArt,
        queueSceneArt,
        renderPriority,
        renderMode,
      });

      if (legacySceneArt) {
        sceneArtResult = legacySceneArt;
      }
    }

    let baseSceneArtRow = sceneArtResult ?? existingSceneArt ?? null;
    if (baseSceneArtRow && !baseSceneArtRow.promptHash) {
      console.error("scene.art.row.missing_prompt_hash", {
        stage: "base",
        sceneKey: baseSceneArtRow.sceneKey ?? null,
        promptHash: baseSceneArtRow.promptHash ?? null,
        status: baseSceneArtRow.status,
      });
      baseSceneArtRow = null;
    }
    let finalSceneArtRow = await resolveFinalSceneArtRow({
      existingSceneArt: baseSceneArtRow,
      refreshDecision,
      sceneArtPayload,
      renderPriority,
      renderMode,
      engineVersion: ENGINE_VERSION,
    });

    if (finalSceneArtRow && !finalSceneArtRow.promptHash) {
      console.error("scene.art.row.missing_prompt_hash", {
        stage: "final",
        sceneKey: finalSceneArtRow.sceneKey,
        promptHash: finalSceneArtRow.promptHash,
        status: finalSceneArtRow.status,
      });
      finalSceneArtRow = null;
    }

    await maybeCacheSceneArt(finalSceneArtRow);
    const finalSceneArt = buildFinalSceneArtContract(finalSceneArtRow);
    console.log("turn.debug.summary", {
      playerIntentMode,
      normalizedInput,
      outcomeTier: resolvedOutcomeTier,
      rawRoll: rollTotal ?? null,
      effectiveRollTotal,
      difficulty: adjustedDifficulty,
      margin,
      actionTags: authoredEffects?.tags ?? [],
      authoredDeltaKinds: (authoredEffects?.stateDeltas ?? []).map((delta) => delta.kind ?? (delta as any).op ?? "unknown"),
      authoredLedgerCount: authoredEffects?.ledgerAdds?.length ?? 0,
      hasProgress: classification.hasProgress,
      hasCost: classification.hasCost,
    });
    console.log("TURN_SCENE_ART_RETURN", finalSceneArt);

    const baseStateDeltas = [
      ...turnStateDeltas,
      ...(authoredEffects?.stateDeltas ?? []),
    ];
    const classification = classifyResolvedTurnDeltas(baseStateDeltas);
    console.log("turn.mode.summary", {
      mode: playerIntentMode ?? null,
      actionTags: authoredEffects?.tags ?? [],
      progressDetected: classification.hasProgress,
      costDetected: classification.hasCost,
      authoredDeltaKinds: (authoredEffects?.stateDeltas ?? []).map((delta) => delta.kind ?? (delta as any).op ?? "unknown"),
      authoredLedgerCount: authoredEffects?.ledgerAdds?.length ?? 0,
      authoredPressureDelta: summarizePressureDeltas(authoredEffects?.stateDeltas ?? []),
    });
    const deltaBuffer = [...baseStateDeltas];
    const costNeeded = ["success_with_cost", "mixed", "failure_with_progress"].includes(resolvedOutcomeTier);
    if (costNeeded && !classification.hasCost) {
      const pressureDeltas = inferPressureDeltas({
        mode: playerIntentMode ?? "LOOK",
        outcomeTier: resolvedOutcomeTier,
        tags,
      }).map((delta) => {
        if (delta.kind === "pressure.add") {
          return {
            ...delta,
            amount: delta.amount * modifiers.pressureMultiplier,
          };
        }
        return delta;
      });
      deltaBuffer.push(...pressureDeltas);
    }
    const pressureThresholdDeltas = evaluatePressureThresholds({
      stateStats: asRecord(stateRecord.stats) ?? {},
      deltas: deltaBuffer,
    });
    deltaBuffer.push(...pressureThresholdDeltas);

    const margin = hasRoll ? (effectiveRollTotal as number) - adjustedDifficulty : null;
    console.log("turn.outcome.classification", {
      rawRoll: rollTotal ?? null,
      effectiveRollTotal,
      difficulty: adjustedDifficulty,
      margin,
      progressDetected: classification.hasProgress,
      costDetected: classification.hasCost,
      selectedTier: resolvedOutcomeTier,
      modifiers,
      actionTags: authoredEffects?.tags ?? [],
    });


    const resolvedTurn: ResolvedTurn = {
      outcome: {
        tier: resolvedOutcomeTier,
        roll: resolvedRoll,
      },
      stateDeltas: deltaBuffer,
      ledgerAdds: normalizedLedgerAdds,
      sceneUpdate: sceneTransitionPayload
        ? {
            locationId: (sceneTransitionPayload as any)?.locationId ?? null,
            sceneId: sceneTransitionPayload.sceneKey ?? null,
            tags: sceneTransitionPayload.tags ?? undefined,
          }
        : null,
      presentation: {
        sceneText: scenePresentation.sceneText?.trim()
          ? scenePresentation.sceneText
          : "(no scene text generated)",
        consequenceText: scenePresentation.consequenceText ?? [],
      },
    };
    console.log("turn.contract.resolved", resolvedTurn);
    const validationIssues = validateResolvedTurnContract(resolvedTurn);
    if (validationIssues.length > 0) {
      console.log("turn.contract.validation", {
        issues: validationIssues,
      });
    }

    const responseBody = {
      ok: true,
      action: action ?? null,
      tags,
      rollTotal: rollTotal ?? null,
      ...finalized,
      turn: {
        ...(finalized as any).turn,
        stateDeltas: turnStateDeltas,
        ledgerAdds: normalizedLedgerAdds,
      },
      stateDeltas: turnStateDeltas,
      ledgerAdds: normalizedLedgerAdds,
      sceneArt: finalSceneArt,
      sceneTransition: sceneTransitionPayload,
      scenePresentation,
      sceneContinuity: finalContinuityInfo,
    };

    if (finalSceneArt) {
      assertSceneArtInvariant({
        status: finalSceneArt.status as SceneArtStatus,
        imageUrl: finalSceneArt.imageUrl,
        errorCode: null,
      });
    }

    logFinalSceneArtContract(responseBody);
    return NextResponse.json(responseBody, { status: 200 });
  } catch (err: unknown) {
    if (isRequestBodyTooLargeError(err)) {
      return errorResponse(413, "Payload too large");
    }

    if (holdKey && leaseKeyForCleanup) {
      await releaseUsageAndLeaseBestEffort(db, { holdKey, leaseKey: leaseKeyForCleanup, now: new Date() });
    }

    const e = err as { code?: string; message?: string };
    if (e?.code === "P2025") {
      return errorResponse(404, "Adventure not found");
    }
    if (e?.code === "P2002") {
      return errorResponse(409, "Duplicate request");
    }

    logStructuredFailure({
      context: "turn.post",
      code: e?.code ?? "INTERNAL_ERROR",
      message: e?.message ?? "Internal error",
      details: { adventureId: requestBody?.adventureId, userId: user.id },
    });

    console.error(err);
    return errorResponse(500, "Internal error");
  }
}

export type SceneArtTriggerIntegrationOptions = {
  sceneArtPayload: SceneArtPayload | null;
  previousState: Record<string, unknown> | null;
  currentState: Record<string, unknown>;
  previousSceneIdentity: SceneIdentity | null;
  currentSceneIdentity: SceneIdentity;
  latestTurnScene: string | null;
  renderMode: RenderMode;
};

export async function runSceneArtTriggerIntegration(
  options: SceneArtTriggerIntegrationOptions,
): Promise<void> {
  if (!options.sceneArtPayload) return;
  try {
    await evaluateSceneArtVisualTrigger({
      previousState: options.previousState,
      currentState: options.currentState,
      previousIdentity: options.previousSceneIdentity,
      currentIdentity: options.currentSceneIdentity,
      sceneKey: options.sceneArtPayload.sceneKey,
      sceneText: options.latestTurnScene,
      stylePreset: options.sceneArtPayload.stylePreset,
      renderMode: options.renderMode,
      engineVersion: ENGINE_VERSION,
    });
  } catch (error) {
    logSceneArtEvent("scene.art.trigger.error", {
      sceneKey: options.sceneArtPayload.sceneKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function makeDefaultDeps(): PostHandlerDeps {
  return {
    executeTurn,
    prismaClient: prisma,
  };
}

export const POST = withRouteLogging("POST /api/turn", async (req: NextRequest, _context: { params: Promise<{}> }) => {
  return postTurn(req, makeDefaultDeps());
});
