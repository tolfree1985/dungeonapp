import type { PrismaClient } from "@prisma/client";
import { buildBudgetExceeded429Payload, type BudgetExceeded429Payload } from "./deterministic429";
import { getTurnGuardVerdict, type TurnGuardInputs } from "@/server/turn/guard/getTurnGuardVerdict";
import type { TurnGuardDenyCode } from "@/server/turn/guard/types";
import { reserveUsageDayLock as realReserveUsageDayLock } from "@/server/usage/reserveUsageDayLock";

export class Usage429Error extends Error {
  readonly payload: BudgetExceeded429Payload;
  constructor(payload: BudgetExceeded429Payload) {
    super("USAGE_429");
    this.name = "Usage429Error";
    this.payload = payload;
  }
}

export type UsageGuardResult = { ok: true };

type EnforceUsageTxArgs = {
  saveId: string;
  idempotencyKey: string;
  userId?: string;
  softRateResult?: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
  inputChars?: number;
  adventureLocked?: boolean;
  usageVerdict?: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
};

function mapGuardCodeToBudgetCode(code: TurnGuardDenyCode): "CONCURRENCY_LIMIT_EXCEEDED" | "MONTHLY_TOKEN_CAP_EXCEEDED" {
  return "CONCURRENCY_LIMIT_EXCEEDED";
}

type TransactionClient = Parameters<PrismaClient["$transaction"]>[0] extends (tx: infer T) => any ? T : never;

type EnforceUsageDeps = {
  getTurnGuardVerdict: typeof getTurnGuardVerdict;
  reserveUsageDayLock: typeof realReserveUsageDayLock;
};

const defaultDeps: EnforceUsageDeps = {
  getTurnGuardVerdict,
  reserveUsageDayLock: realReserveUsageDayLock,
};

export async function enforceUsageTx<T>(
  tx: TransactionClient,
  args: EnforceUsageTxArgs,
  runTurnWork: (guard: UsageGuardResult) => Promise<T>,
  deps: EnforceUsageDeps = defaultDeps
): Promise<T> {
  if (process.env.TURN_PIPELINE === "1" && process.env.PIPELINE_TRIPWIRE === "1") {
    throw new Error("PIPELINE_TRIPWIRE: enforceUsageTx called while TURN_PIPELINE=1");
  }
  console.log("[enforceUsageTx] called", { saveId: args.saveId, idempotencyKey: args.idempotencyKey });
  console.log("[enforceUsageTx] DATABASE_URL =", process.env.DATABASE_URL);

  const guardInputs: TurnGuardInputs = {
    userId: args.userId ?? "unknown",
    adventureId: args.saveId,
    flags: { TURN_PIPELINE: process.env.TURN_PIPELINE === "1" },
    request: {
      inputChars: args.inputChars,
      idempotencyKey: args.idempotencyKey,
      softRate: args.softRateResult ?? null,
    },
    context: {
      adventureLocked: args.adventureLocked,
      usageVerdict: args.usageVerdict ?? null,
    },
  };

  const guardVerdict = deps.getTurnGuardVerdict(guardInputs);

  if (!guardVerdict.allowed) {
    const retryAt = guardVerdict.retryAfterMs
      ? new Date(Date.now() + guardVerdict.retryAfterMs).toISOString()
      : new Date().toISOString();
    const payload = buildBudgetExceeded429Payload({
      code: mapGuardCodeToBudgetCode(guardVerdict.code),
      idempotencyKey: args.idempotencyKey,
      retryAt,
    });
    payload.idempotency_key = args.idempotencyKey;
    throw new Usage429Error(payload);
  }

  const key = `save:${args.saveId}:inflight`;
  const day = "inflight";

  const got = await deps.reserveUsageDayLock(tx, key, day);

  if (got.count !== 1) {
    const payload = buildBudgetExceeded429Payload({
      code: "CONCURRENCY_LIMIT_EXCEEDED",
      idempotencyKey: args.idempotencyKey,
      retryAt: new Date().toISOString(),
    });
    payload.idempotency_key = args.idempotencyKey;
    throw new Usage429Error(payload);
  }

  try {
    const guard: UsageGuardResult = { ok: true };
    return await runTurnWork(guard);
  } finally {
    await tx.usageDay.updateMany({
      where: { key, day, turns: 1 },
      data: { turns: 0 },
    });
  }
}
