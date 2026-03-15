import { describe, expect, it } from "vitest";
import { resolveSceneMotif } from "@/lib/resolveSceneMotif";
import { buildMotifTags } from "@/lib/resolveSceneMotif";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";

const baseVisual: SceneVisualState = {
  locationId: "stone gallery",
  timeValue: "night",
  pressureStage: "tension",
  lightingState: "dim",
  atmosphereState: "still",
  environmentWear: "intact",
  threatPresence: "distant",
};

describe("resolveSceneMotif", () => {
  it("leans neutral/even/clear for calm observe scenes", () => {
    const motif = resolveSceneMotif({ shotIntent: "observe", visualState: baseVisual });
    expect(motif).toEqual({ tone: "neutral", lighting: "even", atmosphere: "clear" });
  });

  it("leans tense/harsh/smoky when threats are present", () => {
    const motif = resolveSceneMotif({ shotIntent: "threaten", visualState: baseVisual, pressureStage: "danger" });
    expect(motif).toEqual({ tone: "ominous", lighting: "harsh", atmosphere: "smoky" });
  });

  it("glows/mysterious when reveal intent dominates", () => {
    const motif = resolveSceneMotif({ shotIntent: "reveal", visualState: baseVisual, pressureStage: "calm" });
    expect(motif).toEqual({ tone: "mysterious", lighting: "glow", atmosphere: "foggy" });
  });

  it("keeps dusty atmosphere for inspect transitions", () => {
    const motif = resolveSceneMotif({ shotIntent: "inspect", visualState: baseVisual });
    expect(motif.atmosphere).toBe("dusty");
  });

  it("returns deterministic motifs for identical inputs", () => {
    const first = resolveSceneMotif({ shotIntent: "observe", visualState: baseVisual });
    const second = resolveSceneMotif({ shotIntent: "observe", visualState: baseVisual });
    expect(second).toEqual(first);
  });

  it("produces ordered canonical tags", () => {
    const motif = resolveSceneMotif({ shotIntent: "threaten", visualState: baseVisual, pressureStage: "danger" });
    expect(buildMotifTags(motif)).toEqual(["ominous presence", "harsh lighting", "smoky air"]);
  });
});
