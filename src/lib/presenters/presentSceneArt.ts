import type { PlayTurn } from "@/app/play/types";
import {
  DEFAULT_STYLE_PRESET,
  buildBaseScenePrompt,
  buildRenderScenePrompt,
  buildSceneKey,
  type SceneArtPayload,
  type STYLE_PRESETS,
} from "@/lib/sceneArt";

type PresentSceneArtArgs = {
  title?: string;
  stylePreset?: keyof typeof STYLE_PRESETS;

  locationId: string;
  locationText: string;

  timeBucket: string;
  timeText: string;

  pressureStage: string;
  pressureText: string;

  npcState: string[];
  npcCues: string[];
  majorTags: string[];

  appearanceCues?: string[];
};

export function presentSceneArt(args: PresentSceneArtArgs): SceneArtPayload {
  const stylePreset = args.stylePreset ?? DEFAULT_STYLE_PRESET;

  const sceneKey = buildSceneKey({
    locationId: args.locationId,
    timeBucket: args.timeBucket,
    pressureStage: args.pressureStage,
    npcState: args.npcState,
    majorTags: args.majorTags,
  });

  const basePrompt = buildBaseScenePrompt({
    locationText: args.locationText,
    timeText: args.timeText,
    pressureText: args.pressureText,
    eventTags: args.majorTags,
    npcCues: args.npcCues,
  });

  const renderPrompt = buildRenderScenePrompt({
    basePrompt,
    stylePreset,
    appearanceCues: args.appearanceCues,
  });

  return {
    sceneKey,
    title: args.title,
    basePrompt,
    renderPrompt,
    stylePreset,
    tags: args.majorTags,
  };
}

export function presentNpcStateForSceneKey(state: unknown): string[] {
  const normalized = extractNpcs(state)
    .filter((npc) => Boolean(getBooleanFlag(npc?.present ?? npc?.isPresent)))
    .map((npc) => normalizeToken(String(npc?.id ?? npc?.name ?? npc?.label ?? "npc")) + "-present");
  return [...new Set(normalized)];
}

export function presentNpcCuesForPrompt(state: unknown): string[] {
  return extractNpcs(state)
    .filter((npc) => Boolean(getBooleanFlag(npc?.present ?? npc?.isPresent)))
    .slice(0, 3)
    .map((npc) => {
      const label = npc?.label ?? npc?.name ?? npc?.role ?? "figure";
      return `${String(label).trim()} nearby`;
    });
}

export function presentMajorSceneTags(turn: PlayTurn | null, state: unknown): string[] {
  const tags = new Set<string>();
  const pressureStage = extractPressureStage(state) ?? "calm";
  if (pressureStage === "danger") tags.add("threat");
  if (pressureStage === "crisis") tags.add("confrontation");
  if (pressureStage === "tension") tags.add("search");

  const npcs = extractNpcs(state);
  if (npcs.some((npc) => Boolean(getBooleanFlag(npc?.present ?? npc?.isPresent)))) {
    tags.add("npc");
  }

  if (turn?.resolutionJson) {
    const tier = asString(turn.resolutionJson?.tier ?? turn.resolutionJson?.band);
    if (tier?.toLowerCase().includes("fail-forward")) {
      tags.add("setback");
    }
    if (tier?.toLowerCase().includes("success with cost")) {
      tags.add("costly-success");
    }
  }

  return Array.from(tags).sort().slice(0, 6);
}

function extractNpcs(state: unknown): Array<Record<string, unknown>> {
  const record = asRecord(state);
  if (!record) return [];
  const candidates: unknown[] = [];
  if (Array.isArray(record.npcs)) candidates.push(...record.npcs);
  if (Array.isArray(record.characters)) candidates.push(...record.characters);
  if (Array.isArray(record.actors)) candidates.push(...record.actors);
  return candidates
    .map((entry) => (typeof entry === "object" && entry ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function extractPressureStage(state: unknown): string | null {
  const record = asRecord(state);
  const stage = record?.pressure?.stage ?? record?.pressureStage;
  if (typeof stage === "string" && stage.trim()) return stage.trim().toLowerCase();
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}
