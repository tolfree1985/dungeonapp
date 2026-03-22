export type SceneArtStatus = "pending" | "generating" | "ready" | "failed" | "missing";

export type ResolvedSceneImage =
  | {
      status: "ready";
      imageUrl: string;
      promptHash: string;
      errorCode?: undefined;
    }
  | {
      status: "pending" | "generating" | "failed" | "missing";
      imageUrl: null;
      promptHash: string | null;
      errorCode?: string;
    };
