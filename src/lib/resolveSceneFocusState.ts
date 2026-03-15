import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";

export type SceneFocusType = "object" | "actor" | "path" | "environment";

export type SceneFocusState = {
  focusType: SceneFocusType;
  focusId: string | null;
  focusLabel: string | null;
};

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LooseRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function pickVisibleEntry(keys: string[], record: LooseRecord): { id: string | null; label: string | null } | null {
  for (const key of keys) {
    const value = record[key];
    if (!value) continue;
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      const candidate = normalizeEntry(entry);
      if (candidate) return candidate;
    }
  }
  return null;
}

function normalizeEntry(entry: unknown): { id: string | null; label: string | null } | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === "string") {
    const text = entry.trim();
    if (!text) return null;
    return { id: text.toLowerCase().replace(/\s+/g, "-"), label: text };
  }
  if (typeof entry === "object") {
    const record = entry as LooseRecord;
    if (record.visible === false || record.hidden === true) return null;
    const label = asString(record.label ?? record.name ?? record.description ?? record.title ?? record.key ?? record.id);
    const id = asString(record.id ?? record.key ?? label);
    if (!label && !id) return null;
    return { id, label: label ?? id };
  }
  return null;
}

export function resolveSceneFocusState(args: {
  state: Record<string, unknown> | null;
  framing: SceneFramingState;
  subject: SceneSubjectState;
  actor: SceneActorState;
}): SceneFocusState {
  const { state, subject, actor } = args;
  const record = asRecord(state);

  // threat focus prefers actor
  if (subject.primarySubjectKind === "threat" && actor.actorVisible && actor.primaryActorLabel) {
    return {
      focusType: "actor",
      focusId: actor.primaryActorId ?? null,
      focusLabel: actor.primaryActorLabel,
    };
  }

  // clue focus prefers visible clue
  if (subject.primarySubjectKind === "clue") {
    const candidate = pickVisibleEntry(["visibleClues", "clues", "discoveries"], record);
    if (candidate?.label) {
      return { focusType: "object", focusId: candidate.id, focusLabel: candidate.label };
    }
  }

  // path focus uses exit
  if (subject.primarySubjectKind === "path") {
    const candidate = pickVisibleEntry(["visiblePaths", "paths", "exits"], record);
    if (candidate?.label) {
      return { focusType: "path", focusId: candidate.id, focusLabel: candidate.label };
    }
  }

  // detail focus picks feature
  if (subject.primarySubjectKind === "detail") {
    const candidate = pickVisibleEntry(["visibleDetails", "details", "features"], record);
    if (candidate?.label) {
      return { focusType: "object", focusId: candidate.id, focusLabel: candidate.label };
    }
  }

  // environment fallback tries detail-like anchors
  const environmentAnchor = pickVisibleEntry(["visibleDetails", "details", "features", "contexts"], record);
  if (environmentAnchor?.label) {
    return { focusType: "object", focusId: environmentAnchor.id, focusLabel: environmentAnchor.label };
  }

  const locationLabel = asString(record.location) ?? asString(record.name) ?? "environment";
  return {
    focusType: "environment",
    focusId: locationLabel ? locationLabel.toLowerCase().replace(/\s+/g, "-") : null,
    focusLabel: locationLabel,
  };
}
