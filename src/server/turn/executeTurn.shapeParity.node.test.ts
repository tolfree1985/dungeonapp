import test from "node:test";
import assert from "node:assert/strict";
import { executeTurn } from "./executeTurn";

test("executeTurn: legacy and pipeline return same top-level keys", async () => {
  const legacyRes = { turn: {}, billing: {}, idempotencyKey: "k1" };
  const pipelineRes = { turn: {}, billing: {}, idempotencyKey: "k1" };

  const commonArgs = {
    userId: "u1",
    adventureId: "a1",
    idempotencyKey: "k1",
    normalizedInput: "hi",
    softRate: { allowed: true },
    adventureLocked: false,
    usageVerdict: { allowed: true },
    legacy: { args: {} as any, deps: {} as any },
    pipeline: { args: {} as any, deps: {} as any },
  };

  const deps = {
    getTurnGuardVerdict: () => ({ allowed: true }),
    Usage429Error: class Usage429Error extends Error {},
    runLegacyTurnFlow: async () => legacyRes as any,
    runTurnPipeline: async () => pipelineRes as any,
  };

  process.env.TURN_PIPELINE = "0";
  const a = await executeTurn(commonArgs as any, deps as any);

  process.env.TURN_PIPELINE = "1";
  const b = await executeTurn(commonArgs as any, deps as any);

  const keys = (o: any) => Object.keys(o).sort();
  assert.deepEqual(keys(a), keys(b));
});
