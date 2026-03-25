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
import { reclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";
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
    process.env.SCENE_ART_PROVIDER_MODEL = "gpt-image-1";
    process.env.SCENE_ART_COST_TIER = "low";
    process.env.SCENE_ART_LOW_COST_PER_ATTEMPT_USD = "0.01";
    process.env.SCENE_ART_MEDIUM_COST_PER_ATTEMPT_USD = "0.02";
    process.env.SCENE_ART_HIGH_COST_PER_ATTEMPT_USD = "0.05";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SCENE_ART_PROVIDER_MODEL;
    delete process.env.SCENE_ART_COST_TIER;
    delete process.env.SCENE_ART_LOW_COST_PER_ATTEMPT_USD;
    delete process.env.SCENE_ART_MEDIUM_COST_PER_ATTEMPT_USD;
    delete process.env.SCENE_ART_HIGH_COST_PER_ATTEMPT_USD;
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

  const COST = Number(process.env.SCENE_ART_COST_PER_ATTEMPT_USD ?? "0.01");

  it("tracks cost on successful attempt", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await processSceneArtGeneration(identity);
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.billableAttemptCount).toBe(1);
    expect(row.totalCostUsd).toBeCloseTo(COST);
    expect(row.lastAttemptCostUsd).toBeCloseTo(COST);
    expect(row.providerCostTier).toBe("low");
    expect(row.providerModel).toBe("gpt-image-1");
  });

  it("records cost on terminal failure", async () => {
    sceneArtGenerator.generateImage.mockRejectedValue(new Error("Image provider failed: 403"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.billableAttemptCount).toBe(1);
    expect(row.totalCostUsd).toBeCloseTo(COST);
    expect(row.providerCostTier).toBe("low");
  });

  it("accumulates cost across retryable failure + success", async () => {
    sceneArtGenerator.generateImage
      .mockRejectedValueOnce(new Error("Image provider failed: 503"))
      .mockResolvedValueOnce({ imageUrl: identity.imageUrl, provider: "remote" });
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    let row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.billableAttemptCount).toBe(1);
    expect(row.totalCostUsd).toBeCloseTo(COST);

    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.queued },
    });
    await processSceneArtGeneration(identity);
    row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(row.billableAttemptCount).toBe(2);
    expect(row.totalCostUsd).toBeCloseTo(2 * COST);
    expect(row.lastAttemptCostUsd).toBeCloseTo(COST);
  });

  it("does not change cost when merely queueing rows", async () => {
    const result = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    expect(result.status).toBe("pending");
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: result.promptHash } } });
    expect(row.billableAttemptCount).toBe(0);
    expect(row.totalCostUsd).toBe(0);
  });

  it("does not charge cost when reclaiming stale rows", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: {
        status: SceneArtStatus.generating,
        generationLeaseUntil: new Date(Date.now() - 60_000),
      },
    });
    await reclaimStaleSceneArt();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.billableAttemptCount).toBe(0);
    expect(row.totalCostUsd).toBe(0);
  });

  it("classifies timeout as retryable with timeout delay", async () => {
    const timeout = new Error("The request timed out");
    timeout.name = "AbortError";
    sceneArtGenerator.generateImage.mockRejectedValueOnce(timeout);
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow("The request timed out");
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.lastProviderFailureClass).toBe("timeout");
    expect(row.lastProviderRetryable).toBe(true);
    expect(row.lastProviderRetryDelayMs).toBe(5000);
  });

  it("treats rate-limited failures as retryable with longer delay", async () => {
    sceneArtGenerator.generateImage.mockRejectedValue(new Error("Image provider failed: 429"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.lastProviderFailureClass).toBe("rate_limited");
    expect(row.lastProviderRetryable).toBe(true);
    expect(row.lastProviderRetryDelayMs).toBe(30000);
  });

  it("treats terminal failures as non-retryable", async () => {
    sceneArtGenerator.generateImage.mockRejectedValue(new Error("Image provider failed: 403"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.lastProviderFailureClass).toBe("terminal");
    expect(row.lastProviderRetryable).toBe(false);
    expect(row.lastProviderRetryDelayMs).toBeNull();
  });

  it("treats malformed responses as non-retryable", async () => {
    sceneArtGenerator.generateImage.mockRejectedValue(new Error("Image provider returned no imageUrl"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    const row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.lastProviderFailureClass).toBe("malformed_response");
    expect(row.lastProviderRetryable).toBe(false);
  });

  it("completes once after a retryable failure", async () => {
    sceneArtGenerator.generateImage
      .mockRejectedValueOnce(new Error("Image provider failed: 503"))
      .mockResolvedValueOnce({ imageUrl: identity.imageUrl, provider: "remote" });
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow();
    let row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.status).toBe(SceneArtStatus.failed);
    expect(row.attemptCount).toBe(1);
    expect(row.lastProviderFailureClass).toBe("transient");

    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: { status: SceneArtStatus.queued },
    });
    await processSceneArtGeneration(identity);
    row = await prisma.sceneArt.findUniqueOrThrow({ where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } } });
    expect(row.status).toBe(SceneArtStatus.ready);
    expect(row.attemptCount).toBe(2);
    expect(row.lastProviderFailureClass).toBeNull();
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
