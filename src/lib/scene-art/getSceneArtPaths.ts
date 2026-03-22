import path from "node:path";

export function getSceneArtPaths(imageUrl: string) {
  const relativeUrl = imageUrl.startsWith("/") ? imageUrl.slice(1) : imageUrl;
  return {
    publicUrl: imageUrl,
    absolutePath: path.join(process.cwd(), "public", relativeUrl),
  };
}
