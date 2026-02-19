import assert from "node:assert/strict";
import { PrismaClient } from "../src/generated/prisma";
import { POST as turnPost } from "../app/api/turn/route";

process.env.SOFT_RATE_LIMIT_TURN_POST_PER_MIN ??= "1";
process.env.NODE_ENV ??= "test";

async function callTurn(body: Record<string, unknown>, headers?: Record<string, string>) {
  const req = new Request("http://local.test/api/turn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
  const res = await turnPost(req);
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function main() {
  const prisma = new PrismaClient();
  const userId = "turn_error_norm_user";
  const budgetUserId = `${userId}_budget`;

  await prisma.turnBudgetHold.deleteMany({
    where: { userId: { in: [userId, budgetUserId] } },
  });
  await prisma.turnLease.deleteMany({
    where: { userId: { in: [userId, budgetUserId] } },
  });
  await prisma.userUsage.deleteMany({
    where: { userId: { in: [userId, budgetUserId] } },
  });

  const first = await callTurn({
    adventureId: "adv-turn-error-normalization",
    playerText: "check one",
    userId,
    tier: "NOMAD",
    idempotencyKey: "norm-rate-1",
  });
  assert.notEqual(first.res.status, 429, "first request should not be rate limited");

  const second = await callTurn({
    adventureId: "adv-turn-error-normalization",
    playerText: "check two",
    userId,
    tier: "NOMAD",
    idempotencyKey: "norm-rate-2",
  });
  assert.equal(second.res.status, 429, "second request should be rate limited");
  assert.equal(second.json?.error, "RATE_LIMITED");
  assert.equal(second.json?.code, "RATE_LIMITED");
  assert.equal(typeof second.json?.message, "undefined", "message must not leak");
  assert.equal(typeof second.json?.stack, "undefined", "stack must not leak");

  const budget = await callTurn(
    {
      adventureId: "adv-turn-error-normalization",
      playerText: "force cap",
      userId: budgetUserId,
      tier: "NOMAD",
      idempotencyKey: "norm-budget-1",
    },
    {
      "x-smoke-bypass-soft-rate-limit": "1",
      "x-smoke-cap-override": "1",
    },
  );

  assert.equal(budget.res.status, 429, "budget call should return 429");
  assert.equal(budget.json?.error, "BUDGET_EXCEEDED");
  assert.ok(
    budget.json?.code === "MONTHLY_TOKEN_CAP_EXCEEDED" || budget.json?.code === "CONCURRENCY_LIMIT_EXCEEDED",
    "budget code should be a known billing code",
  );
  assert.equal(typeof budget.json?.message, "undefined", "message must not leak");
  assert.equal(typeof budget.json?.stack, "undefined", "stack must not leak");

  console.log("TURN ERROR NORMALIZATION OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
