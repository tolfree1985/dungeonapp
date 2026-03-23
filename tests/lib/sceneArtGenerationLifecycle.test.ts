import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { resetPrismaMock } from "../mocks/prismaMock";
import { prisma } from "@/src/lib/prisma";

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
import { SceneArtStatus } from "@/generated/prisma";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { processSceneArtGeneration } from "@/lib/scene-art/processSceneArtGeneration";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import * as processModule from "@/lib/scene-art/processSceneArtGeneration";
import { recoverSceneArt } from "@/lib/scene-art/recoverSceneArt";

describe("scene art async lifecycle", () => {
  const sceneKey = "dock_office";
  const sceneText = "You arrive at dawn to inspect the missing harbor ledgers.";
  const identityInput = { sceneKey, sceneText, renderMode: "full" as const };
  const identity = getSceneArtIdentity(identityInput);

  beforeEach(() => {
    resetPrismaMock();
    sceneArtGenerator.generateImage.mockResolvedValue({ imageUrl: identity.imageUrl, provider: "remote" });
    sceneArtGenerator.generateImage.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queueSceneArtGeneration returns without waiting for provider", async () => {
    const processSpy = vi.spyOn(processModule, "processSceneArtGeneration").mockImplementation(async () => {
      return new Promise(() => {
        /* intentionally unresolved to keep the row queued */
      });
    });
    const result = await queueSceneArtGeneration(identityInput);
    expect(result.status).toBe("pending");
    expect(result.promptHash).toBe(identity.promptHash);
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.queued);
    processSpy.mockRestore();
  });

  it("processSceneArtGeneration claims queued row only once", async () => {
    await queueSceneArtGeneration(identityInput);
    await Promise.all([
      processSceneArtGeneration(identity),
      processSceneArtGeneration(identity),
    ]);
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(sceneArtGenerator.generateImage).toHaveBeenCalledTimes(1);
  });

  it("executor exits when row is already generating", async () => {
    const queueProcessSpy = vi.spyOn(processModule, "processSceneArtGeneration").mockResolvedValue();
    await queueSceneArtGeneration(identityInput);
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.generating },
    });
    const generateSpy = sceneArtGenerator.generateImage;
    await processSceneArtGeneration(identity);
    expect(generateSpy).not.toHaveBeenCalled();
    queueProcessSpy.mockRestore();
  });

  it("recovery enqueues without blocking", async () => {
    const processSpy = vi.spyOn(processModule, "processSceneArtGeneration").mockResolvedValue();
    await queueSceneArtGeneration(identityInput);
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.failed },
    });
    const result = await recoverSceneArt({ action: "retry", sceneKey, sceneText });
    expect(result.status).toBe("pending");
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.status).toBe(SceneArtStatus.queued);
    processSpy.mockRestore();
  });

});
