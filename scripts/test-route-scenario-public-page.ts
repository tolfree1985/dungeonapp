import { PrismaClient } from "../src/generated/prisma";
import { createScenario } from "../src/lib/scenario/scenarioRepo";
import { GET as getPublic } from "../app/api/scenario/public/route";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type ScenarioRow = {
  id: string;
  ownerId: string | null;
  updatedAt: string;
};

function isOrdered(rows: ScenarioRow[]) {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const prevAt = new Date(prev.updatedAt).getTime();
    const currAt = new Date(curr.updatedAt).getTime();
    if (prevAt < currAt) return false;
    if (prevAt === currAt && prev.id < curr.id) return false;
  }
  return true;
}

async function fetchPage(args: { take: number; cursor?: string }) {
  const params = new URLSearchParams();
  params.set("take", String(args.take));
  if (args.cursor) params.set("cursor", args.cursor);
  const req = new Request(`http://local.test/api/scenario/public?${params.toString()}`);
  const res = await getPublic(req);
  const json = (await res.json()) as { scenarios?: ScenarioRow[]; nextCursor?: string | null };
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(Array.isArray(json.scenarios), "expected scenarios array");
  return { scenarios: json.scenarios as ScenarioRow[], nextCursor: json.nextCursor ?? null };
}

async function main() {
  const prisma = new PrismaClient();
  const prefix = "route-public-page-";

  await prisma.scenario.deleteMany({ where: { id: { startsWith: prefix } } });

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < 60; i++) {
      await createScenario(tx as any, {
        id: `${prefix}${String(i).padStart(3, "0")}`,
        title: `Public Page ${i}`,
        summary: `Seed ${i}`,
        contentJson: { i },
        visibility: "PUBLIC",
        ownerId: "owner_public",
      });
    }
  });

  const page1 = await fetchPage({ take: 20 });
  assert(page1.scenarios.length === 20, "page1 should have 20 rows");
  assert(page1.nextCursor, "page1 should include nextCursor");
  assert(isOrdered(page1.scenarios), "page1 order is not deterministic");

  const page2 = await fetchPage({ take: 20, cursor: page1.nextCursor ?? undefined });
  assert(page2.scenarios.length === 20, "page2 should have 20 rows");
  assert(isOrdered(page2.scenarios), "page2 order is not deterministic");

  const ids1 = new Set(page1.scenarios.map((s) => s.id));
  const ids2 = new Set(page2.scenarios.map((s) => s.id));
  for (const id of ids1) {
    assert(!ids2.has(id), `page overlap detected for id ${id}`);
  }
  const ids40 = new Set([...ids1, ...ids2]);
  assert(ids40.size === 40, `expected 40 unique ids across two pages, got ${ids40.size}`);

  const top40 = await fetchPage({ take: 40 });
  const combined = [...page1.scenarios, ...page2.scenarios].map((s) => s.id).join(",");
  const expected = top40.scenarios.map((s) => s.id).join(",");
  assert(combined === expected, "paging is not stable across requests");

  console.log("ROUTE SCENARIO PUBLIC PAGE OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
