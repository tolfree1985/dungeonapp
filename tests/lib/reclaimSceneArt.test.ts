import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/src/lib/prisma";
import { resetPrismaMock } from "../mocks/prismaMock";
import { SceneArtStatus } from "@/generated/prisma";
import { reclaimStaleSceneArt } from "@/lib/scene-art/reclaimStaleSceneArt";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { getSceneArtWorkerId } from "@/lib/scene-art/workerIdentity";
import { runNextQueuedSceneArtGeneration } from "@/lib/scene-art/runNextQueuedSceneArtGeneration";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../mocks/prismaMock");
  return { prisma: prismaMock };
});

describe("reclaimStaleSceneArt", () => {
  const sceneInput = {
    sceneKey: "dock_office",
    sceneText: "Test",
    renderMode: "full" as const,
  };

  beforeEach(() => {
    resetPrismaMock();
  });

  function markGenerating(identity: ReturnType<typeof getSceneArtIdentity>, ownerId: string, leaseMs: number) {
    return prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
      data: {
        status: SceneArtStatus.generating,
        leaseOwnerId: ownerId,
        leaseAcquiredAt: new Date(Date.now() - 2_000),
        generationStartedAt: new Date(Date.now() - 2_000),
        generationLeaseUntil: new Date(Date.now() + leaseMs),
      },
    });
  }

  afterEach(() => {
    delete process.env.SCENE_ART_WORKER_ID;
  });

  it("reclaims expired leases", async () => {
    const identity = getSceneArtIdentity(sceneInput);
    await queueSceneArtGeneration(sceneInput, { autoProcess: false });
    await markGenerating(identity, getSceneArtWorkerId(), -1);

    const result = await reclaimStaleSceneArt();
    expect(result.reclaimedCount).toBe(1);

    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.queued);
    expect(row.leaseOwnerId).toBeNull();
    expect(row.leaseAcquiredAt).toBeNull();
    expect(row.generationLeaseUntil).toBeNull();
    expect(row.lastRecoveredAt).toBeInstanceOf(Date);
  });

  it("skips active leases", async () => {
    const identity = getSceneArtIdentity(sceneInput);
    await queueSceneArtGeneration(sceneInput, { autoProcess: false });
    await markGenerating(identity, getSceneArtWorkerId(), 60_000);

    const result = await reclaimStaleSceneArt();
    expect(result.reclaimedCount).toBe(0);

    const row = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: identity.promptHash } },
    });
    expect(row.status).toBe(SceneArtStatus.generating);
    expect(row.leaseOwnerId).toBe(getSceneArtWorkerId());
  });

  it("allows reclaimed rows to be claimed again", async () => {
    const identity = getSceneArtIdentity(sceneInput);
    await queueSceneArtGeneration(sceneInput, { autoProcess: false });
    await markGenerating(identity, getSceneArtWorkerId(), -1);

    await reclaimStaleSceneArt();
    const result = await runNextQueuedSceneArtGeneration();
    expect(result.promptHash).toBe(identity.promptHash);
    expect(result.sceneKey).toBe(identity.sceneKey);
  });

  it("reclaim idempotent", async () => {
    const identity = getSceneArtIdentity(sceneInput);
    await queueSceneArtGeneration(sceneInput, { autoProcess: false });
    await markGenerating(identity, getSceneArtWorkerId(), -1);

    const first = await reclaimStaleSceneArt();
    const second = await reclaimStaleSceneArt();
    expect(first.reclaimedCount).toBe(1);
    expect(second.reclaimedCount).toBe(0);
  });
});
