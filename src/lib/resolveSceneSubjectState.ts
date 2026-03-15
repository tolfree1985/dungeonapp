import type { SceneFramingState } from "@/lib/resolveSceneFramingState";

export type SceneSubjectKind = "environment" | "clue" | "threat" | "path" | "detail";

export type SceneSubjectState = {
  primarySubjectKind: SceneSubjectKind;
  primarySubjectId: string | null;
  primarySubjectLabel: string | null;
};

type Candidate = {
  kind: SceneSubjectKind;
  id: string | null;
  label: string | null;
  priority: number;
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

function normalizeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function candidateFromEntry(entry: unknown, kind: SceneSubjectKind): Candidate | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === "string") {
    return { kind, id: entry, label: entry, priority: 0 };
  }
  if (typeof entry === "object") {
    const record = entry as LooseRecord;
    const label =
      asString(record.label ?? record.name ?? record.description ?? record.summary ?? record.title) ??
      asString(record.id ?? record.key);
    const id = normalizeId(record.id ?? record.key ?? record.name ?? label);
    const priority = typeof record.priority === "number" ? record.priority : typeof record.rank === "number" ? record.rank : 0;
    if (!label && !id) return null;
    if (record.visible === false || record.hidden === true) return null;
    return { kind, id, label, priority };
  }
  return null;
}

function readCandidates(state: LooseRecord, keys: string[], kind: SceneSubjectKind): Candidate[] {
  const candidates: Candidate[] = [];
  for (const key of keys) {
    const value = state[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const candidate = candidateFromEntry(entry, kind);
        if (candidate) candidates.push(candidate);
      }
    } else {
      const candidate = candidateFromEntry(value, kind);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function pickCandidate(candidates: Candidate[]): Candidate | null {
  if (!candidates.length) return null;
  return candidates
    .slice()
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.label && b.label) return a.label.localeCompare(b.label);
      if (a.label) return -1;
      if (b.label) return 1;
      return 0;
    })[0];
}

export function resolveSceneSubjectState(args: {
  state: Record<string, unknown> | null;
  framing: SceneFramingState;
}): SceneSubjectState {
  const { state, framing } = args;
  const record = asRecord(state);
  const locationId = asString(record.location) ?? "environment";
  const locationLabel = asString(record.location) ?? "environment";

  const focus = framing.subjectFocus;
  let candidate: Candidate | null = null;

  if (focus === "clue") {
    candidate = pickCandidate(readCandidates(record, ["visibleClues", "clues", "discoveries"], "clue"));
  } else if (focus === "threat") {
    candidate = pickCandidate(
      readCandidates(record, ["visibleThreats", "threats", "guards", "enemies"], "threat")
    );
  } else if (focus === "path") {
    candidate = pickCandidate(readCandidates(record, ["visiblePaths", "paths", "exits"], "path"));
  } else if (focus === "detail") {
    candidate = pickCandidate(readCandidates(record, ["visibleDetails", "details", "features"], "detail"));
  }

  if (!candidate) {
    candidate = { kind: "environment", id: locationId, label: locationLabel, priority: 0 };
  }

  return {
    primarySubjectKind: candidate.kind,
    primarySubjectId: candidate.id,
    primarySubjectLabel: candidate.label ?? candidate.id,
  };
}
