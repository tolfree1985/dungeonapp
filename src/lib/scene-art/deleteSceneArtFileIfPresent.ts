import fs from "node:fs/promises";
import { getSceneArtPaths } from "@/lib/scene-art/getSceneArtPaths";

export async function deleteSceneArtFileIfPresent(imageUrl: string): Promise<void> {
  const { absolutePath } = getSceneArtPaths(imageUrl);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = String((error as { code?: unknown }).code);
      if (code === "ENOENT") {
        return;
      }
    }
    throw error;
  }
}
