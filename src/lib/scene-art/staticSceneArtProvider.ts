import { readFile } from "node:fs/promises";
import path from "node:path";

const STATIC_ART_DIR = path.join(process.cwd(), "public", "scene-art");
const FIXTURE_DIR = path.join(process.cwd(), "public", "scene-fixtures");
const BLOCKED_SCENE_KEYS = new Set(["dock_office"]);

async function loadStaticFixture(sceneKey: string): Promise<{ base64: string; mimeType: string } | null> {
  if (sceneKey !== "test_real_room") {
    return null;
  }
  const filePath = path.join(FIXTURE_DIR, "test_real_room.png");
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  if (base64.length < 500) {
    console.warn("SCENE_ART_SUSPICIOUSLY_SMALL_IMAGE", {
      sceneKey,
      base64Length: base64.length,
    });
  }
  return {
    mimeType: "image/png",
    base64,
  };
}

export async function getStaticSceneArtBase64(sceneKey: string): Promise<{ base64: string; mimeType: string } | null> {
  if (BLOCKED_SCENE_KEYS.has(sceneKey)) {
    return null;
  }
  const fixture = await loadStaticFixture(sceneKey);
  if (fixture) {
    return fixture;
  }
  const candidates = ["jpg", "png", "webp"].map((ext) => `${sceneKey}.${ext}`);
  for (const fileName of candidates) {
    const absolutePath = path.join(STATIC_ART_DIR, fileName);
    try {
      const buffer = await readFile(absolutePath);
      const mimeType = fileName.endsWith(".jpg")
        ? "image/jpeg"
        : fileName.endsWith(".webp")
        ? "image/webp"
        : "image/png";
      return { base64: buffer.toString("base64"), mimeType };
    } catch {
      continue;
    }
  }
  return null;
}
