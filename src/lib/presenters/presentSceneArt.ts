import type { PlayTurn } from "@/app/play/types";
import {
  DEFAULT_STYLE_PRESET,
  STYLE_PRESETS,
  buildBaseScenePrompt,
  buildRenderScenePrompt,
  buildSceneKey,
  type CanonicalSceneIdentity,
  type CanonicalScenePromptMetadata,
  type SceneArtPayload,
} from "@/lib/sceneArt";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { ScenePromptFraming } from "@/lib/resolveScenePromptFraming";
import type { SceneShotIntent } from "@/lib/sceneTypes";
import type { SceneDirectorDecision } from "@/lib/resolveSceneDirectorDecision";

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
  focusState: SceneFocusState;
  shotIntent?: SceneShotIntent;
  scenePromptFraming?: ScenePromptFraming | null;
  motifTags?: string[];
  revealStructureTags?: string[];
  directorDecision?: SceneDirectorDecision | null;
};

export function presentSceneArt(input: PresentSceneArtInput): SceneArtPayload {
  const stylePreset = input.stylePreset ?? DEFAULT_STYLE_PRESET;
  const promptFraming = input.scenePromptFraming;
  const motifTags = input.motifTags ?? [];
  const visualTags = [...motifTags, ...(input.visualTags ?? [])];
  const promptCompositionNotes = promptFraming?.compositionNotes ?? [];
  if (promptFraming?.visualTags?.length) {
    visualTags.push(...promptFraming.visualTags);
  }
  if (promptCompositionNotes.length) {
    visualTags.push(...promptCompositionNotes);
  }
  const npcState = input.npcState ?? [];
  const majorTags = [...(input.majorTags ?? [])];
  if (input.motifTags?.length) {
    majorTags.push(...input.motifTags);
  }
  if (input.threatFramingTags?.length) {
    majorTags.push(...input.threatFramingTags);
  }
  if (input.revealStructureTags?.length) {
    majorTags.push(...input.revealStructureTags);
  }
  const focusState = input.focusState;

  const focusLabelRaw = focusState.focusLabel ?? focusState.focusId ?? focusState.focusType;
  if (focusLabelRaw) {
    majorTags.push(`focus-${normalizeToken(focusLabelRaw)}`);
  }

  const locationId = input.visualState.locationId;
  const pressureStage = input.visualState.pressureStage;
  const timeText = input.visualState.timeValue;
  const framing = input.framingState;
  const subject = input.subjectState;

  const actor = input.actorState;
  const identity: CanonicalSceneIdentity = {
    locationId: locationId ?? null,
    pressureStage: pressureStage ?? null,
    lightingState: input.visualState.lightingState ?? null,
    atmosphereState: input.visualState.atmosphereState ?? null,
    environmentWear: input.visualState.environmentWear ?? null,
    threatPresence: input.visualState.threatPresence ?? null,
    frameKind: framing.frameKind ?? null,
    shotScale: framing.shotScale ?? null,
    subjectFocus: framing.subjectFocus ?? null,
    cameraAngle: framing.cameraAngle ?? null,
    primarySubjectKind: subject.primarySubjectKind ?? null,
    primarySubjectId: subject.primarySubjectId ?? null,
    actorVisible: actor.actorVisible,
    primaryActorId: actor.primaryActorId ?? null,
  };
  const sceneKey = buildSceneKey(identity);

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
  const actorLabel = actor.actorVisible && actor.primaryActorLabel ? actor.primaryActorLabel : null;
  if (focusLabelRaw) {
    visualTags.push(`focus:${focusLabelRaw}`);
  }

  const shotIntent = input.shotIntent ?? "observe";
  const focusLabel = focusLabelRaw ?? focusState.focusType;
  const cameraGrammarParts = [
    `camera ${framing.frameKind}`,
    `shot ${framing.shotScale}`,
    focusLabel ? `focus ${focusLabel}` : null,
    `angle ${framing.cameraAngle}`,
    `intent ${shotIntent}`,
  ].filter(Boolean);

  const environmentDetails = [
    `wear ${input.visualState.environmentWear}`,
    `threat ${input.visualState.threatPresence}`,
    ...majorTags,
    ...promptCompositionNotes,
    ...(input.npcCues ?? []).map((cue) => `npc ${cue}`),
    actorLabel ? `actor ${actorLabel}` : null,
  ].filter(Boolean);

  const renderPromptSegments = [
    locationId,
    `${timeText} ${pressureStage}`,
    `subject ${subjectText}`,
    cameraGrammarParts.join(", "),
    `lighting ${input.visualState.lightingState}`,
    `atmosphere ${input.visualState.atmosphereState}`,
    environmentDetails.length ? `environment ${environmentDetails.join(", ")}` : null,
    STYLE_PRESETS[stylePreset],
  ];

  const renderPrompt = buildRenderScenePrompt({ segments: renderPromptSegments });

  visualTags.push(`framing:${framing.frameKind}`);
  visualTags.push(`shot:${framing.shotScale}`);
  visualTags.push(`focus:${framing.subjectFocus}`);
  visualTags.push(`angle:${framing.cameraAngle}`);
  visualTags.push(`subject:${subject.primarySubjectKind}`);
  visualTags.push(`focus-label:${focusLabel}`);
  if (subject.primarySubjectLabel) {
    visualTags.push(`subject-label:${subject.primarySubjectLabel}`);
  }
  if (actor.actorVisible && actor.primaryActorRole) {
    visualTags.push(`actor-role:${actor.primaryActorRole}`);
  }
  if (actor.actorVisible && actor.primaryActorLabel) {
    visualTags.push(`actor-label:${actor.primaryActorLabel}`);
  }
  visualTags.push(`intent:${shotIntent}`);
  const tags = Array.from(new Set([...majorTags, ...visualTags]));

  return {
    sceneKey,
    identity,
    promptMetadata: {
      latestTurnScene: input.title ?? "",
      timeValue: input.visualState.timeValue ?? null,
      directorDecision: {
        emphasis: input.directorDecision?.emphasis ?? null,
        compositionBias: input.directorDecision?.compositionBias ?? null,
      },
    },
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
