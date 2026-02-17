import { POST } from "../app/api/adventure/from-scenario/route";
import { PrismaClient } from "../src/generated/prisma";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const scenarioId = "mystery-docks";
  const adventureId = "test-route-adventure-from-scenario-mystery-docks";

  // Deterministic pre-clean.
  await prisma.turnEvent.updateMany({
    where: { adventureId },
    data: { prevEventId: null },
  });
  await prisma.turnEvent.deleteMany({ where: { adventureId } });
  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  const req = new Request("http://local/api/adventure/from-scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId,
      adventureId,
      ownerId: null,
    }),
  });

  const res = await POST(req);
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }

  assert(res.status === 200, `expected 200, got ${res.status} body=${JSON.stringify(json)}`);
  assert(json?.adventureId === adventureId, "response adventureId mismatch");
  assert(json?.scenarioId === scenarioId, "response scenarioId mismatch");
  assert(typeof json?.openingPrompt === "string" && json.openingPrompt.length > 0, "openingPrompt missing");

  const adv = await prisma.adventure.findUnique({
    where: { id: adventureId },
    select: { id: true, state: true },
  });

  assert(adv?.id === adventureId, "adventure was not persisted");
  const state = adv?.state as any;
  assert(state?._meta?.scenarioId === scenarioId, "state._meta.scenarioId not persisted");

  await prisma.$disconnect();
  console.log("ROUTE ADVENTURE FROM SCENARIO OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
