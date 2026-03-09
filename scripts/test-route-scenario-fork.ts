import { PrismaClient } from "../src/generated/prisma";

// Import the route handler directly (no HTTP).
import { POST as forkPost } from "../app/api/scenario/[id]/fork/route";
import { NextRequest } from "next/server";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();

  const srcId = "route-fork-src";
  const newId = "route-fork-new";

  await prisma.scenario.deleteMany({ where: { id: { in: [newId, srcId] } } });

  await prisma.scenario.create({
    data: {
      id: srcId,
      title: "Route Fork Source",
      summary: "Seed for route fork test",
      contentJson: { base: true } as any,
      visibility: "PUBLIC",
      ownerId: "user_a",
      sourceScenarioId: null,
    },
  });

  const req = new NextRequest("http://local.test/api/scenario/" + srcId + "/fork", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newId, ownerId: "user_b" }),
  });

  const res = await forkPost(req, { params: Promise.resolve({ id: srcId }) } as any);
  const json = await res.json();

  assert(json?.scenario?.id === newId, "fork id mismatch");
  assert(json?.scenario?.sourceScenarioId === srcId, "sourceScenarioId missing");
  assert(json?.scenario?.visibility === "PRIVATE", "fork should default PRIVATE");
  assert(json?.scenario?.ownerId === "user_b", "ownerId mismatch");

  console.log("ROUTE SCENARIO FORK OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
