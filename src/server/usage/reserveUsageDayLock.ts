import type { Prisma } from "@/generated/prisma";

export async function reserveUsageDayLock(tx: Prisma.TransactionClient, key: string, day: string) {
  await tx.usageDay.upsert({
    where: { key_day: { key, day } },
    create: { key, day, turns: 0, lastTurnAt: null },
    update: {},
  });

  return tx.usageDay.updateMany({
    where: { key, day, turns: 0 },
    data: { turns: 1 },
  });
}
