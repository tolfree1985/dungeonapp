// Ensures owner isolation invariant for scenario listing.
import { PrismaClient } from "../src/generated/prisma";
import { createScenario } from "../src/lib/scenario/scenarioRepo";

// Import the route handler directly (no HTTP).
import { GET as getMine } from "../app/api/scenario/mine/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();

  const ownerA = "owner_a";
  const ownerB = "owner_b";

  const a1 = "route-mine-owner-a-1";
  const a2 = "route-mine-owner-a-2";
  const b1 = "route-mine-owner-b-1";

  // deterministic cleanup
  await prisma.scenario.deleteMany({ where: { id: { in: [a1, a2, b1] } } });

  await prisma.$transaction(async (tx) => {
    await createScenario(tx as any, {
      id: a1,
      title: "Mine A1",
      summary: "Owned by A",
      contentJson: { key: "a1" },
      visibility: "PRIVATE",
      ownerId: ownerA,
    });

    await createScenario(tx as any, {
      id: a2,
      title: "Mine A2",
      summary: "Owned by A",
      contentJson: { key: "a2" },
      visibility: "PUBLIC",
      ownerId: ownerA,
    });

    await createScenario(tx as any, {
      id: b1,
      title: "Mine B1",
      summary: "Owned by B",
      contentJson: { key: "b1" },
      visibility: "PUBLIC",
      ownerId: ownerB,
    });
  });

  const req = new Request(`http://local.test/api/scenario/mine?ownerId=${encodeURIComponent(ownerA)}`);
  const res = await getMine(req);
  const json = await res.json();

  assert(res.status === 200, "expected 200");

  const scenarios = Array.isArray(json) ? json : json?.scenarios;
  assert(Array.isArray(scenarios), "expected scenarios array");

  const ids = scenarios.map((s: any) => s.id);
  assert(ids.includes(a1), "missing owner A scenario a1");
  assert(ids.includes(a2), "missing owner A scenario a2");
  assert(!ids.includes(b1), "owner B scenario should not be returned");

  console.log("ROUTE SCENARIO MINE OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
