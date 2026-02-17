import { PrismaClient } from "../src/generated/prisma";

// Import the route handler directly (no HTTP).
import { GET as getPublic } from "../app/api/scenario/public/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();

  const id = "route-public-seed";
  await prisma.scenario.deleteMany({ where: { id } });

  // Seed a PUBLIC scenario
  await prisma.scenario.create({
    data: {
      id,
      title: "Route Public Seed",
      summary: "Seed for route public list test",
      contentJson: { hello: "world" } as any,
      visibility: "PUBLIC",
      ownerId: "user_a",
      sourceScenarioId: null,
    },
  });

  const res = await getPublic();
  const json = await res.json();

  assert(Array.isArray(json?.scenarios), "expected scenarios array");
  assert(json.scenarios.some((s: any) => s.id === id), "seed scenario not returned");

  console.log("ROUTE SCENARIO PUBLIC OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
