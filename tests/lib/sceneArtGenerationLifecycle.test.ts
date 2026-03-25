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
import { generateSceneArtForExecutionContext } from "@/lib/scene-art/generateSceneArtForIdentity";
import { resetSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";

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

  it("stores provider diagnostics when execution fails", async () => {
    sceneArtGenerator.generateImage.mockRejectedValue(new Error("Image provider failed: 503"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.status).toBe(SceneArtStatus.failed);
    expect(row.lastProviderFailureClass).toBe("transient");
    expect(row.lastProviderRetryable).toBe(true);
    expect(row.lastProviderRetryDelayMs).toBe(10000);
    expect(row.lastProviderDurationMs).toBeGreaterThanOrEqual(0);
    expect(row.lastProviderAttemptAt).toBeInstanceOf(Date);
  });

  it("clears provider diagnostics after a successful attempt", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await processSceneArtGeneration(identity);
    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(row.lastProviderFailureClass).toBeNull();
    expect(row.lastProviderFailureReason).toBeNull();
    expect(row.lastProviderRetryable).toBeNull();
    expect(row.lastProviderRetryDelayMs).toBeNull();
    expect(row.lastProviderDurationMs).toBeGreaterThanOrEqual(0);
    expect(row.lastProviderAttemptAt).toBeInstanceOf(Date);
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

  describe("lease ownership enforcement", () => {
    const ownerA = "owner-A";
    const ownerB = "owner-B";

    function setWorkerIdOverride(value: string) {
      process.env.SCENE_ART_WORKER_ID = value;
      resetSceneArtWorkerId();
    }

    async function markGenerating(identity: SceneArtIdentity, ownerId: string) {
      await prisma.sceneArt.update({
        where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
        data: {
          status: SceneArtStatus.generating,
          leaseOwnerId: ownerId,
          leaseAcquiredAt: new Date(),
          generationStartedAt: new Date(),
          generationLeaseUntil: new Date(Date.now() + 60_000),
        },
      });
    }

    afterEach(() => {
      delete process.env.SCENE_ART_WORKER_ID;
      resetSceneArtWorkerId();
    });

    it("non-owner cannot finalize generation", async () => {
      const identity = getSceneArtIdentity(identityInput);
      await queueSceneArtGeneration(identityInput, { autoProcess: false });
      await markGenerating(identity, ownerA);
      setWorkerIdOverride(ownerB);
      sceneArtGenerator.generateImage.mockResolvedValue({ imageUrl: identity.imageUrl, provider: "remote" });

      await expect(
        generateSceneArtForExecutionContext({
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
          basePrompt: identity.basePrompt,
          renderPrompt: identity.renderPrompt,
          stylePreset: identity.stylePreset,
          renderMode: identity.renderMode,
          engineVersion: identity.engineVersion,
        }),
      ).rejects.toThrow("SCENE_ART_OWNERSHIP_VIOLATION");

      const row = await prisma.sceneArt.findUniqueOrThrow({
        where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      });
      expect(row.status).toBe(SceneArtStatus.generating);
      expect(row.leaseOwnerId).toBe(ownerA);
    });

    it("owner finalizes and clears lease", async () => {
      const identity = getSceneArtIdentity(identityInput);
      await queueSceneArtGeneration(identityInput, { autoProcess: false });
      await markGenerating(identity, ownerA);
      setWorkerIdOverride(ownerA);
      sceneArtGenerator.generateImage.mockResolvedValue({ imageUrl: identity.imageUrl, provider: "remote" });

      await generateSceneArtForExecutionContext({
        sceneKey: identity.sceneKey,
        promptHash: identity.promptHash,
        basePrompt: identity.basePrompt,
        renderPrompt: identity.renderPrompt,
        stylePreset: identity.stylePreset,
        renderMode: identity.renderMode,
        engineVersion: identity.engineVersion,
      });

      const row = await prisma.sceneArt.findUniqueOrThrow({
        where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      });
      expect(row.status).toBe(SceneArtStatus.ready);
      expect(row.leaseOwnerId).toBeNull();
      expect(row.leaseAcquiredAt).toBeNull();
      expect(row.generationLeaseUntil).toBeNull();
    });

    it("non-owner cannot fail generation", async () => {
      const identity = getSceneArtIdentity(identityInput);
      await queueSceneArtGeneration(identityInput, { autoProcess: false });
      await markGenerating(identity, ownerA);
      sceneArtGenerator.generateImage.mockRejectedValue(new Error("boom"));
      setWorkerIdOverride(ownerB);

      await expect(
        generateSceneArtForExecutionContext({
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
          basePrompt: identity.basePrompt,
          renderPrompt: identity.renderPrompt,
          stylePreset: identity.stylePreset,
          renderMode: identity.renderMode,
          engineVersion: identity.engineVersion,
        }),
      ).rejects.toThrow("SCENE_ART_OWNERSHIP_VIOLATION");

      const row = await prisma.sceneArt.findUniqueOrThrow({
        where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      });
      expect(row.status).toBe(SceneArtStatus.generating);
      expect(row.leaseOwnerId).toBe(ownerA);
    });

    it("owner failure clears lease", async () => {
      const identity = getSceneArtIdentity(identityInput);
      await queueSceneArtGeneration(identityInput, { autoProcess: false });
      await markGenerating(identity, ownerA);
      setWorkerIdOverride(ownerA);
      sceneArtGenerator.generateImage.mockRejectedValue(new Error("boom"));

      await expect(
        generateSceneArtForExecutionContext({
          sceneKey: identity.sceneKey,
          promptHash: identity.promptHash,
          basePrompt: identity.basePrompt,
          renderPrompt: identity.renderPrompt,
          stylePreset: identity.stylePreset,
          renderMode: identity.renderMode,
          engineVersion: identity.engineVersion,
        }),
      ).rejects.toThrow("boom");

      const row = await prisma.sceneArt.findUniqueOrThrow({
        where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      });
      expect(row.status).toBe(SceneArtStatus.failed);
      expect(row.leaseOwnerId).toBeNull();
      expect(row.leaseAcquiredAt).toBeNull();
      expect(row.generationLeaseUntil).toBeNull();
    });
  });

});
