import { describe, expect, it } from "vitest";
import {
  buildSceneCanonicalTags,
  type SceneCanonicalTagPolicy,
} from "@/lib/sceneCanonicalTagPolicy";

const baseArgs = {
  promptFramingTags: ["intent-observe", "emphasis-detail"],
  motifTags: ["motif-neutral"],
  threatFramingTags: ["threat present"],
  revealStructureTags: ["reveal-partial"],
};

describe("buildSceneCanonicalTags", () => {
  it("keeps canonical tags when all optional layers off", () => {
    const policy: SceneCanonicalTagPolicy = {
      includeMotifTagsInCanonical: false,
      includeThreatFramingInCanonical: false,
      includeRevealStructureInCanonical: false,
    };
    const result = buildSceneCanonicalTags({ ...baseArgs, tagPolicy: policy });
    expect(result.motifTags).toEqual([]);
    expect(result.threatFramingTags).toEqual([]);
    expect(result.revealStructureTags).toEqual([]);
    expect(result.combinedTags).toEqual(["intent-observe", "emphasis-detail"]);
  });

  it("includes motif when enabled", () => {
    const policy: SceneCanonicalTagPolicy = { includeMotifTagsInCanonical: true };
    const result = buildSceneCanonicalTags({ ...baseArgs, tagPolicy: policy });
    expect(result.motifTags).toEqual(["motif-neutral"]);
    expect(result.combinedTags).toEqual(["intent-observe", "emphasis-detail", "motif-neutral"]);
  });

  it("includes threat when enabled without duplicates", () => {
    const policy: SceneCanonicalTagPolicy = { includeThreatFramingInCanonical: true };
    const result = buildSceneCanonicalTags({
      promptFramingTags: ["intent-observe", "emphasis-detail"],
      ...baseArgs,
      tagPolicy: policy,
    });
    expect(result.threatFramingTags).toEqual(["threat present"]);
    expect(result.combinedTags).toEqual(["intent-observe", "emphasis-detail", "motif-neutral", "threat present"]);
  });

  it("includes reveal when enabled", () => {
    const policy: SceneCanonicalTagPolicy = { includeRevealStructureInCanonical: true };
    const result = buildSceneCanonicalTags({ ...baseArgs, tagPolicy: policy });
    expect(result.revealStructureTags).toEqual(["reveal-partial"]);
    expect(result.combinedTags).toEqual(["intent-observe", "emphasis-detail", "motif-neutral", "reveal-partial"]);
  });

  it("handles all layers together and deduplicates", () => {
    const policy: SceneCanonicalTagPolicy = {
      includeMotifTagsInCanonical: true,
      includeThreatFramingInCanonical: true,
      includeRevealStructureInCanonical: true,
    };
    const args = {
      promptFramingTags: ["intent-observe", "detail"],
      motifTags: ["motif-neutral", "detail"],
      threatFramingTags: ["threat present", "intent-observe"],
      revealStructureTags: ["reveal-partial", "detail"],
      tagPolicy: policy,
    };
    const result = buildSceneCanonicalTags(args);
    expect(result.combinedTags).toEqual([
      "intent-observe",
      "detail",
      "motif-neutral",
      "threat present",
      "reveal-partial",
    ]);
  });
});
