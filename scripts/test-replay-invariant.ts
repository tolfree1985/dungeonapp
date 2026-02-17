import { PrismaClient } from "../src/generated/prisma";

// IMPORTANT: use relative import only; adjust to match your export.
import { handleTurn } from "../src/lib/turnHandler";

import { createAdventureFromScenarioId } from "../src/lib/game/createAdventureFromScenario";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();

  const adventureId = "test-replay-invariant";
  const scenarioId = "mystery-docks";

  // deterministic cleanup
  await prisma.turnEvent.updateMany({
    where: { adventureId },
    data: { prevEventId: null },
  });
  await prisma.turnEvent.deleteMany({ where: { adventureId } });
  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  // create adventure from scenario (seeds turn 0)
  await prisma.$transaction(async (tx) => {
    await createAdventureFromScenarioId({
      tx,
      adventureId,
      scenarioId,
      ownerId: null,
    });
  });

  // Assert turn 0 exists
  const t0 = await prisma.turn.findUnique({
    where: { adventureId_turnIndex: { adventureId, turnIndex: 0 } },
    select: { turnIndex: true },
  });
  assert(t0?.turnIndex === 0, "turn 0 missing");

  // Run two deterministic turns through the SAME in-process handler
  const r1 = await handleTurn({
    adventureId,
    playerText: "Look around the docks.",
    idempotencyKey: "replay-invariant-1",
  });
  assert(r1?.status === 200, `turn 1 failed with status ${String(r1?.status)}`);

  const r2 = await handleTurn({
    adventureId,
    playerText: "Question the nearest sailor.",
    idempotencyKey: "replay-invariant-2",
  });
  assert(r2?.status === 200, `turn 2 failed with status ${String(r2?.status)}`);

  // Invariants: turns exist and latestTurnIndex is consistent
  const adv = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { latestTurnIndex: true },
  });
  assert(adv, "adventure missing after turns");

  const turns = await prisma.turn.findMany({
    where: { adventureId },
    orderBy: { turnIndex: "asc" },
    select: { turnIndex: true },
  });

  const indices = turns.map((t) => t.turnIndex);
  // Expect 0 + 1 + 2 (if handler writes Turn 1 and Turn 2)
  assert(indices[0] === 0, "first turnIndex must be 0");
  assert(indices.includes(1), "missing turn 1");
  assert(indices.includes(2), "missing turn 2");

  const maxIndex = Math.max(...indices);
  assert(adv.latestTurnIndex === maxIndex, `latestTurnIndex (${adv.latestTurnIndex}) != max turnIndex (${maxIndex})`);

  // If your turn path writes TurnEvents, verify chain invariants
  const events = await prisma.turnEvent.findMany({
    where: { adventureId },
    orderBy: { seq: "asc" },
    select: { seq: true, prevEventId: true, eventId: true },
  });

  if (events.length > 0) {
    for (let i = 0; i < events.length; i++) {
      assert(events[i].seq === i, `event seq not continuous at i=${i} got=${events[i].seq}`);
      if (i === 0) {
        // genesis: prevEventId may be null/undefined
      } else {
        assert(events[i].prevEventId === events[i - 1].eventId, `event chain broken at seq=${i}`);
      }
    }
  }

  console.log("REPLAY INVARIANT OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
