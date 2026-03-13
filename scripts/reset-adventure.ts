import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const protectedAdventures = new Set(["canon_ui", "sandbox", "replay_lab", "dev_run"]);

function usageMessage(): string {
  return "Usage: pnpm tsx scripts/reset-adventure.ts <adventureId> --yes";
}

async function main() {
  const adventureId = process.argv[2];
  const confirmed = process.argv.includes("--yes");

  if (!adventureId) {
    throw new Error(usageMessage());
  }

  const isProtected = protectedAdventures.has(adventureId);

  if (!confirmed) {
    throw new Error("Refusing to reset without --yes");
  }

  if (isProtected) {
    throw new Error(`Refusing to reset protected adventure: ${adventureId}`);
  }

  const adventure = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { latestTurnIndex: true },
  });

  if (!adventure) {
    throw new Error(`Adventure not found: ${adventureId}`);
  }

  const turnCount = await prisma.turn.count({
    where: { adventureId },
  });

  console.log(
    `Reset summary → adventureId=${adventureId}, latestTurnIndex=${adventure.latestTurnIndex ?? 0}, turnCount=${turnCount}, protected=${isProtected}`,
  );

  await prisma.$transaction(async (tx) => {
    await tx.turnEvent.deleteMany({
      where: { adventureId },
    });

    await tx.turn.deleteMany({
      where: { adventureId },
    });

    await tx.adventure.update({
      where: { id: adventureId },
      data: {
        latestTurnIndex: 0,
        state: {},
      },
    });
  });

  console.log(`Reset complete: ${adventureId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
