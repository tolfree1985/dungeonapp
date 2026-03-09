import { PrismaClient } from "../src/generated/prisma";
import { unpublishPost } from "../app/api/scenario/[id]/unpublish/route";
import { NextRequest } from "next/server";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prisma = new PrismaClient();
  const id = "route-unpublish-seed";
  await prisma.scenario.deleteMany({ where: { id } });

  await prisma.scenario.create({
    data: {
      id,
      title: "Unpublish Seed",
      summary: "seed",
      contentJson: { ok: true } as any,
      visibility: "PUBLIC",
      ownerId: "owner_a",
      sourceScenarioId: null,
    },
  });

  const req = new NextRequest("http://local.test/api/scenario/" + id + "/unpublish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerId: "owner_a" }),
  });

  const res = await unpublishPost(req, { params: Promise.resolve({ id }) } as any);
  const json = await res.json();

  assert(json?.scenario?.id === id, "id mismatch");
  assert(json?.scenario?.visibility === "PRIVATE", "not unpublished");
  console.log("ROUTE SCENARIO UNPUBLISH OK");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
