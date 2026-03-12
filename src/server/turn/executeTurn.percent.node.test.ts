import test from "node:test";
import assert from "node:assert/strict";
import { executeTurn } from "./executeTurn";

test("executeTurn respects TURN_PIPELINE_PERCENT", async () => {
  const commonArgs = {
    userId: "userA",
    adventureId: "advA",
    idempotencyKey: "k",
    normalizedInput: "hi",
    softRate: { allowed: true },
    adventureLocked: false,
    usageVerdict: { allowed: true },
    legacy: { args: {} as any, deps: {} as any },
    pipeline: { args: {} as any, deps: {} as any },
  } as any;

  const deps = {
    getTurnGuardVerdict: () => ({ allowed: true }),
    Usage429Error: class Usage429Error extends Error {},
    runLegacyTurnFlow: async () => ({ turn: {}, billing: {}, idempotencyKey: "k" }),
    runTurnPipeline: async () => ({ turn: {}, billing: {}, idempotencyKey: "k" }),
  } as any;

  process.env.TURN_PIPELINE = "1";
  process.env.TURN_PIPELINE_PERCENT = "0";
  const legacyResult = await executeTurn(commonArgs, deps);
  assert.deepEqual(Object.keys(legacyResult).sort(), ["billing", "idempotencyKey", "turn"]);

  process.env.TURN_PIPELINE_PERCENT = "100";
  const pipelineResult = await executeTurn(commonArgs, deps);
  assert.deepEqual(Object.keys(pipelineResult).sort(), ["billing", "idempotencyKey", "turn"]);
});
