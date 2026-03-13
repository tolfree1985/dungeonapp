import { prisma } from "@/lib/prisma";
import type { DbClient } from "@/lib/dbClient";
import type { Prisma } from "@/generated/prisma";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";

export async function loadSaveState(saveId: string, db: DbClient = prisma) {
  return db.save.findUniqueOrThrow({
    where: { id: saveId },
    select: {
      id: true,
      scenarioId: true,
      nextTurnIndex: true,
      stateJson: true,
      ledgerJson: true,
      styleLockJson: true,
    },
  });
}

export async function createTurnRow(data: Parameters<DbClient["turn"]["create"]>[0]["data"], db: DbClient = prisma) {
  return db.turn.create({ data });
}

export async function updateSaveAfterTurn(
  saveId: string,
  data: Parameters<DbClient["save"]["update"]>[0]["data"],
  db: DbClient = prisma,
) {
  return db.save.update({
    where: { id: saveId },
    data,
  });
}

export type TurnPersistenceArgs = {
  adventureId: string;
  playerText: string;
  idempotencyKey: string;
  model: {
    scene: string;
    resolution: string;
    outputTokens: number;
  };
  preflight: {
    perTurnMaxOutputTokens: number;
  };
  userId: string;
  monthKey: string;
  holdKey: string;
  leaseKey: string;
  estInputTokens: number;
  hashHex: (value: string) => string;
  asUnknownArray: (value: unknown) => unknown[];
  commitUsageAndRelease: (
    client: DbClient,
    args: {
      userId: string;
      monthKey: string;
      holdKey: string;
      leaseKey: string;
      actualInputTokens: number;
      actualOutputTokens: number;
      now: Date;
    },
  ) => Promise<unknown>;
};

export type TurnPersistenceResult = {
  turn: unknown;
  billing: unknown;
  idempotencyKey: string;
};

export async function turnPersistence(
  args: TurnPersistenceArgs,
  db: DbClient = prisma,
): Promise<TurnPersistenceResult> {
  const currentAdventure = await db.adventure.findUniqueOrThrow({
    where: { id: args.adventureId },
    select: { id: true, latestTurnIndex: true, state: true },
  });
  const nextTurnIndex = currentAdventure.latestTurnIndex + 1;
  const resolvedTurn = resolveDeterministicTurn({
    playerText: args.playerText,
    previousState: currentAdventure.state,
    turnIndex: nextTurnIndex,
  });

  await db.adventure.update({
    where: { id: args.adventureId },
    data: {
      latestTurnIndex: nextTurnIndex,
      state: resolvedTurn.nextState as any,
    },
    select: { id: true, latestTurnIndex: true },
  });

  const turn = await db.turn.create({
    data: {
      adventureId: currentAdventure.id,
      turnIndex: nextTurnIndex,
      playerInput: args.playerText,
      scene: resolvedTurn.scene,
      resolution: {
        ...(typeof args.model.resolution === "string"
          ? { raw: args.model.resolution }
          : (args.model.resolution as Record<string, unknown>)),
        ...resolvedTurn.resolution,
      } as Prisma.InputJsonValue,
      stateDeltas: resolvedTurn.stateDeltas as Prisma.InputJsonValue,
      ledgerAdds: resolvedTurn.ledgerAdds as Prisma.InputJsonValue,
    },
  });

  const prevEvent = await db.turnEvent.findFirst({
    where: { adventureId: currentAdventure.id },
    orderBy: { seq: "desc" },
    select: { eventId: true, seq: true },
  });
  const seq = (prevEvent?.seq ?? -1) + 1;

  const modelInputHash = args.hashHex(
    JSON.stringify({
      adventureId: args.adventureId,
      playerText: args.playerText,
      max_tokens: args.preflight.perTurnMaxOutputTokens,
      action: resolvedTurn.action,
    }),
  );

  const stateDeltas = args.asUnknownArray((turn as any).stateDeltas);
  const ledgerAdds = args.asUnknownArray((turn as any).ledgerAdds);

  const turnPayload = {
    turnId: turn.id,
    turnIndex: turn.turnIndex,
    scene: turn.scene,
    resolution: turn.resolution,
    stateDeltas,
    ledgerAdds,
  };

  const eventHash = args.hashHex(
    JSON.stringify({
      seq,
      prevEventId: prevEvent?.eventId ?? null,
      idempotencyKey: args.idempotencyKey,
      modelInputHash,
      turnPayload,
    }),
  );

  const committed = await args.commitUsageAndRelease(db, {
    userId: args.userId,
    monthKey: args.monthKey,
    holdKey: args.holdKey,
    leaseKey: args.leaseKey,
    actualInputTokens: args.estInputTokens,
    actualOutputTokens: args.model.outputTokens,
    now: new Date(),
  });

  await db.turnEvent.create({
    data: {
      adventureId: currentAdventure.id,
      seq,
      prevEventId: prevEvent?.eventId ?? null,
      idempotencyKey: args.idempotencyKey,
      eventHash,
      engineVersion: "billing-phase-a-b-v1",
      status: "APPLIED",
      baseStateHash: args.hashHex(`base|${currentAdventure.id}|${turn.turnIndex}`),
      resultStateHash: args.hashHex(`result|${currentAdventure.id}|${turn.turnIndex}`),
      rngSeed: "0",
      playerInput: args.playerText,
      modelInputHash,
    turnJson: turnPayload as Prisma.InputJsonValue,
    },
  });

  return { turn, billing: committed, idempotencyKey: args.idempotencyKey };
}
