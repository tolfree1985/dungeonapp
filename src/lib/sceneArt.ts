import { createHash } from "node:crypto";
import type { SceneArtStatus } from "@/lib/sceneArtStatus";

export const DEFAULT_STYLE_PRESET = "victorian-gothic-cinematic" as const;

export const STYLE_PRESETS = {
  "victorian-gothic-cinematic":
    "Victorian gothic interior environment art, cinematic dark fantasy matte painting, restrained realism, desaturated palette, moody volumetric lighting, atmospheric dust, subtle texture, high environmental detail, no text, no UI",
  "epic-fantasy-illustration":
    "epic fantasy environment illustration, painterly style, rich colors, dramatic lighting, high detail, no text, no UI",
  "cinematic-sci-fi-concept":
    "cinematic science fiction environment concept art, futuristic lighting, metallic surfaces, cool color palette, high detail, no text, no UI",
} as const;

export const SCENE_ART_HIGH_VALUE_TAGS = [
  "npc",
  "threat",
  "confrontation",
  "discovery",
  "search",
] as const;

export type CanonicalSceneIdentity = {
  locationId: string | null;
  pressureStage: string | null;
  lightingState: string | null;
  atmosphereState: string | null;
  environmentWear: string | null;
  threatPresence: string | null;

  frameKind: string | null;
  shotScale: string | null;
  subjectFocus: string | null;
  cameraAngle: string | null;

  primarySubjectKind: string | null;
  primarySubjectId: string | null;

  actorVisible: boolean;
  primaryActorId: string | null;
};

export type CanonicalScenePromptMetadata = {
  latestTurnScene: string;
  timeValue: string | null;
  directorDecision: {
    emphasis: string | null;
    compositionBias: string | null;
  };
};

export type SceneArtPayload = {
  sceneKey: string;
  identity: CanonicalSceneIdentity;
  promptMetadata: CanonicalScenePromptMetadata;
  title?: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: keyof typeof STYLE_PRESETS;
  tags: string[];
};

export type SceneVisualState = {
  location: string;
  timeOfDay: "dawn" | "day" | "dusk" | "night";
  weather: "clear" | "fog" | "rain" | "storm";
  condition: "intact" | "worn" | "damaged";
};

const TIME_OF_DAY_KEYWORDS: Record<SceneVisualState["timeOfDay"], string[]> = {
  dawn: ["dawn", "sunrise"],
  day: ["morning", "noon", "afternoon"],
  dusk: ["dusk", "evening", "twilight"],
  night: ["night", "midnight"],
};

function inferTimeOfDay(text?: string | null): SceneVisualState["timeOfDay"] {
  if (!text) return "day";
  const lower = text.toLowerCase();
  for (const [label, keywords] of Object.entries(TIME_OF_DAY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return label as SceneVisualState["timeOfDay"];
      }
    }
  }
  return "day";
}

export function deriveSceneVisualState(sceneKey: string, sceneText?: string | null): SceneVisualState {
  return {
    location: sceneKey,
    timeOfDay: inferTimeOfDay(sceneText),
    weather: "clear",
    condition: "intact",
  };
}

export type SceneArtLifecycleStatus = "missing" | "generating" | "ready" | "failed";

export type ResolvedSceneImage = {
  imageUrl: string | null;
  source: "scene" | "previous" | "location" | "default";
  pending: boolean;
  sceneKey: string | null;
  status: SceneArtStatus;
  sceneArtStatus?: SceneArtLifecycleStatus;
  provider?: "remote" | "fallback" | "none";
  promptHash?: string | null;
};

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function buildSceneKey(identity: CanonicalSceneIdentity): string {
  const canonical = {
    locationId: normalizeToken(identity.locationId ?? ""),
    pressureStage: normalizeToken(identity.pressureStage ?? ""),
    lightingState: normalizeToken(identity.lightingState ?? ""),
    atmosphereState: normalizeToken(identity.atmosphereState ?? ""),
    environmentWear: normalizeToken(identity.environmentWear ?? ""),
    threatPresence: normalizeToken(identity.threatPresence ?? ""),
    frameKind: normalizeToken(identity.frameKind ?? ""),
    shotScale: normalizeToken(identity.shotScale ?? ""),
    subjectFocus: normalizeToken(identity.subjectFocus ?? ""),
    cameraAngle: normalizeToken(identity.cameraAngle ?? ""),
    primarySubjectKind: normalizeToken(identity.primarySubjectKind ?? ""),
    primarySubjectId: normalizeToken(identity.primarySubjectId ?? ""),
    actorVisible: identity.actorVisible ? "true" : "false",
    primaryActorId: normalizeToken(identity.primaryActorId ?? ""),
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function buildBaseScenePrompt(input: {
  locationText: string;
  timeText: string;
  pressureText: string;
  eventTags: string[];
  npcCues: string[];
}): string {
  return [
    input.locationText,
    input.timeText,
    input.pressureText,
    ...input.eventTags,
    ...input.npcCues,
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildRenderScenePrompt(input: { segments: Array<string | null | undefined> }): string {
  return input.segments.filter(Boolean).join("\n");
}

export function resolveDisplayedSceneImage(input: {
  sceneKey: string | null;
  currentSceneImageUrl: string | null;
  currentScenePending: boolean;
  previousSceneImageUrl: string | null;
  locationBackdropUrl: string | null;
  defaultImageUrl: string;
  sceneStatus: SceneArtStatus;
}): ResolvedSceneImage {
  if (input.currentSceneImageUrl) {
    return {
      imageUrl: input.currentSceneImageUrl,
      source: "scene",
      pending: false,
      sceneKey: input.sceneKey,
      status: "ready",
    };
  }

  if (input.previousSceneImageUrl) {
    return {
      imageUrl: input.previousSceneImageUrl,
      source: "previous",
      pending: input.currentScenePending,
      sceneKey: input.sceneKey,
      status: input.sceneStatus,
    };
  }

  if (input.locationBackdropUrl) {
    return {
      imageUrl: input.locationBackdropUrl,
      source: "location",
      pending: input.currentScenePending,
      sceneKey: input.sceneKey,
      status: input.sceneStatus,
    };
  }

  return {
    imageUrl: input.defaultImageUrl,
    source: "default",
    pending: input.currentScenePending,
    sceneKey: input.sceneKey,
    status: input.sceneStatus,
  };
}
