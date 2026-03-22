import { createHash } from "node:crypto";
import type { SceneVisualState } from "@/lib/sceneArt";
import { deriveSceneVisualState } from "@/lib/sceneArt";

export type BuildScenePromptInput = {
  sceneKey: string;
  visualState: SceneVisualState;
  stylePreset?: string | null;
  engineVersion?: string | null;
};

export type SceneArtPromptInput = {
  sceneKey: string;
  visualState: SceneVisualState;
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
  const visualState = deriveSceneVisualState(sceneKey, currentSceneState?.text ?? null);
  return {
    sceneKey,
    visualState,
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
    .split(/_|\s|-/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type ScenePromptResult = {
  basePrompt: string;
  renderPrompt: string;
  promptHash: string;
};

export function buildScenePrompt(input: BuildScenePromptInput): ScenePromptResult {
  const locationLabel = titleCase(input.visualState.location);
  const timeLabel = titleCase(input.visualState.timeOfDay);
  const style = input.stylePreset ?? "victorian-gothic-cinematic";
  const basePrompt = `${locationLabel} at ${timeLabel}, ${input.visualState.weather}, ${input.visualState.condition}, ${style}, cinematic environment, moody lighting, high detail, dark fantasy`;
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
        sceneKey,
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
