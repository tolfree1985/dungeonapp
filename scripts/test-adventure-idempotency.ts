import { PrismaClient } from "../src/generated/prisma";
import { createAdventureFromScenarioId } from "../src/lib/game/createAdventureFromScenario";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const scenarioId = "mystery-docks";
  const mismatchedScenarioId = "different-scenario-id";
  const adventureId = "test-adventure-idempotency-mystery-docks";

  // Deterministic pre-clean.
  await prisma.turnEvent.updateMany({
    where: { adventureId },
    data: { prevEventId: null },
  });
  await prisma.turnEvent.deleteMany({ where: { adventureId } });
  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  // 1) Create adventure from scenario.
  const first = await prisma.$transaction((tx) =>
    createAdventureFromScenarioId({
      tx,
      adventureId,
      scenarioId,
      ownerId: null,
    }),
  );
  assert(first.adventureId === adventureId, "first create returned wrong adventureId");

  const before = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { state: true },
  });
  assert(before?.state, "missing state after first create");
  const beforeJson = JSON.stringify(before.state);

  // 2) Same id + same scenario => idempotent success, no mutation.
  const second = await prisma.$transaction((tx) =>
    createAdventureFromScenarioId({
      tx,
      adventureId,
      scenarioId,
      ownerId: null,
    }),
  );
  assert(second.adventureId === adventureId, "second call returned wrong adventureId");

  const after = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { state: true },
  });
  assert(after?.state, "missing state after second create");
  const afterJson = JSON.stringify(after.state);
  assert(beforeJson === afterJson, "state mutated on idempotent call");

  // 3) Same id + different scenario => SCENARIO_MISMATCH.
  let mismatchThrown = false;
  try {
    await prisma.$transaction((tx) =>
      createAdventureFromScenarioId({
        tx,
        adventureId,
        scenarioId: mismatchedScenarioId,
        ownerId: null,
      }),
    );
  } catch (err: any) {
    mismatchThrown = err?.code === "SCENARIO_MISMATCH";
  }
  assert(mismatchThrown, "expected SCENARIO_MISMATCH on different scenarioId");

  await prisma.$disconnect();
  console.log("IDEMPOTENCY OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
