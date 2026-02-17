import { POST } from "../app/api/turn/route";
import { PrismaClient } from "../src/generated/prisma";
import { __debugCaps } from "../src/lib/billing/tiers";
import { setTimeout as sleep } from "node:timers/promises";

type TurnReq = {
  adventureId: string;
  playerText: string;
  userId?: string;
  tier?: string;
  idempotencyKey?: string;
};

async function callTurn(body: TurnReq) {
  const req = new Request("http://local/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const res = await POST(req);
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function isBudget429(r: { status: number; json: any }) {
  return (
    r.status === 429 &&
    r.json?.ok === false &&
    r.json?.error?.type === "BUDGET_EXCEEDED" &&
    typeof r.json?.error?.code === "string"
  );
}

async function resetTestState(prisma: PrismaClient, args: { adventureId: string; userId: string }) {
  const { adventureId, userId } = args;

  // wipe only what the smoke uses (deterministic)
  await prisma.turnLease.deleteMany({ where: { userId } });
  await prisma.turnBudgetHold.deleteMany({ where: { userId } });
  await prisma.userUsage.deleteMany({ where: { userId } });

  // --- TurnEvent has self-referential prevEventId with onDelete: Restrict
  // Null out links first, then delete.
  await prisma.turnEvent.updateMany({
    where: { adventureId },
    data: { prevEventId: null },
  });
  await prisma.turnEvent.deleteMany({ where: { adventureId } });

  await prisma.turn.deleteMany({ where: { adventureId } });
  await prisma.adventure.deleteMany({ where: { id: adventureId } });

  // recreate the adventure so /api/turn doesn’t 404
  await prisma.adventure.create({
    data: { id: adventureId, latestTurnIndex: 0 },
  });
}

async function main() {
  const adventureId = process.env.ADVENTURE_ID || "adv_smoke_1";
  const userId = process.env.USER_ID || "smoke_user";
  const tier = process.env.TIER || "NOMAD";
  const prisma = new PrismaClient();
  await resetTestState(prisma, { adventureId, userId });

  console.log("LOCAL SMOKE:", { adventureId, userId, tier, BILLING_TEST_CAP: process.env.BILLING_TEST_CAP ?? null });
  console.log("tiers debug:", __debugCaps());

  // 1) Normal turn
  const normal = await callTurn({ adventureId, playerText: "look around", userId, tier });
  console.log("normal:", normal.status, normal.json?.ok);
  if (!(normal.status === 200 && normal.json?.ok === true)) {
    console.log("normal response body:", JSON.stringify(normal.json, null, 2));
  }
  assert(normal.status === 200 && normal.json?.ok === true, "normal turn should succeed");

  // 2) Idempotency replay
  const idemKey = "smoke-idem-1";
  const idem1 = await callTurn({ adventureId, playerText: "open the door", userId, tier, idempotencyKey: idemKey });
  const idem2 = await callTurn({ adventureId, playerText: "open the door", userId, tier, idempotencyKey: idemKey });
  console.log("idem:", idem1.status, idem2.status, "idempotent:", idem2.json?.billing?.idempotent ?? null);
  assert(idem1.status === 200, "idempotency first should succeed");
  assert(idem2.status === 200, "idempotency second should succeed");

  // 3) Concurrency: force overlap + distinct idempotency
  process.env.BILLING_TEST_LATENCY_MS = "150";

  const [c1, c2] = await Promise.all([
    callTurn({
      adventureId,
      playerText: "push forward A",
      userId,
      tier,
      idempotencyKey: "smoke-conc-1",
    }),
    callTurn({
      adventureId,
      playerText: "push forward B",
      userId,
      tier,
      idempotencyKey: "smoke-conc-2",
    }),
  ]);

  delete process.env.BILLING_TEST_LATENCY_MS;

  console.log("concurrency:", c1.status, c2.status);
  if (!((c1.status === 429 && isBudget429(c1)) || (c2.status === 429 && isBudget429(c2)) || c1.status === 409 || c2.status === 409)) {
    console.log("c1 body:", JSON.stringify(c1.json, null, 2));
    console.log("c2 body:", JSON.stringify(c2.json, null, 2));
  }
  assert(
    (c1.status === 429 && isBudget429(c1)) ||
      (c2.status === 429 && isBudget429(c2)) ||
      c1.status === 409 ||
      c2.status === 409,
    "one concurrent request must be blocked (429 concurrency or 409)"
  );

  // 4) Monthly cap test (requires BILLING_TEST_CAP override in tiers)
  if (process.env.BILLING_TEST_CAP) {
    let hit: any = null;
    for (let i = 0; i < 300; i++) {
      const r = await callTurn({ adventureId, playerText: `spam ${i}`, userId, tier });
      if (r.status === 429) {
        hit = r;
        break;
      }
    }
    const usage = await prisma.userUsage.findFirst({ where: { userId } });
    console.log("usage after spam:", usage);
    console.log("cap-hit:", hit?.status ?? "none", hit?.json?.error?.code ?? null);
    if (!(hit && isBudget429(hit))) {
      console.log("cap-hit body:", JSON.stringify(hit?.json ?? null, null, 2));
    }
    assert(hit && isBudget429(hit), "should hit cap and get 429 budget error");
    assert(hit.json.error.code === "MONTHLY_TOKEN_CAP_EXCEEDED", "must be MONTHLY_TOKEN_CAP_EXCEEDED");
  } else {
    console.log("skip cap test: set BILLING_TEST_CAP=2000 to enable");
  }

  await prisma.$disconnect();
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
