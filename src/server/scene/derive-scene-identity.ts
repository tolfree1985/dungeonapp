import type { EncounterPhase, SceneIdentity } from "./scene-identity";

type LooseRecord = Record<string, unknown> | null;

function asRecord(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function extractString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") {
    return normalizeString(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = extractString(entry);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = ["id", "key", "name", "label", "title", "actor", "objective", "subject"];
    for (const field of fields) {
      const candidate = extractString(record[field]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
}

function pickFirst(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = extractString(value);
    if (candidate) return candidate;
  }
  return null;
}

function normalizeEncounterPhase(value: unknown): EncounterPhase {
  const normalized = normalizeString(value)?.toLowerCase();
  switch (normalized) {
    case "arrival":
      return "arrival";
    case "investigation":
    case "getting-in":
    case "exploration":
      return "investigation";
    case "conversation":
    case "dialogue":
    case "talk":
      return "conversation";
    case "conflict":
    case "combat":
    case "danger":
    case "threat":
      return "conflict";
    case "aftermath":
    case "aftermath":
    case "resolve":
      return "aftermath";
    default:
      return "investigation";
  }
}

function extractLocationKey(state: LooseRecord): string {
  const sceneRecord = asRecord(state?.scene);
  const world = asRecord(state?.world);
  const stats = asRecord(state?.stats);
  const locationKey =
    pickFirst(
      sceneRecord?.locationKey,
      sceneRecord?.location,
      sceneRecord?.location?.key,
      state?.location,
      state?.location?.key,
      world?.locationId,
      stats?.location,
      stats?.area,
      state?.place,
    ) ?? "unknown";
  return locationKey;
}

function extractFocalActorKey(state: LooseRecord): string | null {
  const sceneRecord = asRecord(state?.scene);
  const focus = asRecord(state?.focus);
  const subject = asRecord(state?.subject);
  const actors = [state?.visibleThreats, state?.threats, state?.visibleNpcs, state?.npcs, state?.actors];
  return (
    pickFirst(
      sceneRecord?.focalActorKey,
      focus?.actorId,
      subject?.actorId,
      sceneRecord?.actorId,
      sceneRecord?.actor,
      state?.actor,
      ...actors,
    ) ?? null
  );
}

function extractObjectiveKey(state: LooseRecord): string | null {
  const sceneRecord = asRecord(state?.scene);
  const quests = Array.isArray(state?.quests) ? state?.quests : state?.quests?.value;
  const objectiveFromQuests = pickFirst(quests?.[0], sceneRecord?.objectiveKey, sceneRecord?.objective);
  return (
    pickFirst(
      sceneRecord?.objectiveKey,
      sceneRecord?.objective,
      state?.objective,
      state?.goal,
      state?.intent,
      objectiveFromQuests,
    ) ?? null
  );
}

function extractEncounterPhase(state: LooseRecord): EncounterPhase {
  const sceneRecord = asRecord(state?.scene);
  return normalizeEncounterPhase(
    sceneRecord?.encounterPhase ?? state?.phase ?? state?.stage ?? state?.status ?? state?.scenePhase,
  );
}

export function deriveSceneIdentityFromTurnState(state: Record<string, unknown> | null): SceneIdentity {
  const normalizedState = state ?? null;
  return {
    locationKey: extractLocationKey(normalizedState),
    focalActorKey: extractFocalActorKey(normalizedState),
    objectiveKey: extractObjectiveKey(normalizedState),
    encounterPhase: extractEncounterPhase(normalizedState),
  };
}
