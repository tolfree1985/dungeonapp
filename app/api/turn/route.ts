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
import { findSceneArt, queueSceneArt } from "@/lib/sceneArtRepo";
import { SceneArtPayload } from "@/lib/sceneArt";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { SceneTransition, resolveSceneTransition } from "@/lib/resolveSceneTransition";
import { resolveSceneTransitionMemory } from "@/lib/resolveSceneTransitionMemory";
import { resolveSceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import type { SceneCameraContinuityState, SceneTransitionMemory } from "@/lib/sceneTypes";
import { INITIAL_SCENE_CAMERA_CONTINUITY } from "@/lib/sceneTypes";
import { resolveSceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";
import { EMPTY_SCENE_TRANSITION_MEMORY } from "@/lib/sceneTypes";
import { resolveSceneCameraEscalationDecision } from "@/lib/resolveSceneCameraEscalationDecision";
import type { SceneCameraEscalationDecision } from "@/lib/resolveSceneCameraEscalationDecision";
import { resolveTurnSceneArtPresentation } from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneArtRow } from "@/lib/resolveTurnSceneArtPresentation";
import type { SceneArtPriority } from "@/generated/prisma";

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
}): Promise<SceneArtRow | null> {
  const { sceneArtPayload, refreshDecision, existingSceneArt, queueSceneArt, renderPriority = "normal" } = args;
  if (!sceneArtPayload) return existingSceneArt ? { ...existingSceneArt } : null;
  if (existingSceneArt) return { ...existingSceneArt };
  if (refreshDecision?.shouldQueueRender) {
    const queued = await queueSceneArt(sceneArtPayload, ENGINE_VERSION, renderPriority);
    return {
      sceneKey: sceneArtPayload.sceneKey,
      status: queued.status,
      imageUrl: queued.imageUrl,
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

  if (!user && process.env.NODE_ENV !== "production") {
    user = { id: "dev-user", authMethod: "session" } as AuthenticatedUser;
  }

  if (!user) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await readJsonWithLimit<Partial<PostBody>>(req)) as Partial<PostBody>;
    requestBody = body;

    if ("save_id" in (body ?? {}) || "player_input" in (body ?? {})) {
      return errorResponse(400, "Use adventureId and playerText");
    }
    if (!body?.adventureId || typeof body.adventureId !== "string") {
      return errorResponse(400, "Missing/invalid adventureId");
    }
    if (!body?.playerText || typeof body.playerText !== "string") {
      return errorResponse(400, "Missing/invalid playerText");
    }
    if (body.action !== undefined && typeof body.action !== "string") {
      return errorResponse(400, "Missing/invalid action");
    }
    if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string"))) {
      return errorResponse(400, "Missing/invalid tags");
    }
    if (body.rollTotal !== undefined && !Number.isFinite(body.rollTotal)) {
      return errorResponse(400, "Missing/invalid rollTotal");
    }

    const adventureId: string = body.adventureId;
    const playerText: string = body.playerText;
    const action = typeof body.action === "string" ? body.action : undefined;
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const rollTotal = typeof body.rollTotal === "number" ? body.rollTotal : undefined;

    const now = new Date();
    const userId = user.id;
    let ownership;
    try {
      ownership = await getOrClaimAdventureForUser({
        db,
        adventureId,
        userId,
      });
    } catch (error) {
      if (isAdventureOwnershipError(error)) {
        return errorResponse(error.status, error.code);
      }
      throw error;
    }

    if (!ownership.adventure) {
      return errorResponse(404, "Adventure not found");
    }

    // Dev-only bypass for smoke/budget harness traffic.
    const smokeBypassHeader = req.headers.get("x-smoke-bypass-soft-rate-limit");
    const smokeBypassRateLimit = process.env.NODE_ENV !== "production" && smokeBypassHeader === "1";
    let softRateResult: { allowed: boolean; retryAfterMs?: number; reason?: string } | null = null;

    if (!smokeBypassRateLimit) {
      const rateLimit = checkSoftRateLimit({
        action: "turn_post",
        actorKey: softRateActorKey(req, userId),
        limitPerMinute: softRateLimitTurnPostPerMinute(),
      });
      softRateResult = {
        allowed: rateLimit.allowed,
        retryAfterMs: Number(rateLimit.retryAfterSeconds) * 1000,
        reason: "soft limit",
      };
      if (!rateLimit.allowed) {
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

    let sceneArtResult: { sceneKey: string; status: string; imageUrl: string | null } | null = null;

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
        const canonicalPayload = buildCanonicalSceneArtPayload({
          turn: persistedLatestTurn,
          state: persistedStateRecord,
        });
          if (canonicalPayload) {
            const existingSceneArt = await findSceneArt(canonicalPayload.sceneKey);
            const refreshDecision = resolveSceneRefreshDecision({
              transitionType: null,
              currentSceneKey: canonicalPayload.sceneKey,
              previousSceneKey: null,
              currentReady: existingSceneArt?.status === "ready",
              previousReady: false,
            });
            console.log("sceneArt refresh decision", {
              sceneKey: canonicalPayload.sceneKey,
              decision: refreshDecision,
              branch: "legacy",
              reason: "MODEL_ERROR",
            });
            const shouldQueue = refreshDecision.shouldQueueRender && !existingSceneArt;
            if (shouldQueue) {
              const queued = await queueSceneArt(canonicalPayload, ENGINE_VERSION);
              sceneArtResult = {
                sceneKey: canonicalPayload.sceneKey,
                status: queued.status,
                imageUrl: queued.imageUrl,
              };
            } else if (existingSceneArt) {
              sceneArtResult = {
                sceneKey: existingSceneArt.sceneKey,
                status: existingSceneArt.status,
                imageUrl: existingSceneArt.imageUrl,
              };
            }
          }
          return NextResponse.json(
            {
              ok: true,
              replayed: true,
            idempotencyKey,
            turnEventId: prevApplied.eventId,
            action: action ?? null,
            tags,
            rollTotal: rollTotal ?? null,
            stateDeltas: [],
            ledgerAdds: [],
          },
          { status: 200 }
        );
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
    const previousVisualState = previousStateRecord
      ? resolveSceneVisualState(previousStateRecord)
      : null;
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
    const turns = await db.turn.findMany({
      where: { adventureId },
      orderBy: { turnIndex: "desc" },
      take: 2,
    });
    const latestTurn = turns[0] ?? null;
    const previousTurn = turns[1] ?? null;
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
    const previousFramingState = previousTurn && previousVisualState
      ? resolveSceneFramingState({
          turn: previousTurn,
          visual: previousVisualState,
          locationChanged: false,
        })
      : null;
    const previousSubjectState = previousFramingState
      ? resolveSceneSubjectState({
          state: previousStateRecord,
          framing: previousFramingState,
        })
      : null;
    const previousActorState = previousSubjectState
      ? resolveSceneActorState({
          state: previousStateRecord,
          subject: previousSubjectState,
        })
      : null;
    const previousFocusState = previousActorState
      ? resolveSceneFocusState({
          state: previousStateRecord,
          framing: previousFramingState!,
          subject: previousSubjectState!,
          actor: previousActorState,
        })
      : null;
    const previousSceneState =
      previousFramingState &&
      previousSubjectState &&
      previousActorState &&
      previousFocusState
        ? {
            framing: previousFramingState,
            subject: previousSubjectState,
            actor: previousActorState,
            focus: previousFocusState,
          }
        : null;
    const previousComposition =
      previousVisualState && previousSceneState
        ? {
            visual: previousVisualState,
            framing: previousSceneState.framing,
            subject: previousSceneState.subject,
            actor: previousSceneState.actor,
            focus: previousSceneState.focus,
          }
        : null;
    const sceneArtPayload = buildCanonicalSceneArtPayload({
      turn: latestTurn,
      state: stateRecord,
    });
    const existingSceneArt = sceneArtPayload ? await findSceneArt(sceneArtPayload.sceneKey) : null;
    const existingPreviousSceneArt =
      previousSceneArtPayload && sceneArtPayload && previousSceneArtPayload.sceneKey !== sceneArtPayload.sceneKey
        ? await findSceneArt(previousSceneArtPayload.sceneKey)
        : previousSceneArtPayload
        ? existingSceneArt
        : null;
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
          previousSceneComposition,
          previousSceneArt: existingSceneArt,
          previousSceneArtForPreviousKey: existingPreviousSceneArt,
          previousTransitionMemory,
          previousSceneKey: previousSceneArtPayload?.sceneKey ?? null,
          pressureStage: nextVisualState.pressureStage ?? null,
          modelStatus: "ok",
        })
      : {
          canonicalPayload: null,
          sceneTransition: null,
          refreshDecision: null,
          transitionMemory: previousTransitionMemory ?? EMPTY_SCENE_TRANSITION_MEMORY,
          sceneArtResult: null,
          shouldCreateSceneArt: false,
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
      continuityState = escalation.nextContinuityState;
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
          previousSceneComposition,
          previousSceneArt: existingSceneArt,
          previousSceneArtForPreviousKey: existingPreviousSceneArt,
          previousTransitionMemory,
          previousSceneKey: previousSceneArtPayload?.sceneKey ?? null,
          pressureStage: nextVisualState.pressureStage ?? null,
          modelStatus: "ok",
        });
      }
    }
    sceneArtResult = presentation.sceneArtResult;
    const canonicalPayload = presentation.canonicalPayload;
    const sceneTransition = presentation.sceneTransition;
    const sceneTransitionWithEscalation = sceneTransition
      ? {
          ...sceneTransition,
          shouldEscalateCamera: escalation?.shouldEscalateCamera ?? false,
        }
      : null;
    const transitionMemory = presentation.transitionMemory;
    const refreshDecision = presentation.refreshDecision;
    await persistSceneTransitionMemory({
      db,
      adventureId,
      transitionMemory,
      continuityState,
    });
    if (refreshDecision && canonicalPayload) {
      console.log("sceneArt refresh decision", {
        sceneKey: canonicalPayload.sceneKey,
        decision: refreshDecision,
      });
    }
    const visualStateDeltas = diffSceneVisualState(previousVisualState, nextVisualState);
    const visualLedgerEntries = visualStateDeltas.map((delta) => ({
      kind: "visual_state",
      domain: "visual",
      cause: `Visual ${delta.key}`,
      effect: delta.message,
    }));
    const sceneTransitionPayload = sceneTransitionWithEscalation ?? sceneTransition;
    const transitionLedgerEntry = previousComposition && sceneTransitionWithEscalation
      ? {
          kind: "scene_transition",
          domain: "visual",
          cause: `Scene ${sceneTransitionWithEscalation.type}`,
          effect: describeSceneTransition(sceneTransitionWithEscalation),
        }
      : null;
    const ledgerAddsWithVisual = [
      ...turnLedgerAdds,
      ...visualLedgerEntries,
      ...(transitionLedgerEntry ? [transitionLedgerEntry] : []),
    ];
    const renderPriority = deriveRenderPriority(sceneTransition, escalation);
    const branch = (finalized as any)?.branch ?? "legacy";

    if (branch === "legacy" && canonicalPayload && refreshDecision) {
      const legacySceneArt = await orchestrateLegacySceneArtDecision({
        sceneArtPayload: canonicalPayload,
        refreshDecision,
        existingSceneArt,
        queueSceneArt,
        renderPriority,
      });

      if (legacySceneArt) {
        sceneArtResult = legacySceneArt;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        action: action ?? null,
        tags,
        rollTotal: rollTotal ?? null,
        ...finalized,
        turn: {
          ...(finalized as any).turn,
          stateDeltas: turnStateDeltas,
          ledgerAdds: ledgerAddsWithVisual,
        },
        stateDeltas: turnStateDeltas,
        ledgerAdds: ledgerAddsWithVisual,
        sceneArt: sceneArtResult,
        sceneTransition: sceneTransitionPayload,
      },
      { status: 200 }
    );
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

function makeDefaultDeps(): PostHandlerDeps {
  return {
    executeTurn,
    prismaClient: prisma,
  };
}

export const POST = withRouteLogging("POST /api/turn", async (req: NextRequest, _context: { params: Promise<{}> }) => {
  return postTurn(req, makeDefaultDeps());
});
