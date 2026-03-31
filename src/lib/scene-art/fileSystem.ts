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

function extensionFromMimeType(mimeType?: string | null): "png" | "jpg" | "webp" {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

type PersistSceneArtArtifactArgs = {
  sceneKey: string;
  promptHash: string;
  mimeType?: string | null;
  imageBase64?: string | null;
  remoteUrl?: string | null;
};

export async function persistSceneArtArtifact({
  sceneKey,
  promptHash,
  mimeType,
  imageBase64,
  remoteUrl,
}: PersistSceneArtArtifactArgs): Promise<string> {
  const ext = extensionFromMimeType(mimeType);
  const fileName = `${sceneKey}-${promptHash}.${ext}`;
  const outputDir = path.join(process.cwd(), "public", "scene-art");
  const outputPath = path.join(outputDir, fileName);

  await ensureParentDirExists(outputPath);

  if (imageBase64) {
    const buffer = Buffer.from(imageBase64, "base64");
    await fs.writeFile(outputPath, buffer);
    return `/scene-art/${fileName}`;
  }

  if (remoteUrl) {
    if (remoteUrl.startsWith("/scene-art/")) {
      return remoteUrl;
    }
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      throw new Error(`scene-art: failed to download remote artifact (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
    return `/scene-art/${fileName}`;
  }

  throw new Error("scene-art: provider returned no persistable artifact");
}
