import { PrismaClient } from "../src/generated/prisma";
import { createScenario, listPublicScenarios, forkScenario } from "../src/lib/scenario/scenarioRepo";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();

  const ownerA = "user_a";
  const ownerB = "user_b";

  const srcId = "community-src-mystery-docks";
  const forkId = "community-fork-mystery-docks";

  // deterministic cleanup
  await prisma.scenario.deleteMany({ where: { id: { in: [forkId, srcId] } } });

  // create PRIVATE first
  await prisma.$transaction(async (tx) => {
    await createScenario(tx as any, {
      id: srcId,
      title: "Mystery Docks (Community Seed)",
      summary: "A seed scenario for community tests.",
      contentJson: { scenarioId: "mystery-docks", version: "v1" },
      visibility: "PRIVATE",
      ownerId: ownerA,
    });
  });

  // publish by updating visibility directly (minimal, no helper yet)
  await prisma.scenario.update({ where: { id: srcId }, data: { visibility: "PUBLIC" } });

  const publics = await prisma.$transaction(async (tx) => listPublicScenarios(tx as any));
  assert(publics.some((s) => s.id === srcId), "public scenario not listed");

  // fork into ownerB library
  const forked = await prisma.$transaction(async (tx) => {
    return forkScenario(tx as any, { sourceScenarioId: srcId, newId: forkId, ownerId: ownerB });
  });

  assert(forked.id === forkId, "fork id mismatch");
  assert(forked.sourceScenarioId === srcId, "sourceScenarioId not set");
  assert(forked.visibility === "PRIVATE", "fork should default PRIVATE");
  assert(forked.ownerId === ownerB, "fork ownerId mismatch");

  console.log("SCENARIO COMMUNITY OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
