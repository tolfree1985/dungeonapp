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
import { runQueuedSceneArtGeneration } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import * as runModule from "@/lib/scene-art/runQueuedSceneArtGeneration";
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
    const processSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockImplementation(async () => {
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
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await Promise.all([
      processSceneArtGeneration(identity),
      processSceneArtGeneration(identity),
    ]);
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(row.attemptCount).toBe(1);
    expect(sceneArtGenerator.generateImage).toHaveBeenCalledTimes(1);
  });

  it("claims queued work with a lease", async () => {
    sceneArtGenerator.generateImage.mockImplementation(async () => {
      const intermediate = await prisma.sceneArt.findUniqueOrThrow({
        where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      });
      expect(intermediate.status).toBe(SceneArtStatus.generating);
      expect(intermediate.generationStartedAt).toBeInstanceOf(Date);
      expect(intermediate.generationLeaseUntil).toBeInstanceOf(Date);
      expect(intermediate.generationLeaseUntil?.getTime()).toBeGreaterThan(
        intermediate.generationStartedAt?.getTime() ?? 0,
      );
      return { imageUrl: identity.imageUrl, provider: "remote" };
    });
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await processSceneArtGeneration(identity);
  });

  it("does not reclaim active generating rows", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: {
        status: SceneArtStatus.generating,
        generationStartedAt: new Date(),
        generationLeaseUntil: new Date(Date.now() + 30_000),
      },
    });
    const processSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockResolvedValue();
    const result = await queueSceneArtGeneration(identityInput);
    expect(result.status).toBe("generating");
    expect(processSpy).not.toHaveBeenCalled();
    processSpy.mockRestore();
  });

  it("reclaims stale generating work", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: {
        status: SceneArtStatus.generating,
        generationStartedAt: new Date(Date.now() - 60_000),
        generationLeaseUntil: new Date(Date.now() - 1),
      },
    });
    const processSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockResolvedValue();
    const result = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    expect(result.status).toBe("pending");
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.queued);
    processSpy.mockRestore();
  });

  it("executor exits when row is already generating", async () => {
    const queueProcessSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockResolvedValue();
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
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
    const processSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockResolvedValue();
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

  it("persists queued intent without executing when autoProcess is false", async () => {
    const processSpy = vi.spyOn(runModule, "runQueuedSceneArtGeneration").mockResolvedValue();
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.queued);
    expect(processSpy).not.toHaveBeenCalled();
    processSpy.mockRestore();
  });

  it("runQueuedSceneArtGeneration processes previously queued work", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await runQueuedSceneArtGeneration({
      sceneKey,
      promptHash: identity.promptHash,
    });
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(sceneArtGenerator.generateImage).toHaveBeenCalledTimes(1);
  });

  it("worker entrypoint does not depend on request inputs", async () => {
    const alternateInput = { ...identityInput, sceneText: "changed" };
    const alternateIdentity = getSceneArtIdentity(alternateInput);
    await queueSceneArtGeneration(alternateInput, { autoProcess: false });
    await runQueuedSceneArtGeneration({
      sceneKey,
      promptHash: alternateIdentity.promptHash,
    });
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: alternateIdentity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
  });

  it("recovery enqueues work without auto-processing when autoProcess is false", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.failed },
    });
    const result = await recoverSceneArt({ action: "retry", sceneKey, sceneText, autoProcess: false });
    expect(result.status).toBe("pending");
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.queued);
  });

});
