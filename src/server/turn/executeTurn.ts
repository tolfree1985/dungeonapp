import { getTurnGuardVerdict } from "@/server/turn/guard/getTurnGuardVerdict";
import { type TurnGuardVerdict } from "@/server/turn/guard/types";
import { Usage429Error } from "../../../app/api/turn/enforceUsageTx";
import { runLegacyTurnFlow, type RunLegacyTurnFlowArgs, type RunLegacyTurnFlowDeps } from "@/server/turn/runLegacyTurnFlow";
import { runTurnPipeline, type RunTurnPipelineArgs, type RunTurnPipelineDeps } from "@/server/turn/runTurnPipeline";
import { logTurnHealthSummary, logStructuredFailure } from "@/lib/turn/observability";
import { type IntentMode } from "@/lib/watchfulness-action-flags";

export type ExecuteTurnArgs = {
  userId: string;
  adventureId: string;
  idempotencyKey: string | null;
  normalizedInput: string;
  softRate: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
  adventureLocked?: boolean;
  usageVerdict?: { allowed: boolean; retryAfterMs?: number; reason?: string } | null;
  mode: IntentMode;
  legacy: {
    args: RunLegacyTurnFlowArgs;
    deps: RunLegacyTurnFlowDeps;
  };
  pipeline: {
    args: RunTurnPipelineArgs;
    deps: RunTurnPipelineDeps;
  };
};

export type ExecuteTurnDeps = {
  getTurnGuardVerdict: typeof getTurnGuardVerdict;
  Usage429Error: typeof Usage429Error;
  runLegacyTurnFlow: typeof runLegacyTurnFlow;
  runTurnPipeline: typeof runTurnPipeline;
};

const defaultDeps: ExecuteTurnDeps = {
  getTurnGuardVerdict,
  Usage429Error,
  runLegacyTurnFlow,
  runTurnPipeline,
};

export async function executeTurn(args: ExecuteTurnArgs, deps: ExecuteTurnDeps = defaultDeps) {
  if (process.env.TURN_PIPELINE_FORCE_LEGACY === "1") {
    return await deps.runLegacyTurnFlow(args.legacy.args, args.legacy.deps);
  }

  const start = Date.now();
  const verdict = deps.getTurnGuardVerdict({
    userId: args.userId,
    adventureId: args.adventureId,
    flags: { TURN_PIPELINE: process.env.TURN_PIPELINE === "1" },
    request: {
      inputChars: args.normalizedInput.length,
      idempotencyKey: args.idempotencyKey ?? undefined,
      softRate: args.softRate,
    },
    context: {
      adventureLocked: Boolean(args.adventureLocked),
      usageVerdict: args.usageVerdict ?? null,
    },
  });

  if (!verdict.allowed) {
    console.warn("turn.denied", {
      userId: args.userId,
      code: verdict.code,
    });
    throw new deps.Usage429Error({
      error: "BUDGET_EXCEEDED",
      code: verdict.code,
      reason: verdict.reason,
      retryAfterMs: verdict.retryAfterMs,
    });
  }

  const allowUsers = (process.env.TURN_PIPELINE_ALLOWLIST_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowAdvs = (process.env.TURN_PIPELINE_ALLOWLIST_ADVENTURES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const rolloutPercent = Number(process.env.TURN_PIPELINE_PERCENT ?? "0");

  function hashToPercent(key: string) {
    const h = Math.abs(
      key.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)
    );
    return h % 100;
  }

  const percentGate =
    rolloutPercent > 0 && hashToPercent(args.userId) < rolloutPercent;

  const allowlisted =
    allowUsers.includes(args.userId) || allowAdvs.includes(args.adventureId);

  const forcePipeline = args.mode === "DO";
  const pipelineEnabled =
    forcePipeline ||
    (process.env.TURN_PIPELINE === "1" && (allowlisted || percentGate));

  console.info("turn.branch", {
    userId: args.userId,
    adventureId: args.adventureId,
    branch: pipelineEnabled ? "pipeline" : "legacy",
    forced: forcePipeline,
  });

  const res = pipelineEnabled
    ? await deps.runTurnPipeline(args.pipeline.args, args.pipeline.deps)
    : await deps.runLegacyTurnFlow(args.legacy.args, args.legacy.deps);

  const durationMs = Date.now() - start;
  console.info("turn.duration", {
    userId: args.userId,
    branch: pipelineEnabled ? "pipeline" : "legacy",
    ms: durationMs,
  });

  logTurnHealthSummary({
    userId: args.userId,
    adventureId: args.adventureId,
    branch: pipelineEnabled ? "pipeline" : "legacy",
    normalizedInputLength: args.normalizedInput.length,
    idempotencyKey: args.idempotencyKey,
    softRateAllowed: args.softRate?.allowed ?? true,
    usageAllowed: args.usageVerdict?.allowed ?? true,
    durationMs,
    success: true,
  });

  return res;
}
