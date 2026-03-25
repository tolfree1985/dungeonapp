import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveSceneArtAttemptCost } from "@/lib/scene-art/providerCostConfig";

describe("scene art provider cost config", () => {
  beforeEach(() => {
    process.env.SCENE_ART_PROVIDER_MODEL = "gpt-image-1";
    delete process.env.SCENE_ART_COST_PER_ATTEMPT_USD;
    process.env.SCENE_ART_LOW_COST_PER_ATTEMPT_USD = "0.01";
    process.env.SCENE_ART_MEDIUM_COST_PER_ATTEMPT_USD = "0.02";
    process.env.SCENE_ART_HIGH_COST_PER_ATTEMPT_USD = "0.04";
  });

  afterEach(() => {
    delete process.env.SCENE_ART_PROVIDER_MODEL;
    delete process.env.SCENE_ART_COST_TIER;
    delete process.env.SCENE_ART_LOW_COST_PER_ATTEMPT_USD;
    delete process.env.SCENE_ART_MEDIUM_COST_PER_ATTEMPT_USD;
    delete process.env.SCENE_ART_HIGH_COST_PER_ATTEMPT_USD;
  });

  it("returns low tier by default", () => {
    const result = resolveSceneArtAttemptCost();
    expect(result.providerModel).toBe("gpt-image-1");
    expect(result.costTier).toBe("low");
    expect(result.attemptCostUsd).toBe(0.01);
  });

  it("returns medium price when tier set", () => {
    process.env.SCENE_ART_COST_TIER = "medium";
    const result = resolveSceneArtAttemptCost("medium");
    expect(result.costTier).toBe("medium");
    expect(result.attemptCostUsd).toBe(0.02);
  });

  it("uses high tier when requested even if default low", () => {
    const result = resolveSceneArtAttemptCost("high");
    expect(result.costTier).toBe("high");
    expect(result.attemptCostUsd).toBe(0.04);
  });
});
