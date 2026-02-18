import { PrismaClient } from "../src/generated/prisma";
import { POST as createPost } from "../app/api/scenario/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function callCreate(args: { id: string; ownerId: string }) {
  const req = new Request("http://local.test/api/scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: args.id,
      title: `Cap ${args.id}`,
      summary: "cap test",
      contentJson: { id: args.id },
      ownerId: args.ownerId,
      visibility: "PRIVATE",
    }),
  });
  const res = await createPost(req);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  process.env.SCENARIO_MAX_PER_OWNER = "2";

  const prisma = new PrismaClient();
  const ownerId = "owner_cap_create";
  const seed1 = "route-create-cap-seed-1";
  const seed2 = "route-create-cap-seed-2";
  const attempt1 = "route-create-cap-attempt-1";
  const attempt2 = "route-create-cap-attempt-2";

  await prisma.scenario.deleteMany({
    where: { id: { in: [seed1, seed2, attempt1, attempt2] } },
  });

  await prisma.scenario.create({
    data: {
      id: seed1,
      title: "Seed 1",
      summary: "seed",
      contentJson: { seed: 1 },
      visibility: "PRIVATE",
      ownerId,
      sourceScenarioId: null,
    },
  });
  await prisma.scenario.create({
    data: {
      id: seed2,
      title: "Seed 2",
      summary: "seed",
      contentJson: { seed: 2 },
      visibility: "PRIVATE",
      ownerId,
      sourceScenarioId: null,
    },
  });

  const r1 = await callCreate({ id: attempt1, ownerId });
  assert(r1.status === 429, `expected 429 for create cap, got ${r1.status}`);
  assert(r1.json?.error === "SCENARIO_CAP_EXCEEDED", "expected SCENARIO_CAP_EXCEEDED error");

  const after1 = await prisma.scenario.count({ where: { ownerId } });
  assert(after1 === 2, `owner count must remain 2 after first cap failure, got ${after1}`);

  const r2 = await callCreate({ id: attempt2, ownerId });
  assert(r2.status === 429, `expected 429 for second create cap, got ${r2.status}`);
  assert(r2.json?.error === "SCENARIO_CAP_EXCEEDED", "expected SCENARIO_CAP_EXCEEDED error on second call");

  const after2 = await prisma.scenario.count({ where: { ownerId } });
  assert(after2 === 2, `owner count must remain 2 after second cap failure, got ${after2}`);

  const leaked = await prisma.scenario.findMany({
    where: { id: { in: [attempt1, attempt2] } },
    select: { id: true },
  });
  assert(leaked.length === 0, "cap-failed create attempts must not persist scenarios");

  console.log("ROUTE SCENARIO CREATE CAP OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
