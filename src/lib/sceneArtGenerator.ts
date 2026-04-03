import { createHash } from "node:crypto";
import type { SceneVisualState } from "@/lib/sceneArt";
import { deriveSceneVisualState } from "@/lib/sceneArt";
import { type SceneArtProviderResponse } from "@/lib/scene-art/providerResponse";

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

export async function generateImage({
  provider,
  prompt,
  sceneKey,
  promptHash,
}: {
  provider?: string | null;
  prompt: string;
  sceneKey?: string;
  promptHash?: string;
}): Promise<SceneArtProviderResponse> {
  console.log("GENERATING IMAGE:", prompt);
  const providerUrl =
    process.env.IMAGE_PROVIDER_URL ??
    (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "") +
      "/api/image-provider";
  const headers = { "content-type": "application/json" };
  const body = JSON.stringify({
    provider,
    sceneKey,
    promptHash,
    prompt,
    size: "1024x1024",
    model: "gpt-image-1",
  });
  const controller = new AbortController();
  const timeoutMs = 90000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const providerLabel = provider ?? "remote";

  try {
    const startedAt = Date.now();
    const hasApiKey = Boolean(process.env.EXTERNAL_IMAGE_PROVIDER_AUTH_TOKEN || process.env.OPENAI_API_KEY);
    console.log("scene.art.provider.fetch.request", {
      provider: providerLabel,
      url: providerUrl,
      hasApiKey,
      method: "POST",
    });
    console.log("scene.art.provider.fetch.start", {
      provider: providerLabel,
      sceneKey,
      promptHash,
    });
    const response = await fetch(providerUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    console.log("scene.art.provider.fetch.response", {
      provider: providerLabel,
      sceneKey,
      promptHash,
      ok: response.ok,
      status: response.status,
      durationMs,
    });
    const bodyText = await response.text();
    console.log("scene.art.provider.fetch.body", {
      provider: providerLabel,
      sceneKey,
      promptHash,
      bodyText,
    });
    if (!response.ok) {
      throw new Error(`IMAGE_PROVIDER_HTTP_${response.status}: ${bodyText}`);
    }
    let providerResponse: SceneArtProviderResponse;
    try {
      providerResponse = JSON.parse(bodyText) as SceneArtProviderResponse;
    } catch (parseError) {
      throw new Error("IMAGE_PROVIDER_INVALID_JSON");
    }
    return {
      ...providerResponse,
      provider: providerResponse.provider ?? providerLabel,
    };
  } catch (error) {
    const errName = error instanceof Error ? error.name : null;
    const errMessage = error instanceof Error ? error.message : String(error);
    const errCause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : null;
    const errStack = error instanceof Error ? error.stack : null;
    console.error("scene.art.provider.fetch.error", {
      provider: providerLabel,
      sceneKey,
      promptHash,
      name: errName,
      message: errMessage,
      cause: errCause,
      stack: errStack,
    });
    return {
      ok: false,
      provider: providerLabel,
      error: errMessage,
      retryable: errMessage === "IMAGE_PROVIDER_TIMEOUT" || errMessage.startsWith("IMAGE_PROVIDER_HTTP_"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
