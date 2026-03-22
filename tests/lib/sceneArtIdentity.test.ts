import { describe, it, expect } from "vitest";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";

describe("getSceneArtIdentity", () => {
  it("produces the same hash for identical visual inputs", () => {
    const first = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
      locationKey: "dock_office",
      timeKey: "dawn",
      stylePreset: "victorian-gothic-cinematic",
      engineVersion: "engine-v1",
    });
    const second = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
      locationKey: "dock_office",
      timeKey: "dawn",
      stylePreset: "victorian-gothic-cinematic",
      engineVersion: "engine-v1",
    });
    expect(first.promptHash).toBe(second.promptHash);
    expect(first.imageUrl).toBe(second.imageUrl);
  });

  it("produces a different hash when time of day changes", () => {
    const dawn = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive gently at dawn.",
      locationKey: "dock_office",
      timeKey: "dawn",
      stylePreset: "victorian-gothic-cinematic",
      engineVersion: "engine-v1",
    });
    const night = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive under the moonlight.",
      locationKey: "dock_office",
      timeKey: "night",
      stylePreset: "victorian-gothic-cinematic",
      engineVersion: "engine-v1",
    });
    expect(dawn.promptHash).not.toBe(night.promptHash);
    expect(dawn.imageUrl).not.toBe(night.imageUrl);
  });
});
