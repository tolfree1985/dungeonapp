import { POST } from "../app/api/turn/route";
import { prisma } from "../src/lib/prisma";
import { __debugCaps } from "../src/lib/billing/tiers";

type TurnReq = {
  adventureId: string;
  playerText: string;
  userId?: string;
  tier?: string;
  idempotencyKey?: string;
};

const SMOKE_DEBUG = process.env.SMOKE_DEBUG === "1";
const debug = (...args: unknown[]) => {
  if (SMOKE_DEBUG) console.log("[smoke:debug]", ...args);
};

type BudgetExceededCode = "CONCURRENCY_LIMIT_EXCEEDED" | "MONTHLY_TOKEN_CAP_EXCEEDED";

async function callTurn(body: TurnReq) {
  const req = new Request("http://local/api/turn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-smoke-bypass-soft-rate-limit": "1",
    },
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

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

function isISODateString(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

function assertBudgetExceeded429(
  body: any,
  expected: {
    code: BudgetExceededCode;
    idempotencyKey: string;
  }
) {
  assert(body && typeof body === "object", "429 body must be an object");
  assert(typeof body.error === "string", "429 body.error must be a string");
  assert(body.error === "BUDGET_EXCEEDED", "error must be BUDGET_EXCEEDED");
  assert(body.code === expected.code, `code must be ${expected.code}`);

  assert(
    body.idempotencyKey === expected.idempotencyKey,
    "idempotencyKey must equal request idempotencyKey"
  );

  assert(isISODateString(body.retryAt), "retryAt must be an ISO date string");
}

async function resetTestState(prisma: typeof import("../src/lib/prisma").prisma, args: { adventureId: string; userId: string }) {
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
  await resetTestState(prisma, { adventureId, userId });

  debug("LOCAL SMOKE", { adventureId, userId, tier, BILLING_TEST_CAP: process.env.BILLING_TEST_CAP ?? null });
  debug("tiers debug", __debugCaps());

  // 1) Normal turn
  const normal = await callTurn({ adventureId, playerText: "look around", userId, tier });
  debug("normal", normal.status, normal.json?.ok);
  if (!(normal.status === 200 && normal.json?.ok === true)) {
    debug("normal response body", JSON.stringify(normal.json, null, 2));
  }
  assert(normal.status === 200 && normal.json?.ok === true, "normal turn should succeed");

  // 2) Idempotency replay
  const idemKey = "smoke-idem-1";
  const idem1 = await callTurn({ adventureId, playerText: "open the door", userId, tier, idempotencyKey: idemKey });
  const idem2 = await callTurn({ adventureId, playerText: "open the door", userId, tier, idempotencyKey: idemKey });
  debug("idem", idem1.status, idem2.status, "idempotent:", idem2.json?.billing?.idempotent ?? null);
  assert(idem1.status === 200, "idempotency first should succeed");
  assert(idem2.status === 200, "idempotency second should succeed");

  // 3) Concurrency: force overlap + distinct idempotency
  process.env.BILLING_TEST_LATENCY_MS = "150";

  const concKey1 = "smoke-conc-1";
  const concKey2 = "smoke-conc-2";
  const [c1, c2] = await Promise.all([
    callTurn({
      adventureId,
      playerText: "push forward A",
      userId,
      tier,
      idempotencyKey: concKey1,
    }),
    callTurn({
      adventureId,
      playerText: "push forward B",
      userId,
      tier,
      idempotencyKey: concKey2,
    }),
  ]);

  delete process.env.BILLING_TEST_LATENCY_MS;

  debug("concurrency", c1.status, c2.status);
  if (!(c1.status === 429 || c2.status === 429)) {
    debug("c1 body", JSON.stringify(c1.json, null, 2));
    debug("c2 body", JSON.stringify(c2.json, null, 2));
  }
  assert(c1.status === 429 || c2.status === 429, "one concurrent request must be blocked with 429");

  if (c1.status === 429) {
    assertBudgetExceeded429(c1.json, {
      code: "CONCURRENCY_LIMIT_EXCEEDED",
      idempotencyKey: concKey1,
    });
  } else {
    assertBudgetExceeded429(c2.json, {
      code: "CONCURRENCY_LIMIT_EXCEEDED",
      idempotencyKey: concKey2,
    });
  }

  // 4) Monthly cap test (requires BILLING_TEST_CAP override in tiers)
  if (process.env.BILLING_TEST_CAP) {
    let hit: any = null;
    let capIdempotencyKey: string | null = null;
    for (let i = 0; i < 300; i++) {
      const idempotencyKey = `smoke-cap-${i}`;
      const r = await callTurn({ adventureId, playerText: `spam ${i}`, userId, tier, idempotencyKey });
      if (r.status === 429) {
        hit = r;
        capIdempotencyKey = idempotencyKey;
        break;
      }
    }
    const usage = await prisma.userUsage.findFirst({ where: { userId } });
    debug("usage after spam", usage);
    debug("cap-hit", hit?.status ?? "none", hit?.json?.code ?? null);
    if (!(hit && hit.status === 429 && hit.json?.error === "BUDGET_EXCEEDED")) {
      debug("cap-hit body", JSON.stringify(hit?.json ?? null, null, 2));
    }
    assert(hit, "should hit cap and get 429 budget error");
    assert(capIdempotencyKey, "cap idempotency key must be captured");
    assertBudgetExceeded429(hit.json, {
      code: "MONTHLY_TOKEN_CAP_EXCEEDED",
      idempotencyKey: capIdempotencyKey,
    });
  } else {
    debug("skip cap test: set BILLING_TEST_CAP=2000 to enable");
  }

  await prisma.$disconnect();
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAIL", e);
  process.exit(1);
});
