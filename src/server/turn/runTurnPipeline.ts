import type { TurnPersistenceArgs } from "../../../app/api/turn/turnDb";
import type { IntentMode } from "@/lib/watchfulness-action-flags";
import type { IntentMode } from "@/lib/watchfulness-action-flags";

export type RunTurnPipelineResult = {
  turn: any;
  billing: any;
  idempotencyKey: string | null;
};

export type RunTurnPipelineArgs = {
  prisma: any;
  userId: string;
  adventureId: string;
  idempotencyKey: string | null;
  normalizedInput: string;
  model: { scene: string; resolution: { notes: string; max_tokens: number }; outputTokens: number };
  preflightMaxTokens: number;
  monthKey: string;
  holdKey: string;
  leaseKey: string;
  estInputTokens: number;
  mode: IntentMode;
};

export type RunTurnPipelineDeps = {
  reserveUsageDayLock: (prisma: any, key: string, day: string) => Promise<any>;
  generateTurn: (tx: any, input: RunTurnPipelineArgs) => Promise<{ scene: string; resolution: { notes: string; max_tokens: number }; outputTokens: number }>;
  persistTurn: (args: TurnPersistenceArgs, tx: any) => Promise<{ turn: any; billing: any; idempotencyKey: string }>;
  commitUsageAndRelease: (tx: any, args: {
    userId: string;
    monthKey: string;
    holdKey: string;
    leaseKey: string;
    actualInputTokens: number;
    actualOutputTokens: number;
    now: Date;
  }) => Promise<any>;
  hashHex: (input: string) => string;
  asUnknownArray: (value: unknown) => unknown[];
  persistFailure?: (args: {
    prisma: any;
    userId: string;
    adventureId: string;
    idempotencyKey: string | null;
    error: unknown;
  }) => Promise<void>;
};

export async function runTurnPipeline(
  args: RunTurnPipelineArgs,
  deps: RunTurnPipelineDeps
): Promise<RunTurnPipelineResult> {
  if (process.env.TURN_PIPELINE === "1" && process.env.PIPELINE_TRIPWIRE === "1") {
    throw new Error("PIPELINE_TRIPWIRE: runTurnPipeline called while TURN_PIPELINE=1");
  }

  console.info("turn.reserve", {
    userId: args.userId,
    adventureId: args.adventureId,
    holdKey: args.holdKey,
  });
  await deps.reserveUsageDayLock(args.prisma, `save:${args.adventureId}:inflight`, "inflight");

  try {
    const result = await args.prisma.$transaction(async (tx: any) => {
      const generated = await deps.generateTurn(tx, args);
      const persistenceModel = {
        ...generated,
        resolution: JSON.stringify(generated.resolution),
      };
      const persisted = await deps.persistTurn(
        {
          adventureId: args.adventureId,
          playerText: args.normalizedInput,
          idempotencyKey: args.idempotencyKey ?? "",
          model: persistenceModel,
          preflight: { perTurnMaxOutputTokens: args.preflightMaxTokens },
          userId: args.userId,
          monthKey: args.monthKey,
          holdKey: args.holdKey,
          leaseKey: args.leaseKey,
          estInputTokens: args.estInputTokens,
          mode: args.mode,
          hashHex: deps.hashHex,
          asUnknownArray: deps.asUnknownArray,
          commitUsageAndRelease: deps.commitUsageAndRelease,
        },
        tx
      );
      await deps.commitUsageAndRelease(tx, {
        userId: args.userId,
        monthKey: args.monthKey,
        holdKey: args.holdKey,
        leaseKey: args.leaseKey,
        actualInputTokens: args.estInputTokens,
        actualOutputTokens: generated.outputTokens,
        now: new Date(),
      });
      console.info("turn.commit", {
        userId: args.userId,
        adventureId: args.adventureId,
        holdKey: args.holdKey,
      });
      return persisted;
    });
    return {
      turn: result.turn,
      billing: result.billing,
      idempotencyKey: result.idempotencyKey,
    };
  } catch (err) {
    console.warn("turn.commit.failure", {
      userId: args.userId,
      adventureId: args.adventureId,
      holdKey: args.holdKey,
    });
    if (deps.persistFailure) {
      await deps.persistFailure({
        prisma: args.prisma,
        userId: args.userId,
        adventureId: args.adventureId,
        idempotencyKey: args.idempotencyKey,
        error: err,
      }).catch(() => {});
    }
    await deps
      .commitUsageAndRelease(args.prisma, {
        userId: args.userId,
        monthKey: args.monthKey,
        holdKey: args.holdKey,
        leaseKey: args.leaseKey,
        actualInputTokens: args.estInputTokens,
        actualOutputTokens: args.model.outputTokens,
        now: new Date(),
      })
      .catch(() => {});
    throw err;
  }
}
