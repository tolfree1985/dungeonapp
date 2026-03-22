import type { SceneArt } from "@prisma/client";
import type { SceneArtIdentity } from "@/lib/sceneArtIdentity";

export function assertStoredSceneArtMatchesIdentity(
  row: Pick<
    SceneArt,
    | "sceneKey"
    | "basePrompt"
    | "renderPrompt"
    | "promptHash"
    | "stylePreset"
    | "renderMode"
    | "engineVersion"
    | "imageUrl"
  >,
  identity: SceneArtIdentity,
): void {
  const mismatches: string[] = [];

  if (row.sceneKey !== identity.sceneKey) mismatches.push("sceneKey");
  if (row.basePrompt !== identity.basePrompt) mismatches.push("basePrompt");
  if (row.renderPrompt !== identity.renderPrompt) mismatches.push("renderPrompt");
  if (row.promptHash !== identity.promptHash) mismatches.push("promptHash");
  if (row.stylePreset !== identity.stylePreset) mismatches.push("stylePreset");
  if ((row.renderMode ?? null) !== identity.renderMode) mismatches.push("renderMode");
  if ((row.engineVersion ?? null) !== identity.engineVersion) mismatches.push("engineVersion");
  if ((row.imageUrl ?? null) !== identity.imageUrl) mismatches.push("imageUrl");

  if (mismatches.length > 0) {
    throw new Error(`SCENE_ART_IDENTITY_MISMATCH:${mismatches.join(",")}`);
  }
}
