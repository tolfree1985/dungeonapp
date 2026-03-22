import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";
import type { SceneArtPromptInput, ScenePromptResult } from "@/lib/sceneArtGenerator";

export type SceneArtIdentityInput = {
  sceneKey: string;
  sceneText?: string | null;
  stylePreset?: string | null;
  renderMode?: "full" | "partial" | null;
  engineVersion?: string | null;
};

export type SceneArtIdentity = {
  sceneKey: string;
  sceneText: string | null;
  stylePreset: string;
  renderMode: "full" | "partial";
  engineVersion: string | null;
  promptInput: SceneArtPromptInput;
  prompt: ScenePromptResult;
  basePrompt: string;
  renderPrompt: string;
  promptHash: string;
  fileName: string;
  imageUrl: string;
};

export function getSceneArtIdentity(input: SceneArtIdentityInput): SceneArtIdentity {
  const resolvedStyle = input.stylePreset ?? "victorian-gothic-cinematic";
  const resolvedRenderMode = input.renderMode ?? "full";
  const promptInput = buildSceneArtPromptInput({
    sceneKey: input.sceneKey,
    currentSceneState: {
      text: input.sceneText ?? null,
    },
    stylePreset: resolvedStyle,
    engineVersion: input.engineVersion ?? null,
  });
  const prompt = buildScenePrompt({
    sceneKey: promptInput.sceneKey,
    visualState: promptInput.visualState,
    stylePreset: promptInput.stylePreset,
    engineVersion: promptInput.engineVersion,
  });
  const basePrompt = prompt.basePrompt;
  const renderPrompt = prompt.renderPrompt;
  const promptHash = prompt.promptHash;
  const fileName = `${promptInput.sceneKey}-${promptHash}.png`;
  const imageUrl = `/scene-art/${fileName}`;

  return {
    sceneKey: promptInput.sceneKey,
    sceneText: input.sceneText ?? null,
    stylePreset: resolvedStyle,
    renderMode: resolvedRenderMode,
    engineVersion: promptInput.engineVersion,
    promptInput,
    prompt,
    basePrompt,
    renderPrompt,
    promptHash,
    fileName,
    imageUrl,
  };
}
