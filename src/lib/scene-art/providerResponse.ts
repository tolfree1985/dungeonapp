export type SceneArtProviderResponse =
  | {
      ok: true;
      provider: string;
      imageUrl?: string | null;
      imageBase64?: string | null;
      base64?: string | null;
      mimeType?: string | null;
    }
  | {
      ok: false;
      provider: string;
      error: string;
      retryable?: boolean;
    };
