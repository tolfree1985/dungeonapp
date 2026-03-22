import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { prisma } from "@/src/lib/prisma";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { createSceneArtRow } from "@/lib/scene-art/sceneArtStore";
import { recoverSceneArt, SceneArtRecoveryError } from "@/lib/scene-art/recoverSceneArt";
import * as sceneArtFileSystem from "@/lib/scene-art/fileSystem";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import { SceneArtStatus } from "@/generated/prisma";

describe("recoverSceneArt", () => {
  const sceneKey = "dock_office";
  const sceneText = "You arrive at dawn to inspect the missing harbor ledgers.";
  const identity = getSceneArtIdentity({ sceneKey, sceneText });

  beforeEach(async () => {
    await prisma.sceneArt.deleteMany({ where: { sceneKey } });
    vi.spyOn(sceneArtGenerator, "generateImage").mockResolvedValue({
      imageUrl: identity.imageUrl,
      provider: "remote",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedRow(status: SceneArtStatus, overrides?: Partial<Parameters<typeof prisma.sceneArt.create>[0]["data"]>) {
    const row = await createSceneArtRow(identity);
    return prisma.sceneArt.update({
      where: {
        sceneKey_promptHash: {
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
        },
      },
      data: {
        status,
        imageUrl: identity.imageUrl,
        ...(overrides ?? {}),
      },
    });
  }

  it("retry preserves promptHash", async () => {
    await seedRow(SceneArtStatus.failed);
    const result = await recoverSceneArt({
      action: "retry",
      sceneKey,
      sceneText,
    });
    expect(result.promptHash).toBe(identity.promptHash);
    const persisted = await prisma.sceneArt.findUniqueOrThrow({
      where: {
        sceneKey_promptHash: {
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
        },
      },
    });
    expect(persisted.promptHash).toBe(identity.promptHash);
  });

  it("retry preserves imageUrl", async () => {
    await seedRow(SceneArtStatus.failed);
    const result = await recoverSceneArt({
      action: "retry",
      sceneKey,
      sceneText,
    });
    expect(result.imageUrl).toBe(identity.imageUrl);
  });

  it("retry transitions failed to ready", async () => {
    await seedRow(SceneArtStatus.failed);
    const result = await recoverSceneArt({
      action: "retry",
      sceneKey,
      sceneText,
    });
    expect(result.status).toBe("ready");
  });

  it("retry transitions missing to ready", async () => {
    await seedRow(SceneArtStatus.ready);
    vi.spyOn(sceneArtFileSystem, "sceneArtFileExists").mockResolvedValueOnce(false);
    const result = await recoverSceneArt({
      action: "retry",
      sceneKey,
      sceneText,
    });
    expect(result.status).toBe("ready");
  });

  it("rejects retry for generating", async () => {
    await seedRow(SceneArtStatus.queued);
    await expect(
      recoverSceneArt({
        action: "retry",
        sceneKey,
        sceneText,
      }),
    ).rejects.toThrow(/Retry not allowed/);
  });

  it("throws on identity mismatch", async () => {
    await seedRow(SceneArtStatus.failed, { basePrompt: "something-else" });
    await expect(
      recoverSceneArt({
        action: "retry",
        sceneKey,
        sceneText,
      }),
    ).rejects.toThrow("SCENE_ART_IDENTITY_MISMATCH");
  });
});
