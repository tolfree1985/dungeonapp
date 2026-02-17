import { PrismaClient } from "../src/generated/prisma";
import { POST as forkPost } from "../app/api/scenario/[id]/fork/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function callFork(args: { sourceScenarioId: string; newId: string; ownerId: string }) {
  const req = new Request(`http://local.test/api/scenario/${args.sourceScenarioId}/fork`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ newId: args.newId, ownerId: args.ownerId }),
  });
  const res = await forkPost(req, { params: { id: args.sourceScenarioId } } as any);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  process.env.SCENARIO_MAX_PER_OWNER = "2";

  const prisma = new PrismaClient();
  const sourceOwner = "owner_cap_source";
  const targetOwner = "owner_cap_fork";
  const sourceId = "route-fork-cap-source";
  const owned1 = "route-fork-cap-owned-1";
  const owned2 = "route-fork-cap-owned-2";
  const attempt1 = "route-fork-cap-attempt-1";
  const attempt2 = "route-fork-cap-attempt-2";

  await prisma.scenario.deleteMany({
    where: { id: { in: [sourceId, owned1, owned2, attempt1, attempt2] } },
  });

  await prisma.scenario.create({
    data: {
      id: sourceId,
      title: "Fork Source",
      summary: "source",
      contentJson: { source: true },
      visibility: "PUBLIC",
      ownerId: sourceOwner,
      sourceScenarioId: null,
    },
  });
  await prisma.scenario.create({
    data: {
      id: owned1,
      title: "Owned 1",
      summary: "seed",
      contentJson: { owned: 1 },
      visibility: "PRIVATE",
      ownerId: targetOwner,
      sourceScenarioId: null,
    },
  });
  await prisma.scenario.create({
    data: {
      id: owned2,
      title: "Owned 2",
      summary: "seed",
      contentJson: { owned: 2 },
      visibility: "PRIVATE",
      ownerId: targetOwner,
      sourceScenarioId: null,
    },
  });

  const r1 = await callFork({ sourceScenarioId: sourceId, newId: attempt1, ownerId: targetOwner });
  assert(r1.status === 429, `expected 429 for fork cap, got ${r1.status}`);
  assert(r1.json?.error?.code === "SCENARIO_CAP_EXCEEDED", "expected SCENARIO_CAP_EXCEEDED code");

  const after1 = await prisma.scenario.count({ where: { ownerId: targetOwner } });
  assert(after1 === 2, `owner count must remain 2 after first fork cap failure, got ${after1}`);

  const r2 = await callFork({ sourceScenarioId: sourceId, newId: attempt2, ownerId: targetOwner });
  assert(r2.status === 429, `expected 429 for second fork cap, got ${r2.status}`);
  assert(r2.json?.error?.code === "SCENARIO_CAP_EXCEEDED", "expected SCENARIO_CAP_EXCEEDED code on second call");

  const after2 = await prisma.scenario.count({ where: { ownerId: targetOwner } });
  assert(after2 === 2, `owner count must remain 2 after second fork cap failure, got ${after2}`);

  const leaked = await prisma.scenario.findMany({
    where: { id: { in: [attempt1, attempt2] } },
    select: { id: true },
  });
  assert(leaked.length === 0, "cap-failed fork attempts must not persist scenarios");

  console.log("ROUTE SCENARIO FORK CAP OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
