import { SceneArtPayload } from "@/lib/sceneArt";
import {
  presentMajorSceneTags,
  presentNpcCuesForPrompt,
  presentNpcStateForSceneKey,
  presentSceneArt,
} from "@/lib/presenters/presentSceneArt";

type CanonicalSceneArtParams = {
  turn: { scene?: string | null } | null;
  state: Record<string, unknown> | null;
};

export function buildCanonicalSceneArtPayload({ turn, state }: CanonicalSceneArtParams): SceneArtPayload | null {
  if (!turn) return null;

  console.log("sceneArt canonical inputs", {
    latestTurnScene: turn.scene,
    stateLocation: state?.location,
    statePressure: state?.pressure,
    stats: state?.stats,
  });

  const stateRecord = asRecord(state);
  const locationInfo = resolveLocationInfo(stateRecord);
  const timeInfo = resolveTimeInfo(stateRecord);
  const pressureInfo = resolvePressureStage(stateRecord);

  return presentSceneArt({
    title: turn.scene ?? undefined,
    locationId: locationInfo.id,
    locationText: locationInfo.text,
    timeBucket: timeInfo.bucket,
    timeText: timeInfo.text,
    pressureStage: pressureInfo.stage,
    pressureText: pressureInfo.text,
    npcState: presentNpcStateForSceneKey(stateRecord),
    npcCues: presentNpcCuesForPrompt(stateRecord),
    majorTags: presentMajorSceneTags(turn as any, stateRecord),
    appearanceCues: [],
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
  const stage = asString((record as any)?.stage ?? state?.pressureStage) ?? "calm";
  const text = asString((record as any)?.label ?? state?.pressure?.label) ?? stage;
  return { stage: stage.toLowerCase(), text };
}

function readSection(state: Record<string, unknown> | null, key: string): unknown {
  if (!state) return null;
  if (state[key] !== undefined) return state[key];
  const player = asRecord(state.player);
  if (player?.[key] !== undefined) return player[key];
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
