import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
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
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { findSceneArt, queueSceneArt } from "@/lib/sceneArtRepo";
import { SceneArtPayload } from "@/lib/sceneArt";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { SceneTransition, resolveSceneTransition } from "@/lib/resolveSceneTransition";
import { resolveSceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";

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
        console.log("TURN RETURN 1", { reason: "BUDGET_EXCEEDED" });
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

        console.log("TURN RETURN 2", { reason: "ADVENTURE_FORBIDDEN" });
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
          console.log("sceneArt route before queue", {
            sceneKey: canonicalPayload.sceneKey,
            branch: "legacy",
            reason: "MODEL_ERROR",
          });
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
          console.log("sceneArt queue gate", {
            sceneKey: canonicalPayload.sceneKey,
            shouldQueue,
            branch: "legacy",
            reason: "MODEL_ERROR",
            refreshDecision,
          });
          if (existingSceneArt) {
            console.log("sceneArt route returning response", {
              sceneKey: canonicalPayload.sceneKey,
              branch: "legacy",
              reason: "MODEL_ERROR",
            });
          } else if (shouldQueue) {
            console.log("sceneArt queue request", {
              sceneKey: canonicalPayload.sceneKey,
              title: canonicalPayload.title,
            });
            const queued = await queueSceneArt(canonicalPayload, ENGINE_VERSION);
            console.log("sceneArt queue persisted", {
              sceneKey: queued.sceneKey,
              status: queued.status,
              id: queued.id,
            });
            console.log("sceneArt route returning response", {
              sceneKey: canonicalPayload.sceneKey,
              branch: "legacy",
              reason: "MODEL_ERROR",
            });
          }
        }
        console.log("TURN RETURN 3", { reason: "MODEL_ERROR" });
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
      select: { state: true },
    });
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
        console.log("TURN RETURN 4", { reason: "LEGACY_NOT_FOUND" });
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
    const previousComposition =
      previousVisualState &&
      previousFramingState &&
      previousSubjectState &&
      previousActorState
        ? {
            visual: previousVisualState,
            framing: previousFramingState,
            subject: previousSubjectState,
            actor: previousActorState,
          }
        : null;
    const nextComposition = {
      visual: nextVisualState,
      framing: nextFramingState,
      subject: nextSubjectState,
      actor: nextActorState,
    };
    const sceneTransition = resolveSceneTransition({
      previous: previousComposition,
      next: nextComposition,
    });
    const previousSceneArtPayload =
      previousTurn && previousStateRecord
        ? buildCanonicalSceneArtPayload({
            turn: previousTurn,
            state: previousStateRecord,
          })
        : null;
    const visualStateDeltas = diffSceneVisualState(previousVisualState, nextVisualState);
    const visualLedgerEntries = visualStateDeltas.map((delta) => ({
      kind: "visual_state",
      domain: "visual",
      cause: `Visual ${delta.key}`,
      effect: delta.message,
    }));
    const transitionLedgerEntry = previousComposition
      ? {
          kind: "scene_transition",
          domain: "visual",
          cause: `Scene ${sceneTransition.type}`,
          effect: describeSceneTransition(sceneTransition),
        }
      : null;
    const ledgerAddsWithVisual = [
      ...turnLedgerAdds,
      ...visualLedgerEntries,
      ...(transitionLedgerEntry ? [transitionLedgerEntry] : []),
    ];
    const branch = (finalized as any)?.branch ?? "legacy";
    const sceneArtPayload = buildCanonicalSceneArtPayload({
      turn: latestTurn,
      state: stateRecord,
    });

    let sceneArt: { sceneKey: string; status: string; imageUrl: string | null } | null = null;

    if (branch === "legacy" && sceneArtPayload) {
      console.log("sceneArt route before queue", {
        adventureId,
        branch,
        sceneKey: sceneArtPayload.sceneKey,
      });
      console.log("sceneArt canonical source", {
        sceneKey: sceneArtPayload.sceneKey,
        basePrompt: sceneArtPayload.basePrompt,
      });

      const existingSceneArt = await findSceneArt(sceneArtPayload.sceneKey);
      const existingPreviousSceneArt =
        previousSceneArtPayload && previousSceneArtPayload.sceneKey !== sceneArtPayload.sceneKey
          ? await findSceneArt(previousSceneArtPayload.sceneKey)
          : previousSceneArtPayload
          ? existingSceneArt
          : null;

      const refreshDecision = resolveSceneRefreshDecision({
        transitionType: sceneTransition.type,
        currentSceneKey: sceneArtPayload.sceneKey,
        previousSceneKey: previousSceneArtPayload?.sceneKey ?? null,
        currentReady: existingSceneArt?.status === "ready",
        previousReady: existingPreviousSceneArt?.status === "ready",
      });

      console.log("sceneArt refresh decision", {
        sceneKey: sceneArtPayload.sceneKey,
        decision: refreshDecision,
      });

      const shouldQueue = refreshDecision.shouldQueueRender && !existingSceneArt;
      console.log("sceneArt queue gate", {
        sceneKey: sceneArtPayload.sceneKey,
        shouldQueue,
        branch,
        refreshDecision,
      });

      if (existingSceneArt) {
        sceneArt = {
          sceneKey: existingSceneArt.sceneKey,
          status: existingSceneArt.status,
          imageUrl: existingSceneArt.imageUrl,
        };
      } else if (shouldQueue) {
        console.log("sceneArt queue request", {
          sceneKey: sceneArtPayload.sceneKey,
          title: sceneArtPayload.title,
        });
        const queued = await queueSceneArt(sceneArtPayload, ENGINE_VERSION);
        console.log("sceneArt queue persisted", {
          sceneKey: queued.sceneKey,
          status: queued.status,
          id: queued.id,
        });
        sceneArt = {
          sceneKey: sceneArtPayload.sceneKey,
          status: queued.status,
          imageUrl: queued.imageUrl,
        };
      }
      console.log("sceneArt route returning response", {
        adventureId,
        branch,
        sceneKey: sceneArtPayload.sceneKey,
      });
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
        sceneArt,
        sceneTransition,
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
  console.log("TURN ROUTE SENTINEL", {
    file: "app/api/turn/route.ts",
    ts: Date.now(),
  });
  return postTurn(req, makeDefaultDeps());
});
