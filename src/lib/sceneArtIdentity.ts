import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";
import type { SceneArtPromptInput } from "@/lib/sceneArtGenerator";

export type SceneArtIdentityInput = {
  sceneKey: string;
  sceneText?: string | null;
  locationKey?: string | null;
  timeKey?: string | null;
  stylePreset?: string | null;
  engineVersion?: string | null;
};

export type SceneArtIdentity = {
  promptInput: SceneArtPromptInput;
  prompt: ReturnType<typeof buildScenePrompt>;
  promptHash: string;
  fileName: string;
  imageUrl: string;
};

export function getSceneArtIdentity(input: SceneArtIdentityInput): SceneArtIdentity {
  const promptInput = buildSceneArtPromptInput({
    sceneKey: input.sceneKey,
    currentSceneState: {
      text: input.sceneText ?? null,
      locationKey: input.locationKey ?? null,
      timeKey: input.timeKey ?? null,
    },
    stylePreset: input.stylePreset ?? null,
    engineVersion: input.engineVersion ?? null,
  });
  const prompt = buildScenePrompt(promptInput);
  const promptHash = prompt.promptHash;
  const fileName = `${input.sceneKey}-${promptHash}.png`;
  const imageUrl = `/scene-art/${fileName}`;
  return { promptInput, prompt, promptHash, fileName, imageUrl };
}
