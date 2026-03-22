import fs from "node:fs/promises";
import path from "node:path";
import { getSceneArtPaths } from "./getSceneArtPaths";

export async function ensureParentDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function assertSceneArtFileExists(filePath: string) {
  try {
    await fs.access(filePath);
  } catch (error) {
    throw new Error("SCENE_ART_FILE_MISSING_AFTER_GENERATION");
  }
}

export async function sceneArtFileExists(imageUrl: string): Promise<boolean> {
  const { absolutePath } = getSceneArtPaths(imageUrl);
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSceneArtFile(imageUrl: string, buffer: Buffer) {
  const { absolutePath } = getSceneArtPaths(imageUrl);
  await ensureParentDirExists(absolutePath);
  await fs.writeFile(absolutePath, buffer);
  await assertSceneArtFileExists(absolutePath);
}
