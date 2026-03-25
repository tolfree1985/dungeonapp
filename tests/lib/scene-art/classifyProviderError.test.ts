import { describe, expect, it } from "vitest";

import { classifySceneArtProviderError } from "@/lib/scene-art/classifyProviderError";

describe("classifySceneArtProviderError", () => {
  it("marks AbortError timeouts as retryable timeouts", () => {
    const error = new Error("The request timed out");
    error.name = "AbortError";

    const result = classifySceneArtProviderError(error);

    expect(result.failureClass).toBe("timeout");
    expect(result.retryable).toBe(true);
    expect(result.reason).toContain("timed out");
  });

  it("detects rate limit responses", () => {
    const result = classifySceneArtProviderError("Image provider failed: 429");

    expect(result.failureClass).toBe("rate_limited");
    expect(result.retryable).toBe(true);
  });

  it("classifies 5xx as transient retries", () => {
    const result = classifySceneArtProviderError("Image provider failed: 503");

    expect(result.failureClass).toBe("transient");
    expect(result.retryable).toBe(true);
  });

  it("flags 4xx other than 429 as terminal", () => {
    const result = classifySceneArtProviderError("Image provider failed: 403");

    expect(result.failureClass).toBe("terminal");
    expect(result.retryable).toBe(false);
  });

  it("reconciles malformed responses", () => {
    const result = classifySceneArtProviderError("Image provider returned no imageUrl");

    expect(result.failureClass).toBe("malformed_response");
    expect(result.retryable).toBe(false);
  });

  it("falls back to unknown for other errors", () => {
    const result = classifySceneArtProviderError(new Error("something odd"));

    expect(result.failureClass).toBe("unknown");
    expect(result.retryable).toBe(false);
  });
});
