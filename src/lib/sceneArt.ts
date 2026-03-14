import { createHash } from "node:crypto";

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

export type SceneArtPayload = {
  sceneKey: string;
  title?: string;
  basePrompt: string;
  renderPrompt: string;
  stylePreset: keyof typeof STYLE_PRESETS;
  tags: string[];
};

export type ResolvedSceneImage = {
  imageUrl: string | null;
  source: "scene" | "previous" | "location" | "default";
  pending: boolean;
};

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeList(values: string[], cap?: number): string[] {
  const normalized = [...new Set(values.map(normalizeToken).filter(Boolean))].sort();
  return typeof cap === "number" ? normalized.slice(0, cap) : normalized;
}

export function buildSceneKey(input: {
  locationId: string;
  timeBucket: string;
  pressureStage: string;
  npcState: string[];
  majorTags: string[];
}): string {
  const canonical = {
    locationId: normalizeToken(input.locationId),
    timeBucket: normalizeToken(input.timeBucket),
    pressureStage: normalizeToken(input.pressureStage),
    npcState: normalizeList(input.npcState),
    majorTags: normalizeList(input.majorTags, 6),
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

export function buildRenderScenePrompt(input: {
  basePrompt: string;
  stylePreset: keyof typeof STYLE_PRESETS;
  appearanceCues?: string[];
}): string {
  return [
    input.basePrompt,
    ...(input.appearanceCues ?? []),
    STYLE_PRESETS[input.stylePreset],
  ]
    .filter(Boolean)
    .join(", ");
}

export function resolveDisplayedSceneImage(input: {
  currentSceneImageUrl: string | null;
  currentScenePending: boolean;
  previousSceneImageUrl: string | null;
  locationBackdropUrl: string | null;
  defaultImageUrl: string;
}): ResolvedSceneImage {
  if (input.currentSceneImageUrl) {
    return {
      imageUrl: input.currentSceneImageUrl,
      source: "scene",
      pending: false,
    };
  }

  if (input.previousSceneImageUrl) {
    return {
      imageUrl: input.previousSceneImageUrl,
      source: "previous",
      pending: input.currentScenePending,
    };
  }

  if (input.locationBackdropUrl) {
    return {
      imageUrl: input.locationBackdropUrl,
      source: "location",
      pending: input.currentScenePending,
    };
  }

  return {
    imageUrl: input.defaultImageUrl,
    source: "default",
    pending: input.currentScenePending,
  };
}
