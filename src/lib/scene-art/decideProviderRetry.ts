import type { SceneArtProviderFailureClass } from "@/lib/scene-art/classifyProviderError";

export type SceneArtRetryDecision = {
  retryable: boolean;
  retryDelayMs: number | null;
  maxAttemptsReached: boolean;
  reason: string;
};

export type SceneArtRetryPolicyOptions = {
  maxAttempts?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;

const CLASS_DELAY: Record<SceneArtProviderFailureClass, number | null> = {
  timeout: 5_000,
  rate_limited: 30_000,
  transient: 10_000,
  malformed_response: null,
  terminal: null,
  unknown: null,
};

export function decideSceneArtRetry(
  failureClass: SceneArtProviderFailureClass,
  attemptCount: number,
  options?: SceneArtRetryPolicyOptions,
): SceneArtRetryDecision {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxReached = attemptCount >= maxAttempts;
  const delay = CLASS_DELAY[failureClass] ?? null;
  const retryable =
    !maxReached && (delay !== null || failureClass === "timeout" || failureClass === "transient" || failureClass === "rate_limited");

  return {
    retryable,
    retryDelayMs: retryable ? delay : null,
    maxAttemptsReached: maxReached,
    reason: `maxAttempts=${maxAttempts} attempt=${attemptCount} failure=${failureClass}`,
  };
}
