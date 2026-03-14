import type { PrismaClient } from "@/generated/prisma";
import { resolveDeterministicTurn } from "@/server/turn/deterministicTurn";
import { SceneArtPayload } from "@/lib/sceneArt";
import { queueSceneArt } from "@/lib/sceneArtRepo";
import {
  presentMajorSceneTags,
  presentNpcCuesForPrompt,
  presentNpcStateForSceneKey,
  presentSceneArt,
} from "@/lib/presenters/presentSceneArt";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";

type TransactionClient = Parameters<PrismaClient["$transaction"]>[0] extends (tx: infer T) => any ? T : never;

export type RunLegacyTurnFlowArgs = {
  prisma: PrismaClient;
  userId: string;
  adventureId: string;
  idempotencyKey: string;
  playerText: string;
  model: { scene: string; resolution: { notes: string; max_tokens: number }; outputTokens: number };
  preflightMaxTokens: number;
  monthKey: string;
  holdKey: string;
  leaseKey: string;
  estInputTokens: number;
};

export type RunLegacyTurnFlowDeps = {
  hashHex: (input: string) => string;
  asUnknownArray: (value: unknown) => unknown[];
  commitUsageAndRelease: (
    tx: TransactionClient,
    args: {
      userId: string;
      monthKey: string;
      holdKey: string;
      leaseKey: string;
      actualInputTokens: number;
      actualOutputTokens: number;
      now: Date;
    }
  ) => Promise<any>;
};

export async function runLegacyTurnFlow(args: RunLegacyTurnFlowArgs, deps: RunLegacyTurnFlowDeps) {
  const {
    prisma,
    userId,
    adventureId,
    idempotencyKey,
    playerText,
    model,
    preflightMaxTokens,
    monthKey,
    holdKey,
    leaseKey,
    estInputTokens,
  } = args;

  const finalized = await prisma.$transaction(async (tx) => {
    const currentAdventure = await tx.adventure.findUniqueOrThrow({
      where: { id: adventureId },
      select: { id: true, latestTurnIndex: true, state: true },
    });
    const nextTurnIndex = currentAdventure.latestTurnIndex + 1;
    const resolvedTurn = resolveDeterministicTurn({
      playerText,
      previousState: currentAdventure.state,
      turnIndex: nextTurnIndex,
    });

    await tx.adventure.update({
      where: { id: adventureId },
      data: {
        latestTurnIndex: nextTurnIndex,
        state: resolvedTurn.nextState as any,
      },
      select: { id: true, latestTurnIndex: true },
    });

    const turn = await tx.turn.create({
      data: {
        adventureId: currentAdventure.id,
        turnIndex: nextTurnIndex,
        playerInput: playerText,
        scene: resolvedTurn.scene,
        resolution: {
          ...model.resolution,
          ...resolvedTurn.resolution,
        },
        stateDeltas: resolvedTurn.stateDeltas as any,
        ledgerAdds: resolvedTurn.ledgerAdds as any,
      },
    });

    const prevEvent = await tx.turnEvent.findFirst({
      where: { adventureId: currentAdventure.id },
      orderBy: { seq: "desc" },
      select: { eventId: true, seq: true },
    });
    const seq = (prevEvent?.seq ?? -1) + 1;

    const modelInputHash = deps.hashHex(
      JSON.stringify({
        adventureId,
        playerText,
        max_tokens: preflightMaxTokens,
        action: resolvedTurn.action,
      })
    );
    const stateDeltas = deps.asUnknownArray((turn as any).stateDeltas);
    const ledgerAdds = deps.asUnknownArray((turn as any).ledgerAdds);
    const turnPayload = {
      turnId: turn.id,
      turnIndex: turn.turnIndex,
      scene: turn.scene,
      resolution: turn.resolution,
      stateDeltas: stateDeltas as any,
      ledgerAdds: ledgerAdds as any,
    };
    const eventHash = deps.hashHex(
      JSON.stringify({
        seq,
        prevEventId: prevEvent?.eventId ?? null,
        idempotencyKey,
        modelInputHash,
        turnPayload,
      })
    );

    const committed = await deps.commitUsageAndRelease(tx, {
      userId,
      monthKey,
      holdKey,
      leaseKey,
      actualInputTokens: estInputTokens,
      actualOutputTokens: model.outputTokens,
      now: new Date(),
    });

    await tx.turnEvent.create({
      data: {
      adventureId: currentAdventure.id,
        seq,
        prevEventId: prevEvent?.eventId ?? null,
        idempotencyKey,
        eventHash,
        engineVersion: "billing-phase-a-b-v1",
        status: "APPLIED",
        baseStateHash: deps.hashHex(`base|${currentAdventure.id}|${turn.turnIndex}`),
        resultStateHash: deps.hashHex(`result|${currentAdventure.id}|${turn.turnIndex}`),
        rngSeed: "0",
        playerInput: playerText,
        modelInputHash,
        turnJson: turnPayload,
      },
    });

    return { turn, billing: committed, idempotencyKey, nextState: resolvedTurn.nextState as Record<string, unknown> };
  });

  const sceneArtPayload = buildSceneArtPayload({
    turn: finalized.turn,
    nextState: finalized.nextState ?? null,
  });

  if (sceneArtPayload) {
    await queueSceneArt(sceneArtPayload, ENGINE_VERSION);
  }

  return { ...finalized, sceneArtPayload };
}

function buildSceneArtPayload(input: { turn: { scene: string }; nextState: Record<string, unknown> | null }): SceneArtPayload | null {
  const stateRecord = asRecord(input.nextState);
  const locationInfo = resolveLocationInfo(stateRecord);
  const timeInfo = resolveTimeInfo(stateRecord);
  const pressureInfo = resolvePressureStage(stateRecord);

  return presentSceneArt({
    title: input.turn.scene,
    locationId: locationInfo.id,
    locationText: locationInfo.text,
    timeBucket: timeInfo.bucket,
    timeText: timeInfo.text,
    pressureStage: pressureInfo.stage,
    pressureText: pressureInfo.text,
    npcState: presentNpcStateForSceneKey(stateRecord),
    npcCues: presentNpcCuesForPrompt(stateRecord),
    majorTags: presentMajorSceneTags(input.turn as any, stateRecord),
    appearanceCues: [],
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readSection(state: Record<string, unknown> | null, key: string): unknown {
  if (!state) return null;
  if (state[key] !== undefined) return state[key];
  const player = asRecord(state.player);
  if (player?.[key] !== undefined) return player[key];
  return null;
}

function resolveLocationInfo(state: Record<string, unknown> | null): { id: string; text: string } {
  const raw = readSection(state, "location");
  const record = asRecord(raw);
  const candidateId = asString(record?.id) ?? asString(raw) ?? "unknown-location";
  const candidateText =
    asString(record?.label) ?? asString(record?.name) ?? asString(raw) ?? "Unknown location";
  return { id: candidateId, text: candidateText };
}

function resolveTimeInfo(state: Record<string, unknown> | null): { bucket: string; text: string } {
  const raw = readSection(state, "time");
  const record = asRecord(raw);
  const bucket = asString(record?.bucket) ?? asString(raw) ?? "unknown-time";
  const text = asString(record?.label) ?? asString(record?.name) ?? asString(raw) ?? "Unknown time";
  return { bucket, text };
}

function resolvePressureStage(state: Record<string, unknown> | null): { stage: string; text: string } {
  const raw = readSection(state, "pressure");
  const record = asRecord(raw) ?? state;
  const stage = asString(record?.stage ?? state?.pressureStage) ?? "calm";
  const text = asString(record?.label ?? state?.pressure?.label) ?? stage;
  return { stage: stage.toLowerCase(), text };
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
