export type SceneArtStatus = "queued" | "ready" | "failed";

export type SceneArtStatusRecord = {
  sceneKey: string;
  status: SceneArtStatus;
  imageUrl: string | null;
};

export type SceneArtStatusResponse = {
  ok: boolean;
  sceneArt: SceneArtStatusRecord | null;
  error?: string;
};
