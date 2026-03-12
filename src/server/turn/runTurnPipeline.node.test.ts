import test from "node:test";
import assert from "node:assert/strict";
import { runTurnPipeline } from "./runTurnPipeline";

test("runTurnPipeline executes reserve -> generate -> persist -> commit", async () => {
  const calls: string[] = [];
  const prisma = {
    $transaction: async (fn: any) => fn({}),
  };

  const originalTripwire = process.env.PIPELINE_TRIPWIRE;
  process.env.PIPELINE_TRIPWIRE = "0";

  const result = await runTurnPipeline(
    {
      prisma,
      userId: "u1",
      adventureId: "a1",
      idempotencyKey: "k1",
      normalizedInput: "hello",
      model: { scene: "s", resolution: { notes: "n", max_tokens: 10 }, outputTokens: 5 },
      preflightMaxTokens: 10,
      monthKey: "m",
      holdKey: "h",
      leaseKey: "l",
      estInputTokens: 3,
    },
    {
      reserveUsageDayLock: async () => {
        calls.push("reserve");
        return { count: 1 };
      },
      generateTurn: async () => {
        calls.push("generate");
        return { scene: "s", resolution: { notes: "n", max_tokens: 10 }, outputTokens: 5 };
      },
      persistTurn: async () => {
        calls.push("persist");
        return { turn: { id: "t" }, billing: { ok: true }, idempotencyKey: "k1" };
      },
      commitUsageAndRelease: async () => {
        calls.push("commit");
      },
      hashHex: () => "",
      asUnknownArray: () => [],
    }
  );

  assert.deepEqual(calls, ["reserve", "generate", "persist", "commit"]);
  assert.equal((result.turn as any).id, "t");
  assert.equal(result.idempotencyKey, "k1");
  process.env.PIPELINE_TRIPWIRE = originalTripwire;
});

test("runTurnPipeline releases on failure", async () => {
  const calls: string[] = [];
  const prisma = {
    $transaction: async (fn: any) => fn({}),
  };

  const originalTripwire = process.env.PIPELINE_TRIPWIRE;
  process.env.PIPELINE_TRIPWIRE = "0";

  await assert.rejects(
    () =>
      runTurnPipeline(
        {
          prisma,
          userId: "u1",
          adventureId: "a1",
          idempotencyKey: "k1",
          normalizedInput: "hello",
          model: { scene: "s", resolution: { notes: "n", max_tokens: 10 }, outputTokens: 5 },
          preflightMaxTokens: 10,
          monthKey: "m",
          holdKey: "h",
          leaseKey: "l",
          estInputTokens: 3,
        },
        {
          reserveUsageDayLock: async () => {
            calls.push("reserve");
            return { count: 1 };
          },
          generateTurn: async () => {
            calls.push("generate");
            throw new Error("boom");
          },
          persistTurn: async () => {
            calls.push("persist");
            return { turn: { id: "t" }, billing: { ok: true }, idempotencyKey: "k1" };
          },
          commitUsageAndRelease: async () => {
            calls.push("commit");
          },
          hashHex: () => "",
          asUnknownArray: () => [],
        }
      ),
    (err: any) => err instanceof Error && err.message === "boom"
  );

  assert.deepEqual(calls, ["reserve", "generate", "commit"]);
  process.env.PIPELINE_TRIPWIRE = originalTripwire;
});
