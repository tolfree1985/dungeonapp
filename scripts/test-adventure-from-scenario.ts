import { PrismaClient } from "../src/generated/prisma";
import fs from "node:fs";
import path from "node:path";

// IMPORTANT:
// Update this import path to the *actual* internal function your route uses.
// It must be a relative import (no @/).
import { createAdventureFromScenarioId } from "../src/lib/game/createAdventureFromScenario";

function loadScenario(scenarioId: string) {
  const p = path.join(process.cwd(), "scenarios", `${scenarioId}.scenario.v1.json`);
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as any;
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const scenarioId = "mystery-docks";
  const adventureId = "test-adventure-from-scenario-mystery-docks";

  const scenario = loadScenario(scenarioId);
  assert(scenario?.initialState != null, "scenario.initialState missing");
  assert(typeof scenario?.start?.prompt === "string", "scenario.start.prompt missing");

  // Make deterministic/idempotent across runs
  await prisma.turnEvent.deleteMany({ where: { adventureId } });
  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  // Call the SAME internal function used by the route (no HTTP)
  const created = await prisma.$transaction(async (tx) => {
    return createAdventureFromScenarioId({
      tx,
      adventureId,
      scenarioId,
      ownerId: null,
      // seed optional; pass if your function requires it
    });
  });

  assert(created?.adventureId === adventureId, "returned adventureId mismatch");

  const adv = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { id: true, state: true },
  });

  assert(adv?.id === adventureId, "adventure not persisted");
  assert(adv?.state != null, "adventure.state missing");

  const state = adv.state as any;

  // Expected keys: all top-level keys from scenario.initialState (if object)
  if (scenario.initialState && typeof scenario.initialState === "object" && !Array.isArray(scenario.initialState)) {
    for (const k of Object.keys(scenario.initialState)) {
      assert(k in state, `missing expected state key: ${k}`);
    }
  }

  // Minimal persistence of scenarioId (schema-free requirement)
  // If you stored scenarioId under a different meta key, update this assertion.
  assert(state?._meta?.scenarioId === scenarioId, "state._meta.scenarioId not persisted");

  console.log("ADVENTURE FROM SCENARIO OK");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
