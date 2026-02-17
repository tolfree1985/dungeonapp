import type { Prisma, PrismaClient, Tier } from "@/generated/prisma";
import { BillingError } from "@/lib/billing/errors";
import { clampOutputTokens } from "@/lib/billing/estimate";
import { TIER_LIMITS } from "@/lib/billing/tiers";

type Tx = Prisma.TransactionClient;

function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002";
}

export type PreflightHoldInput = {
  userId: string;
  adventureId: string;
  tier: Tier;
  holdKey: string;
  leaseKey: string;
  monthKey: string;
  estInputTokens: number;
  capOverrideTokens?: number;
  now?: Date;
};

export type PreflightHoldResult = {
  monthKey: string;
  tier: Tier;
  holdKey: string;
  leaseKey: string;
  inputTokens: number;
  perTurnMaxOutputTokens: number;
  reservedTotal: number;
  holdExpiresAt: Date;
  leaseExpiresAt: Date;
  idempotent: boolean;
};

export type CommitUsageInput = {
  userId: string;
  monthKey: string;
  holdKey: string;
  leaseKey: string;
  actualInputTokens: number;
  actualOutputTokens: number;
  now?: Date;
};

export type CommitUsageResult = {
  userId: string;
  monthKey: string;
  tier: Tier;
  inputTokens: number;
  outputTokens: number;
  consumedTotal: number;
  idempotent: boolean;
};

export type ReleaseUsageInput = {
  holdKey: string;
  leaseKey: string;
  now?: Date;
};

async function activeHoldCount(tx: Tx, userId: string, now: Date) {
  return tx.turnBudgetHold.count({
    where: {
      userId,
      status: "HELD",
      consumedAt: null,
      releasedAt: null,
      expiresAt: { gt: now },
    },
  });
}

async function activeLeaseCount(tx: Tx, userId: string, now: Date) {
  return tx.turnLease.count({
    where: {
      userId,
      releasedAt: null,
      expiresAt: { gt: now },
    },
  });
}

async function cleanupExpiredForUserMonth(
  tx: Tx,
  args: { userId: string; monthKey: string; now: Date }
): Promise<void> {
  const expiredHeld = await tx.turnBudgetHold.findMany({
    where: {
      userId: args.userId,
      monthKey: args.monthKey,
      status: "HELD",
      consumedAt: null,
      releasedAt: null,
      expiresAt: { lte: args.now },
    },
    select: {
      id: true,
      reservedTurns: true,
      reservedTotal: true,
    },
  });

  if (expiredHeld.length > 0) {
    const ids = expiredHeld.map((h) => h.id);
    const releaseTurns = expiredHeld.reduce((n, h) => n + h.reservedTurns, 0);
    const releaseTotal = expiredHeld.reduce((n, h) => n + h.reservedTotal, 0);

    await tx.turnBudgetHold.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "RELEASED",
        releasedAt: args.now,
        expiresAt: args.now,
      },
    });

    await tx.userUsage.updateMany({
      where: { userId: args.userId, monthKey: args.monthKey },
      data: {
        reservedTurns: { decrement: releaseTurns },
        reservedTotal: { decrement: releaseTotal },
      },
    });
  }

  await tx.turnLease.deleteMany({
    where: {
      userId: args.userId,
      OR: [{ expiresAt: { lte: args.now } }, { releasedAt: { not: null } }],
    },
  });
}

export async function preflightHoldOrThrow(
  tx: Tx,
  input: PreflightHoldInput
): Promise<PreflightHoldResult> {
  const now = input.now ?? new Date();
  const userId = input.userId.trim();
  const adventureId = input.adventureId.trim();
  const holdKey = input.holdKey.trim();
  const leaseKey = input.leaseKey.trim();
  const monthKey = input.monthKey.trim();

  if (!userId || !adventureId || !holdKey || !leaseKey || !monthKey) {
    throw new BillingError("INVALID_INPUT", "Missing required billing preflight fields", 400);
  }

  const limits = TIER_LIMITS[input.tier];
  const capOverrideTokens =
    process.env.NODE_ENV !== "production" &&
    typeof input.capOverrideTokens === "number" &&
    Number.isFinite(input.capOverrideTokens) &&
    input.capOverrideTokens > 0
      ? Math.floor(input.capOverrideTokens)
      : undefined;
  const monthlyTotalCap = capOverrideTokens ?? limits.monthlyTotalCap;
  const inputTokens = Math.max(0, Math.floor(input.estInputTokens));
  const perTurnMaxOutputTokens = clampOutputTokens(
    limits.maxOutputTokensPerTurn,
    limits.maxOutputTokensPerTurn
  );
  const reservedTotal = inputTokens + perTurnMaxOutputTokens;

  await tx.userUsage.upsert({
    where: { userId_monthKey: { userId, monthKey } },
    update: { tier: input.tier },
    create: { userId, monthKey, tier: input.tier },
  });
  await cleanupExpiredForUserMonth(tx, { userId, monthKey, now });

  const existingHold = await tx.turnBudgetHold.findUnique({ where: { holdKey } });
  if (existingHold) {
    if (
      existingHold.userId !== userId ||
      existingHold.adventureId !== adventureId ||
      existingHold.monthKey !== monthKey
    ) {
      throw new BillingError("HOLD_CONFLICT", "holdKey already belongs to another request", 429);
    }

    if (existingHold.status === "COMMITTED") {
      return {
        monthKey,
        tier: existingHold.tier,
        holdKey,
        leaseKey,
        inputTokens: existingHold.reservedInputTokens,
        perTurnMaxOutputTokens: existingHold.reservedOutputTokens,
        reservedTotal: existingHold.reservedTotal,
        holdExpiresAt: existingHold.expiresAt,
        leaseExpiresAt: new Date(now.getTime() + limits.leaseTtlMs),
        idempotent: true,
      };
    }

    if (existingHold.status === "HELD" && existingHold.expiresAt > now) {
      return {
        monthKey,
        tier: existingHold.tier,
        holdKey,
        leaseKey,
        inputTokens: existingHold.reservedInputTokens,
        perTurnMaxOutputTokens: existingHold.reservedOutputTokens,
        reservedTotal: existingHold.reservedTotal,
        holdExpiresAt: existingHold.expiresAt,
        leaseExpiresAt: new Date(now.getTime() + limits.leaseTtlMs),
        idempotent: true,
      };
    }

    throw new BillingError("HOLD_CONFLICT", "holdKey exists and is not reusable", 429);
  }

  const usage = await tx.userUsage.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
  });
  if (!usage) {
    throw new BillingError("INVARIANT", "UserUsage missing after upsert", 500);
  }

  const available = monthlyTotalCap - usage.totalTokens - usage.reservedTotal;
  if (available < reservedTotal) {
    throw new BillingError("MONTHLY_TOKEN_CAP_EXCEEDED", "Monthly token cap exceeded", 429, {
      cap: monthlyTotalCap,
      used: usage.totalTokens,
      reserved: usage.reservedTotal,
      requestedReserve: reservedTotal,
      monthKey,
      tier: input.tier,
    });
  }

  const holds = await activeHoldCount(tx, userId, now);
  if (holds >= limits.maxConcurrentHolds) {
    throw new BillingError("CONCURRENCY_LIMIT_EXCEEDED", "Too many active holds", 429, {
      maxConcurrentHolds: limits.maxConcurrentHolds,
    });
  }

  const leases = await activeLeaseCount(tx, userId, now);
  if (leases >= limits.maxConcurrentLeases) {
    throw new BillingError("CONCURRENCY_LIMIT_EXCEEDED", "Too many active leases", 429, {
      maxConcurrentLeases: limits.maxConcurrentLeases,
    });
  }

  const holdExpiresAt = new Date(now.getTime() + limits.holdTtlMs);
  const leaseExpiresAt = new Date(now.getTime() + limits.leaseTtlMs);

  await tx.turnBudgetHold.create({
    data: {
      holdKey,
      userId,
      adventureId,
      tier: input.tier,
      monthKey,
      reservedTurns: 1,
      reservedInputTokens: inputTokens,
      reservedOutputTokens: perTurnMaxOutputTokens,
      reservedTotal,
      status: "HELD",
      expiresAt: holdExpiresAt,
    },
  });

  await tx.userUsage.update({
    where: { id: usage.id },
    data: {
      tier: input.tier,
      reservedTurns: { increment: 1 },
      reservedTotal: { increment: reservedTotal },
    },
  });

  try {
    await tx.turnLease.create({
      data: {
        adventureId,
        userId,
        leaseKey,
        acquiredAt: now,
        expiresAt: leaseExpiresAt,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await tx.turnLease.findFirst({
        where: { adventureId },
        select: { expiresAt: true },
      });

      throw new BillingError("CONCURRENCY_LIMIT_EXCEEDED", "Concurrent turn in progress", 429, {
        retryAt: (existing?.expiresAt ?? new Date(now.getTime() + 1000)).toISOString(),
        adventureId,
        userId,
      });
    }
    throw err;
  }

  return {
    monthKey,
    tier: input.tier,
    holdKey,
    leaseKey,
    inputTokens,
    perTurnMaxOutputTokens,
    reservedTotal,
    holdExpiresAt,
    leaseExpiresAt,
    idempotent: false,
  };
}

export async function commitUsageAndRelease(
  tx: Tx,
  input: CommitUsageInput
): Promise<CommitUsageResult> {
  const now = input.now ?? new Date();

  const hold = await tx.turnBudgetHold.findUnique({ where: { holdKey: input.holdKey } });
  if (!hold) {
    const usage = await tx.userUsage.findUnique({
      where: { userId_monthKey: { userId: input.userId, monthKey: input.monthKey } },
      select: { tier: true },
    });
    await tx.turnLease.deleteMany({ where: { leaseKey: input.leaseKey } });
    return {
      userId: input.userId,
      monthKey: input.monthKey,
      tier: usage?.tier ?? "NOMAD",
      inputTokens: Math.max(0, Math.floor(input.actualInputTokens)),
      outputTokens: Math.max(0, Math.floor(input.actualOutputTokens)),
      consumedTotal:
        Math.max(0, Math.floor(input.actualInputTokens)) + Math.max(0, Math.floor(input.actualOutputTokens)),
      idempotent: true,
    };
  }
  if (hold.userId !== input.userId || hold.monthKey !== input.monthKey) {
    await tx.turnLease.deleteMany({ where: { leaseKey: input.leaseKey } });
    return {
      userId: hold.userId,
      monthKey: hold.monthKey,
      tier: hold.tier,
      inputTokens: hold.reservedInputTokens,
      outputTokens: hold.reservedOutputTokens,
      consumedTotal: hold.reservedInputTokens + hold.reservedOutputTokens,
      idempotent: true,
    };
  }

  const limits = TIER_LIMITS[hold.tier];
  const inputTokens = Math.max(0, Math.floor(input.actualInputTokens));
  const outputTokens = clampOutputTokens(input.actualOutputTokens, limits.maxOutputTokensPerTurn);
  const consumedTotal = inputTokens + outputTokens;

  const usage = await tx.userUsage.findUnique({
    where: { userId_monthKey: { userId: hold.userId, monthKey: hold.monthKey } },
  });
  if (!usage) {
    throw new BillingError("INVARIANT", "UserUsage missing for hold", 500);
  }

  if (hold.status !== "HELD") {
    await tx.turnLease.deleteMany({ where: { leaseKey: input.leaseKey } });
    return {
      userId: hold.userId,
      monthKey: hold.monthKey,
      tier: hold.tier,
      inputTokens,
      outputTokens,
      consumedTotal,
      idempotent: true,
    };
  }

  await tx.turnBudgetHold.update({
    where: { id: hold.id },
    data: {
      status: "COMMITTED",
      consumedAt: now,
    },
  });

  await tx.userUsage.update({
    where: { id: usage.id },
    data: {
      tier: hold.tier,
      turnCount: { increment: 1 },
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      totalTokens: { increment: consumedTotal },
      reservedTurns: { decrement: 1 },
      reservedTotal: { decrement: hold.reservedTotal },
    },
  });

  await tx.turnLease.deleteMany({ where: { leaseKey: input.leaseKey } });

  return {
    userId: hold.userId,
    monthKey: hold.monthKey,
    tier: hold.tier,
    inputTokens,
    outputTokens,
    consumedTotal,
    idempotent: false,
  };
}

export async function releaseUsageAndLeaseBestEffort(
  prisma: PrismaClient,
  input: ReleaseUsageInput
): Promise<void> {
  const now = input.now ?? new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const hold = await tx.turnBudgetHold.findUnique({ where: { holdKey: input.holdKey } });

      if (hold && hold.status === "HELD") {
        await tx.turnBudgetHold.update({
          where: { id: hold.id },
          data: {
            status: "RELEASED",
            releasedAt: now,
            expiresAt: now,
          },
        });

        const usage = await tx.userUsage.findUnique({
          where: { userId_monthKey: { userId: hold.userId, monthKey: hold.monthKey } },
        });

        if (usage) {
          await tx.userUsage.update({
            where: { id: usage.id },
            data: {
              reservedTurns: { decrement: hold.reservedTurns },
              reservedTotal: { decrement: hold.reservedTotal },
            },
          });
        }
      }

      await tx.turnLease.deleteMany({ where: { leaseKey: input.leaseKey } });
    });
  } catch {
    // best effort by contract
  }
}
