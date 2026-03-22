import { describe, expect, it } from "vitest";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { assertStoredSceneArtMatchesIdentity } from "@/lib/scene-art/assertStoredSceneArtMatchesIdentity";

describe("scene art identity", () => {
  it("produces the same hash for the same inputs", () => {
    const first = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
      stylePreset: null,
      renderMode: "full",
    });
    const second = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
      stylePreset: null,
      renderMode: "full",
    });

    expect(first.promptHash).toBe(second.promptHash);
    expect(first.fileName).toBe(second.fileName);
    expect(first.imageUrl).toBe(second.imageUrl);
  });

  it("throws when stored metadata does not match the identity", () => {
    const identity = getSceneArtIdentity({
      sceneKey: "dock_office",
      sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
      stylePreset: null,
      renderMode: "full",
    });
    expect(() =>
      assertStoredSceneArtMatchesIdentity(
        {
          sceneKey: identity.sceneKey,
          basePrompt: identity.basePrompt,
          renderPrompt: identity.renderPrompt,
          promptHash: identity.promptHash,
          stylePreset: "wrong-style",
          renderMode: identity.renderMode,
          engineVersion: identity.engineVersion,
          imageUrl: identity.imageUrl,
        },
        identity,
      ),
    ).toThrow(/stylePreset/);
  });
});
