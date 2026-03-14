import type { PlayTurn } from "@/app/play/types";
import {
  DEFAULT_STYLE_PRESET,
  buildBaseScenePrompt,
  buildRenderScenePrompt,
  buildSceneKey,
  type SceneArtPayload,
  type STYLE_PRESETS,
} from "@/lib/sceneArt";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";

export type PresentSceneArtInput = {
  title?: string;
  stylePreset?: keyof typeof STYLE_PRESETS;
  visualState: SceneVisualState;
  visualTags?: string[];
  npcState?: string[];
  npcCues?: string[];
  majorTags?: string[];
  framingState: SceneFramingState;
  subjectState: SceneSubjectState;
  actorState: SceneActorState;
};

export function presentSceneArt(input: PresentSceneArtInput): SceneArtPayload {
  const stylePreset = input.stylePreset ?? DEFAULT_STYLE_PRESET;
  const visualTags = [...(input.visualTags ?? [])];
  const npcState = input.npcState ?? [];
  const majorTags = input.majorTags ?? [];

  const locationId = input.visualState.locationId;
  const pressureStage = input.visualState.pressureStage;
  const timeText = input.visualState.timeValue;
  const timeBucket = input.visualState.timeValue;
  const framing = input.framingState;
  const subject = input.subjectState;

  const sceneKey = buildSceneKey({
    locationId,
    timeBucket,
    pressureStage,
    npcState,
    majorTags,
  });

  const basePrompt = buildBaseScenePrompt({
    locationText: locationId,
    timeText,
    pressureText: pressureStage,
    eventTags: majorTags,
    npcCues: input.npcCues ?? [],
  });

  const subjectText = subject.primarySubjectLabel
    ? `${subject.primarySubjectKind} ${subject.primarySubjectLabel}`
    : subject.primarySubjectKind;
  const actor = input.actorState;
  const actorLabel = actor.actorVisible && actor.primaryActorLabel ? actor.primaryActorLabel : null;
  const renderPrompt = buildRenderScenePrompt({
    basePrompt,
    stylePreset,
    appearanceCues: [
      ...visualTags,
      `framing ${framing.frameKind}`,
      `shot ${framing.shotScale}`,
      `focus ${framing.subjectFocus}`,
      `angle ${framing.cameraAngle}`,
      `subject ${subjectText}`,
      actorLabel ? `actor ${actorLabel}` : null,
    ]
      .filter(Boolean)
      .map((tag) => tag.replace(":", " ")),
  });

  visualTags.push(`framing:${framing.frameKind}`);
  visualTags.push(`shot:${framing.shotScale}`);
  visualTags.push(`focus:${framing.subjectFocus}`);
  visualTags.push(`angle:${framing.cameraAngle}`);
  visualTags.push(`subject:${subject.primarySubjectKind}`);
  if (subject.primarySubjectLabel) {
    visualTags.push(`subject-label:${subject.primarySubjectLabel}`);
  }
  if (actor.actorVisible && actor.primaryActorRole) {
    visualTags.push(`actor-role:${actor.primaryActorRole}`);
  }
  if (actor.actorVisible && actor.primaryActorLabel) {
    visualTags.push(`actor-label:${actor.primaryActorLabel}`);
  }
  const tags = Array.from(new Set([...majorTags, ...visualTags]));

  return {
    sceneKey,
    title: input.title,
    basePrompt,
    renderPrompt,
    stylePreset,
    tags,
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
