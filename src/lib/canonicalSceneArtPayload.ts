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
  const stats = (stateRecord?.stats as Record<string, unknown>) ?? (state?.stats as Record<string, unknown>) ?? {};

  const locationId = asString(stateRecord?.location ?? stats.location) ?? "Unknown location";
  const locationText = asString(stateRecord?.location ?? stats.location) ?? "Unknown location";

  const timeValue = stateRecord?.time ?? stats.time ?? null;
  const timeBucket = asString((timeValue as Record<string, unknown>)?.bucket ?? timeValue) ?? "unknown-time";
  const timeText = asString((timeValue as Record<string, unknown>)?.label ?? timeValue) ?? "Unknown time";

  const pressureStageValue =
    asString(stateRecord?.pressure ?? stateRecord?.pressureStage ?? stats.pressureStage) ?? "calm";
  const pressureText = asString(stateRecord?.pressure?.label ?? stateRecord?.pressure?.status) ?? pressureStageValue;

  const basePrompt = `${locationId}, ${timeText}, ${pressureStageValue}`;

  return presentSceneArt({
    title: turn.scene ?? undefined,
    locationId,
    locationText,
    timeBucket,
    timeText,
    pressureStage: pressureStageValue,
    pressureText,
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

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
