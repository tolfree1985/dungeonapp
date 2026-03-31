import type { SceneArtStatus } from "@/generated/prisma";
import type { SceneArtPayload } from "@/lib/sceneArt";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { queueSceneArt } from "@/lib/sceneArtRepo";
import type { RenderMode } from "@/lib/sceneArtRepo";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";

export type SceneArtRowLike = {
  sceneKey: string;
  promptHash: string;
  status: SceneArtStatus;
  imageUrl: string | null;
} | null;

export function buildFinalSceneArtContract(row: SceneArtRowLike) {
  if (!row || !row.sceneKey || !row.promptHash) return null;
  return {
    sceneKey: row.sceneKey,
    promptHash: row.promptHash,
    status: row.status,
    imageUrl: row.imageUrl,
  };
}

export async function resolveFinalSceneArtRow(options: {
  existingSceneArt: SceneArtRowLike;
  refreshDecision?: SceneRefreshDecision | null;
  sceneArtPayload: SceneArtPayload | null;
  renderPriority: "low" | "normal" | "high" | "critical";
  renderMode: RenderMode;
  engineVersion?: string | null;
}) {
  const { existingSceneArt, refreshDecision, sceneArtPayload, renderPriority, renderMode, engineVersion } = options;
  if (existingSceneArt) return existingSceneArt;
  if (!sceneArtPayload || !refreshDecision?.shouldQueueRender) return null;
  return queueSceneArt(sceneArtPayload, engineVersion ?? ENGINE_VERSION, renderPriority, renderMode);
}
