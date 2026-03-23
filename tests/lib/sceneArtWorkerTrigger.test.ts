import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/src/lib/prisma";
import { resetPrismaMock } from "../mocks/prismaMock";
import { SceneArtStatus } from "@/generated/prisma";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import * as runModule from "@/lib/scene-art/runQueuedSceneArtGeneration";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../mocks/prismaMock");
  return { prisma: prismaMock };
});

vi.mock("@/lib/sceneArtGenerator", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateImage: vi.fn(),
  };
});

describe("runNextQueuedSceneArtGeneration", () => {
  const baseInput = {
    sceneKey: "dock_office",
    sceneText: "You arrive at dawn to inspect the missing harbor ledgers.",
    renderMode: "full" as const,
  };

  beforeEach(() => {
    resetPrismaMock();
    sceneArtGenerator.generateImage.mockResolvedValue({ imageUrl: "/scene-art/fake.png", provider: "remote" });
    sceneArtGenerator.generateImage.mockClear();
  });

  it("processes the oldest queued row", async () => {
    const firstIdentity = getSceneArtIdentity(baseInput);
    const secondInput = { ...baseInput, sceneKey: "dock_office_b" };
    const secondIdentity = getSceneArtIdentity(secondInput);
    await queueSceneArtGeneration(baseInput, { autoProcess: false });
    await queueSceneArtGeneration(secondInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: secondIdentity.sceneKey, promptHash: secondIdentity.promptHash } },
      data: { createdAt: new Date(Date.now() + 1_000) },
    });

    const spy = vi.spyOn(runModule, "runQueuedSceneArtGeneration");

    const result = await runNextQueuedSceneArtGeneration();

    expect(result.promptHash).toBe(firstIdentity.promptHash);
    expect(spy).toHaveBeenCalledWith(firstIdentity.promptHash);
    const processedRow = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey: firstIdentity.sceneKey, promptHash: firstIdentity.promptHash } },
    });
    expect(processedRow.status).toBe(SceneArtStatus.ready);
    spy.mockRestore();
  });

  it("returns null when no queued rows exist", async () => {
    const result = await runNextQueuedSceneArtGeneration();
    expect(result.promptHash).toBeNull();
  });

  it("does not process generating rows", async () => {
    const identity = getSceneArtIdentity(baseInput);
    await queueSceneArtGeneration(baseInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.generating },
    });

    const spy = vi.spyOn(runModule, "runQueuedSceneArtGeneration");
    const result = await runNextQueuedSceneArtGeneration();
    expect(result.promptHash).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("processes work that was enqueued with autoProcess false", async () => {
    const identity = getSceneArtIdentity(baseInput);
    await queueSceneArtGeneration(baseInput, { autoProcess: false });
    const result = await runNextQueuedSceneArtGeneration();
    expect(result.promptHash).toBe(identity.promptHash);
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
  });
});
