export type SceneArtProviderFailureClass =
  | "timeout"
  | "rate_limited"
  | "transient"
  | "malformed_response"
  | "terminal"
  | "unknown";

export type SceneArtProviderFailure = {
  failureClass: SceneArtProviderFailureClass;
  retryable: boolean;
  reason: string;
};

const normalizeMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value ?? "unknown");
};

export function classifySceneArtProviderError(
  error: unknown,
): SceneArtProviderFailure {
  const message = normalizeMessage(error);
  const normalized = message.toLowerCase();
  const timeout = normalized.includes("timeout") ||
    (error instanceof Error && error.name === "AbortError");
  if (timeout) {
    return {
      failureClass: "timeout",
      retryable: true,
      reason: message,
    };
  }

  const rateLimit = /429|rate limit|too many requests/.test(normalized);
  if (rateLimit) {
    return {
      failureClass: "rate_limited",
      retryable: true,
      reason: message,
    };
  }

  const statusMatch = message.match(/image provider failed: (\d+)/i);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status >= 500) {
      return {
        failureClass: "transient",
        retryable: true,
        reason: message,
      };
    }
    if (status === 429) {
      return {
        failureClass: "rate_limited",
        retryable: true,
        reason: message,
      };
    }
    return {
      failureClass: "terminal",
      retryable: false,
      reason: message,
    };
  }

  if (normalized.includes("no imageurl") || normalized.includes("null imageurl")) {
    return {
      failureClass: "malformed_response",
      retryable: false,
      reason: message,
    };
  }

  return {
    failureClass: "unknown",
    retryable: false,
    reason: message,
  };
}
