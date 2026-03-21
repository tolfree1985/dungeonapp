import { createHash } from "node:crypto";

export type BuildScenePromptInput = {
  sceneKey: string;
  sceneText?: string | null;
  locationKey?: string | null;
  timeKey?: string | null;
  stylePreset?: string | null;
  engineVersion?: string;
};

export type SceneArtPromptInput = {
  sceneKey: string;
  sceneText: string;
  locationKey: string | null;
  timeKey: string | null;
  stylePreset: string | null;
  engineVersion: string | null;
};

export function buildSceneArtPromptInput({
  sceneKey,
  currentSceneState,
  stylePreset,
  engineVersion,
}: {
  sceneKey: string;
  currentSceneState: {
    text?: string | null;
    locationKey?: string | null;
    timeKey?: string | null;
  } | null;
  stylePreset?: string | null;
  engineVersion?: string | null;
}): SceneArtPromptInput {
  return {
    sceneKey,
    sceneText: currentSceneState?.text ?? "",
    locationKey: currentSceneState?.locationKey ?? null,
    timeKey: currentSceneState?.timeKey ?? null,
    stylePreset: stylePreset ?? null,
    engineVersion: engineVersion ?? null,
  };
}

function normalizeValue(value?: string | null): string | null {
  if (!value) return null;
  return value.trim();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const TIME_KEYWORDS = [
  "dawn",
  "sunrise",
  "morning",
  "noon",
  "afternoon",
  "evening",
  "dusk",
  "night",
  "midnight",
];

function inferTimeKeyFromText(text?: string | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const keyword of TIME_KEYWORDS) {
    if (lower.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

export type ScenePromptResult = {
  basePrompt: string;
  renderPrompt: string;
  promptHash: string;
};

export function buildScenePrompt(input: BuildScenePromptInput): ScenePromptResult {
  const readable = input.sceneKey
    .split(/_|-/)
    .map((part) => titleCase(part))
    .join(" ");
  const locationLabel = titleCase(input.locationKey ?? readable);
  const normalizedTimeKey =
    normalizeValue(input.timeKey) ?? inferTimeKeyFromText(input.sceneText);
  const timeLabel = normalizedTimeKey ? titleCase(normalizedTimeKey) : null;
  const sceneText = normalizeValue(input.sceneText);
  const style = input.stylePreset ?? "victorian-gothic-cinematic";
  let description = locationLabel;
  if (timeLabel) {
    description += ` at ${timeLabel}`;
  }
  if (sceneText) {
    description += `, ${sceneText}`;
  }
  const basePrompt = `${description}, ${style}, cinematic environment, moody lighting, high detail, dark fantasy`;
  const renderPrompt = basePrompt;
  const engineTag = normalizeValue(input.engineVersion) ?? "engine-v1";
  const promptHash = createHash("sha256").update(`${basePrompt}|${engineTag}`).digest("hex");
  return { basePrompt, renderPrompt, promptHash };
}

export function buildPromptHash(basePrompt: string, engineVersion?: string): string {
  const engineTag = normalizeValue(engineVersion) ?? "engine-v1";
  return createHash("sha256").update(`${basePrompt}|${engineTag}`).digest("hex");
}

const STATIC_SCENES: Record<string, string> = {
  dock_office: "/scene-art/dock.jpg",
  castle_hall: "/scene-art/castle.jpg",
};

export type GeneratedImageResult = {
  imageUrl: string;
  provider: "remote" | "static-fallback" | "placeholder";
};

export async function generateImage(
  prompt: string,
  sceneKey?: string,
  promptHash?: string
): Promise<GeneratedImageResult> {
  console.log("GENERATING IMAGE:", prompt);
  const providerUrl = process.env.IMAGE_PROVIDER_URL;
  const authToken = process.env.IMAGE_PROVIDER_AUTH_TOKEN;
  if (providerUrl) {
    try {
      const response = await fetch(providerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          promptHash,
        }),
      });

      if (!response.ok) {
        throw new Error(`Image provider failed: ${response.status}`);
      }

      const data = (await response.json()) as { imageUrl?: string };

      if (typeof data.imageUrl === "string" && data.imageUrl.length > 0) {
        return {
          imageUrl: data.imageUrl,
          provider: "remote",
        };
      }

      throw new Error("Image provider returned no imageUrl");
    } catch (error) {
      console.warn("sceneArt.provider.error", {
        sceneKey,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (sceneKey && STATIC_SCENES[sceneKey]) {
    return {
      imageUrl: STATIC_SCENES[sceneKey],
      provider: "static-fallback",
    };
  }

  return {
    imageUrl: "/scene-art/generated-placeholder.jpg",
    provider: "placeholder",
  };
}
