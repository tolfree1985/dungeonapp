const { PrismaClient } = require("../src/generated/prisma");
const prisma = new PrismaClient();

async function main() {
  const id = process.env.SEED_ADVENTURE_ID || "adv_123";
  await prisma.adventure.upsert({
    where: { id },
    update: {},
    create: { id, latestTurnIndex: 0 },
  });
  console.log("Seeded:", id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
