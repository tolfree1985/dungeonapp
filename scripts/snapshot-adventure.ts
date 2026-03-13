import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function usageMessage(): string {
  return "Usage: pnpm tsx scripts/snapshot-adventure.ts <sourceId> [snapshotId]";
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function main() {
  const sourceId = process.argv[2];
  const timestamp = formatTimestamp(new Date());
  const snapshotId =
    process.argv[3] ??
    `${sourceId ?? "unknown"}_snapshot_${timestamp}`;

  if (!sourceId) {
    throw new Error(usageMessage());
  }

  const existingSnapshot = await prisma.adventure.findUnique({
    where: { id: snapshotId },
    select: { id: true },
  });
  if (existingSnapshot) {
    throw new Error(`Snapshot already exists: ${snapshotId}`);
  }

  const adventure = await prisma.adventure.findUnique({
    where: { id: sourceId },
    include: { turns: true },
  });

  if (!adventure) {
    throw new Error(`Adventure not found: ${sourceId}`);
  }

  const { turns, ...adventureData } = adventure;
  const latestTurnIndex = adventure.latestTurnIndex ?? 0;
  const turnCount = turns.length;

  await prisma.$transaction(async (tx) => {
    await tx.adventure.create({
      data: {
        ...adventureData,
        id: snapshotId,
      },
    });

    for (const turn of turns) {
      await tx.turn.create({
        data: {
          id: `${snapshotId}_${turn.turnIndex}`,
          adventureId: snapshotId,
          turnIndex: turn.turnIndex,
          playerInput: turn.playerInput,
          scene: turn.scene,
          resolution: turn.resolution,
          stateDeltas: turn.stateDeltas,
          ledgerAdds: turn.ledgerAdds,
          memoryGate: turn.memoryGate,
          debug: turn.debug,
          intentJson: turn.intentJson,
          createdAt: turn.createdAt,
        },
      });
    }
  });

  console.log(`Snapshot created: ${snapshotId}`);
  console.log(
    `Snapshot summary → source=${sourceId}, snapshot=${snapshotId}, latestTurnIndex=${latestTurnIndex}, turnCount=${turnCount}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
