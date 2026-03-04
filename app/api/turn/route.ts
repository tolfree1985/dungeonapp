import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "../../../src/generated/prisma";
import { errorResponse } from "@/lib/api/errorResponse";
import { isRequestBodyTooLargeError, readJsonWithLimit } from "@/lib/api/readJsonWithLimit";
import { withRouteLogging } from "@/lib/api/routeLogging";
import { checkSoftRateLimit, softRateActorKey, softRateLimitTurnPostPerMinute } from "@/lib/api/softRateLimit";
import { BillingError } from "../../../src/lib/billing/errors";
import { estimateTokens } from "../../../src/lib/billing/estimate";
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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type PostBody = {
  adventureId: string;
  playerText: string;
  userId?: string;
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

async function runModelStub(args: { prompt: string; max_tokens: number }): Promise<StubModelResult> {
  const scene = `You pause at the cellar door. (Stub model, max_tokens=${args.max_tokens})`;
  const resolution = { notes: "Stub response.", max_tokens: args.max_tokens };
  const outputTokens = Math.min(args.max_tokens, estimateTokens(`${scene} ${JSON.stringify(resolution)}`));
  return { scene, resolution, outputTokens };
}

type PostHandlerDeps = {
  executeTurn?: typeof executeTurn;
};

async function postTurn(req: Request, deps: PostHandlerDeps = {}) {
  let holdKey = "";
  let leaseKeyForCleanup = "";

  try {
    const body = (await readJsonWithLimit<Partial<PostBody>>(req)) as Partial<PostBody>;

    if (!body?.adventureId || typeof body.adventureId !== "string") {
      return errorResponse(400, "Missing/invalid adventureId");
    }
    if (!body?.playerText || typeof body.playerText !== "string") {
      return errorResponse(400, "Missing/invalid playerText");
    }

    const adventureId: string = body.adventureId;
    const playerText: string = body.playerText;

    const now = new Date();
    const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "anon";

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
        : hashHex(`${adventureId}|${userId}|${tier}|${monthKey}|${playerText}`);

    // Idempotency replay: if we've already applied this idempotencyKey for this adventure,
    // return the previously persisted payload and do NOT re-run billing or create new Turn/TurnEvent.
    const prevApplied = await prisma.turnEvent.findFirst({
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

        return NextResponse.json(
          {
            ok: true,
            replayed: true,
            ...parsed,
            ...(parsedTurn ? { turn: parsedTurn } : {}),
            stateDeltas: replayStateDeltas,
            ledgerAdds: replayLedgerAdds,
          },
          { status: 200 }
        );
      } catch {
        // If turnJson is unexpectedly not JSON, still return a safe replay response.
        return NextResponse.json(
          {
            ok: true,
            replayed: true,
            idempotencyKey,
            turnEventId: prevApplied.eventId,
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

    let preflight;
    try {
      preflight = await prisma.$transaction((tx) =>
        preflightHoldOrThrow(tx, {
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
          prisma,
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
          prisma,
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

    return NextResponse.json(
      {
        ok: true,
        ...finalized,
        turn: {
          ...(finalized as any).turn,
          stateDeltas: turnStateDeltas,
          ledgerAdds: turnLedgerAdds,
        },
        stateDeltas: turnStateDeltas,
        ledgerAdds: turnLedgerAdds,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (isRequestBodyTooLargeError(err)) {
      return errorResponse(413, "Payload too large");
    }

    if (holdKey && leaseKeyForCleanup) {
      await releaseUsageAndLeaseBestEffort(prisma, { holdKey, leaseKey: leaseKeyForCleanup, now: new Date() });
    }

    const e = err as { code?: string; message?: string };
    if (e?.code === "P2025") {
      return errorResponse(404, "Adventure not found");
    }
    if (e?.code === "P2002") {
      return errorResponse(409, "Duplicate request");
    }

    console.error(err);
    return errorResponse(500, "Internal error");
  }
}

function makeDefaultDeps(): PostHandlerDeps {
  return {
    executeTurn,
  };
}

export const POST = withRouteLogging("POST /api/turn", async (req: NextRequest, _context: { params: Promise<{}> }) => {
  return postTurn(req, makeDefaultDeps());
});
