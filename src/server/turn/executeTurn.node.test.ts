import test from "node:test";
import assert from "node:assert/strict";
import { executeTurn } from "./executeTurn";
import type { RunLegacyTurnFlowArgs, RunLegacyTurnFlowDeps } from "./runLegacyTurnFlow";
import type { RunTurnPipelineArgs, RunTurnPipelineDeps } from "./runTurnPipeline";

test("TURN_PIPELINE=0 -> legacy path only", async () => {
  process.env.TURN_PIPELINE = "0";
  process.env.TURN_PIPELINE_ALLOWLIST_USERS = "";
  process.env.TURN_PIPELINE_ALLOWLIST_ADVENTURES = "";
  process.env.TURN_PIPELINE_PERCENT = "0";
  let legacyCalls = 0;
  let pipelineCalls = 0;

  const res = await executeTurn(
    {
      userId: "u1",
      adventureId: "a1",
      idempotencyKey: "k1",
      normalizedInput: "hi",
      softRate: { allowed: true },
      legacy: { args: {} as RunLegacyTurnFlowArgs, deps: {} as RunLegacyTurnFlowDeps },
      pipeline: { args: {} as RunTurnPipelineArgs, deps: {} as RunTurnPipelineDeps },
    },
    {
      getTurnGuardVerdict: () => ({ allowed: true }),
      Usage429Error: class Usage429Error extends Error {},
      runLegacyTurnFlow: async () => {
        legacyCalls++;
        return { turn: { id: "t1" }, billing: {}, idempotencyKey: "k1" };
      },
      runTurnPipeline: async () => {
        pipelineCalls++;
        return { turn: { id: "tP" }, billing: {}, idempotencyKey: "k1" };
      },
    } as any
  );

  assert.equal(legacyCalls, 1);
  assert.equal(pipelineCalls, 0);
  assert.equal((res as any).turn?.id, "t1");
});

test("TURN_PIPELINE=1 -> pipeline path only", async () => {
  const originalAllowUsers = process.env.TURN_PIPELINE_ALLOWLIST_USERS;
  const originalPercent = process.env.TURN_PIPELINE_PERCENT;
  process.env.TURN_PIPELINE = "1";
  process.env.TURN_PIPELINE_ALLOWLIST_USERS = "u1";
  process.env.TURN_PIPELINE_PERCENT = "0";
  let legacyCalls = 0;
  let pipelineCalls = 0;

  const res = await executeTurn(
    {
      userId: "u1",
      adventureId: "a1",
      idempotencyKey: "k1",
      normalizedInput: "hi",
      softRate: { allowed: true },
      legacy: { args: {} as RunLegacyTurnFlowArgs, deps: {} as RunLegacyTurnFlowDeps },
      pipeline: { args: {} as RunTurnPipelineArgs, deps: {} as RunTurnPipelineDeps },
    },
    {
      getTurnGuardVerdict: () => ({ allowed: true }),
      Usage429Error: class Usage429Error extends Error {},
      runLegacyTurnFlow: async () => {
        legacyCalls++;
        return { turn: { id: "t1" }, billing: {}, idempotencyKey: "k1" };
      },
      runTurnPipeline: async () => {
        pipelineCalls++;
        return { turn: { id: "tP" }, billing: {}, idempotencyKey: "k1" };
      },
    } as any
  );

  assert.equal(legacyCalls, 0);
  assert.equal(pipelineCalls, 1);
  assert.equal((res as any).turn?.id, "tP");
  process.env.TURN_PIPELINE_ALLOWLIST_USERS = originalAllowUsers;
  process.env.TURN_PIPELINE_PERCENT = originalPercent;
});

test("deny verdict -> calls neither path", async () => {
  process.env.TURN_PIPELINE = "1";
  let legacyCalls = 0;
  let pipelineCalls = 0;

  class Usage429Error extends Error {
    public code: string;
    public retryAfterMs?: number;

    constructor(payload: { code: string; reason: string; retryAfterMs?: number }) {
      super(payload.reason);
      this.name = "Usage429Error";
      this.code = payload.code;
      this.retryAfterMs = payload.retryAfterMs;
    }
  }

  await assert.rejects(
    () =>
      executeTurn(
        {
          userId: "u1",
          adventureId: "a1",
          idempotencyKey: "k1",
          normalizedInput: "hi",
          softRate: { allowed: true },
          legacy: { args: {} as RunLegacyTurnFlowArgs, deps: {} as RunLegacyTurnFlowDeps },
          pipeline: { args: {} as RunTurnPipelineArgs, deps: {} as RunTurnPipelineDeps },
        },
        {
          getTurnGuardVerdict: () => ({
            allowed: false,
            code: "SOFT_RATE",
            reason: "too fast",
            retryAfterMs: 1000,
          }),
          Usage429Error,
          runLegacyTurnFlow: async () => {
            legacyCalls++;
            return { turn: { id: "t1" }, billing: {}, idempotencyKey: "k1" };
          },
          runTurnPipeline: async () => {
            pipelineCalls++;
            return { turn: { id: "tP" }, billing: {}, idempotencyKey: "k1" };
          },
        } as any
      ),
    (err: any) => err instanceof Usage429Error && err.code === "SOFT_RATE"
  );

  assert.equal(legacyCalls, 0);
  assert.equal(pipelineCalls, 0);
});
