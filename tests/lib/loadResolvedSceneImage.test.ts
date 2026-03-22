import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/src/lib/prisma";
import { loadResolvedSceneImage } from "@/lib/loadResolvedSceneImage";
import { buildSceneArtPromptInput, buildScenePrompt } from "@/lib/sceneArtGenerator";

describe("loadResolvedSceneImage", () => {
  beforeEach(async () => {
    await prisma.sceneArt.deleteMany({ where: { sceneKey: "dock_office" } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the row whose prompt hash matches the scene text", async () => {
    const sceneKey = "dock_office";
    const currentSceneState = {
      text: "You arrive at dawn to inspect the missing harbor ledgers.",
      locationKey: null,
      timeKey: null,
    };
    const promptInput = buildSceneArtPromptInput({
      sceneKey,
      currentSceneState,
      stylePreset: "victorian-gothic-cinematic",
      engineVersion: null,
    });
    const prompt = buildScenePrompt(promptInput);

    await prisma.sceneArt.create({
      data: {
        sceneKey,
        promptHash: "legacy-hash",
        title: sceneKey,
        basePrompt: "legacy",
        renderPrompt: "legacy",
        status: "ready",
        imageUrl: "/scene-art/legacy.jpg",
        tagsJson: "{}",
        renderMode: "full",
        renderPriority: "normal",
      },
    });

    await prisma.sceneArt.create({
      data: {
        sceneKey,
        promptHash: prompt.promptHash,
        title: sceneKey,
        basePrompt: prompt.basePrompt,
        renderPrompt: prompt.renderPrompt,
        status: "ready",
        imageUrl: "/scene-art/dock_office.jpg",
        tagsJson: "{}",
        renderMode: "full",
        renderPriority: "normal",
      },
    });

    const result = await loadResolvedSceneImage({
      sceneKey,
      locationBackdropUrl: null,
      defaultImageUrl: "/scene-art/fallback.jpg",
      currentSceneState: currentSceneState,
    });

    expect(result.status).toBe("ready");
    expect(result.promptHash).toBe(prompt.promptHash);
    expect(result.imageUrl).toBe("/scene-art/dock_office.jpg");
  });

  it("returns generating status and triggers generation when no matching row exists", async () => {
    const sceneKey = "dock_office";
    const currentSceneState = {
      text: "Looking for clues in the servants' hall.",
      locationKey: "servants_wing",
      timeKey: "late_night",
    };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({} as never);

    const result = await loadResolvedSceneImage({
      sceneKey,
      locationBackdropUrl: null,
      defaultImageUrl: "/scene-art/fallback.jpg",
      currentSceneState,
    });

    expect(result.status).toBe("generating");
    expect(result.promptHash).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
