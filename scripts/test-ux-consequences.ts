import assert from "node:assert/strict";
import { PrismaClient } from "../src/generated/prisma";
import { createAdventureFromScenarioId } from "../src/lib/game/createAdventureFromScenario";
import { handleTurn } from "../src/lib/turnHandler";

async function main() {
  const prisma = new PrismaClient();
  const scenarioId = "mystery-docks";
  const adventureId = "test-ux-consequences-mystery-docks";

  // Deterministic pre-clean.
  await prisma.turnEvent.updateMany({
    where: { adventureId },
    data: { prevEventId: null },
  });
  await prisma.turnEvent.deleteMany({ where: { adventureId } });
  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  await prisma.$transaction(async (tx) => {
    await createAdventureFromScenarioId({
      tx,
      adventureId,
      scenarioId,
      ownerId: null,
    });
  });

  const response = await handleTurn({
    adventureId,
    playerText: "Inspect the lantern and trace recent footsteps.",
    tier: "free",
  });

  assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(response.json)}`);

  const payloadTurn = (response as any)?.json?.turn;
  const engineResult = payloadTurn?.engine;

  assert(payloadTurn && typeof payloadTurn === "object", "turn payload missing");
  assert(engineResult && typeof engineResult === "object", "engine result missing");

  assert(Array.isArray(payloadTurn.stateDeltas), "stateDeltas must be an array");
  assert(Array.isArray(payloadTurn.ledgerAdds), "ledgerAdds must be an array");

  assert.deepEqual(payloadTurn.stateDeltas, engineResult.stateDeltas);
  assert.deepEqual(payloadTurn.ledgerAdds, engineResult.ledgerAdds);

  console.log("UX CONSEQUENCES OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
