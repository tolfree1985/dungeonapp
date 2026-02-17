import { PrismaClient } from "../src/generated/prisma";
import { POST as publishPost } from "../app/api/scenario/[id]/publish/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const id = "route-publish-seed";
  await prisma.scenario.deleteMany({ where: { id } });

  await prisma.scenario.create({
    data: {
      id,
      title: "Publish Seed",
      summary: "seed",
      contentJson: { ok: true } as any,
      visibility: "PRIVATE",
      ownerId: "owner_a",
      sourceScenarioId: null,
    },
  });

  const req = new Request("http://local.test/api/scenario/" + id + "/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: "owner_a" }),
  });

  const res = await publishPost(req, { params: { id } } as any);
  const json = await res.json();

  assert(json?.scenario?.id === id, "id mismatch");
  assert(json?.scenario?.visibility === "PUBLIC", "not published");
  console.log("ROUTE SCENARIO PUBLISH OK");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
