import { PrismaClient } from "../src/generated/prisma";
import fs from "node:fs";
import path from "node:path";

// Must be a relative import (no @/).
import { createAdventureFromScenarioId } from "../src/lib/game/createAdventureFromScenario";

function loadScenario(scenarioId: string) {
  const p = path.join(process.cwd(), "scenarios", `${scenarioId}.scenario.v1.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as any;
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const scenarioId = "mystery-docks";
  const adventureId = "test-opening-turn-mystery-docks";

  const scenario = loadScenario(scenarioId);
  const openingPrompt = scenario?.start?.prompt;
  assert(typeof openingPrompt === "string", "scenario.start.prompt missing");

  // deterministic cleanup
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

  const t0 = await prisma.turn.findUnique({
    where: { adventureId_turnIndex: { adventureId, turnIndex: 0 } },
    select: {
      adventureId: true,
      turnIndex: true,
      playerInput: true,
      scene: true,
      resolution: true,
      stateDeltas: true,
      ledgerAdds: true,
    },
  });

  assert(t0, "turn 0 missing");
  assert(t0.turnIndex === 0, "turnIndex != 0");
  assert(t0.scene === openingPrompt, "turn 0 scene != openingPrompt");
  assert(typeof t0.playerInput === "string", "turn 0 playerInput missing");
  assert(t0.resolution != null, "turn 0 resolution missing");
  assert(t0.stateDeltas != null, "turn 0 stateDeltas missing");
  assert(t0.ledgerAdds != null, "turn 0 ledgerAdds missing");

  console.log("OPENING TURN OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
