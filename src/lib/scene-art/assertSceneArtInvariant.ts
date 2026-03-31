import type { SceneArtStatus } from "@/generated/prisma";

export function assertSceneArtInvariant(sceneArt: {
  status: SceneArtStatus | string;
  imageUrl: string | null;
  errorCode?: string | null;
}) {
  const isPlaceholder =
    typeof sceneArt.imageUrl === "string" && sceneArt.imageUrl.includes("generated-placeholder");

  if (sceneArt.status === "ready") {
    if (!sceneArt.imageUrl) {
      throw new Error("Invalid SceneArt invariant: ready row missing imageUrl");
    }
    if (sceneArt.errorCode) {
      throw new Error("Invalid SceneArt invariant: ready row still has errorCode");
    }
    if (isPlaceholder) {
      throw new Error("Invalid SceneArt invariant: ready row points at placeholder");
    }
  }

  if (sceneArt.status === "failed" && sceneArt.imageUrl) {
    throw new Error("Invalid SceneArt invariant: failed row should not have imageUrl");
  }
}
