import { describe, expect, it } from "vitest";

import { decideSceneArtRetry } from "@/lib/scene-art/decideProviderRetry";

describe("decideSceneArtRetry", () => {
  it("allows retry for timeout before max attempts", () => {
    const decision = decideSceneArtRetry("timeout", 1);

    expect(decision.retryable).toBe(true);
    expect(decision.retryDelayMs).toBe(5000);
    expect(decision.maxAttemptsReached).toBe(false);
  });

  it("marks rate limit retries with longer delay", () => {
    const decision = decideSceneArtRetry("rate_limited", 2);

    expect(decision.retryable).toBe(true);
    expect(decision.retryDelayMs).toBe(30000);
  });

  it("stops retrying after max attempts", () => {
    const decision = decideSceneArtRetry("transient", 3);

    expect(decision.retryable).toBe(false);
    expect(decision.maxAttemptsReached).toBe(true);
  });

  it("never retries malformed_response", () => {
    const decision = decideSceneArtRetry("malformed_response", 1);

    expect(decision.retryable).toBe(false);
    expect(decision.retryDelayMs).toBeNull();
  });

  it("never retries terminal failures", () => {
    const decision = decideSceneArtRetry("terminal", 1);

    expect(decision.retryable).toBe(false);
    expect(decision.maxAttemptsReached).toBe(false);
  });
});
