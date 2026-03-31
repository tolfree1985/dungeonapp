export type NormalizedSceneArtProviderError = {
  code: string;
  reason: string;
  retryable: boolean;
  rawStatus?: number;
  rawBody?: string;
};

export function normalizeSceneArtProviderError(error: unknown): NormalizedSceneArtProviderError {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown provider error";
  return {
    code: "unknown",
    reason: message,
    retryable: false,
  };
}
