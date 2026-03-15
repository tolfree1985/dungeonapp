import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";

export type SceneActorRole = "threat" | "npc" | "companion" | "neutral";

export type SceneActorState = {
  primaryActorId: string | null;
  primaryActorLabel: string | null;
  primaryActorRole: SceneActorRole | null;
  actorVisible: boolean;
};

type Candidate = {
  id: string | null;
  label: string | null;
  role: SceneActorRole;
  priority: number;
  visible: boolean;
};

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LooseRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function candidateFromEntry(entry: unknown, role: SceneActorRole): Candidate | null {
  if (entry === null || entry === undefined) return null;
  const record = asRecord(entry);
  const id = asString(record.id ?? record.key ?? record.label);
  const label = asString(record.label ?? record.name ?? record.labelText) ?? id;
  if (!id && !label) return null;
  if (record.visible === false) return null;
  const priority = typeof record.priority === "number" ? record.priority : 0;
  const visible = record.visible !== false;
  return { id, label, role, priority, visible };
}

function pickActor(candidates: Candidate[]): Candidate | null {
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

export function resolveSceneActorState(args: {
  state: Record<string, unknown> | null;
  subject: SceneSubjectState;
}): SceneActorState {
  const record = asRecord(args.state);
  const subjectKind = args.subject.primarySubjectKind;

  const threatCandidates = ["visibleThreats", "threats", "enemies"].flatMap((key) =>
    (record[key] as unknown[] | undefined) ?? []
  );
  const npcCandidates = ["visibleNpcs", "npcs", "guards"].flatMap((key) =>
    (record[key] as unknown[] | undefined) ?? []
  );
  const companionCandidates = ["companions", "allies"].flatMap((key) =>
    (record[key] as unknown[] | undefined) ?? []
  );

  let candidate: Candidate | null = null;
  if (subjectKind === "threat") {
    candidate = pickActor(threatCandidates.map((entry) => candidateFromEntry(entry, "threat")).filter(Boolean) as Candidate[]);
  }
  if (!candidate && subjectKind === "npc") {
    candidate = pickActor(npcCandidates.map((entry) => candidateFromEntry(entry, "npc")).filter(Boolean) as Candidate[]);
  }
  if (!candidate && subjectKind === "companion") {
    candidate = pickActor(companionCandidates.map((entry) => candidateFromEntry(entry, "companion")).filter(Boolean) as Candidate[]);
  }

  if (!candidate) {
    return {
      primaryActorId: null,
      primaryActorLabel: null,
      primaryActorRole: null,
      actorVisible: false,
    };
  }

  return {
    primaryActorId: candidate.id,
    primaryActorLabel: candidate.label,
    primaryActorRole: candidate.role,
    actorVisible: candidate.visible,
  };
}
