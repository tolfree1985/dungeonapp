import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/prisma";
import { SceneArtStatus } from "@/generated/prisma";
import { claimNextSceneArtForRender } from "@/lib/scene-art/claimNextSceneArtForRender";
import { isSceneArtClaimableNow } from "@/lib/scene-art/sceneArtLease";

const now = new Date("2026-01-01T00:00:00Z");

function baseRow(overrides: Partial<Parameters<typeof isSceneArtClaimableNow>[0]> = {}) {
  return {
    status: "queued",
    generationLeaseUntil: null,
    lastProviderRetryable: null,
    attemptCount: 0,
    billableAttemptCount: 0,
    ...overrides,
  };
}

describe("isSceneArtClaimableNow", () => {
  test("queued rows are claimable", () => {
    expect(isSceneArtClaimableNow(baseRow(), now)).toBe(true);
  });

  test("ready rows are not claimable", () => {
    expect(isSceneArtClaimableNow(baseRow({ status: "ready" }), now)).toBe(false);
  });

  test("generating rows respect leases", () => {
    expect(
      isSceneArtClaimableNow(baseRow({ status: "generating", generationLeaseUntil: new Date(now.getTime() + 60_000) }), now),
    ).toBe(false);
    expect(
      isSceneArtClaimableNow(baseRow({ status: "generating", generationLeaseUntil: new Date(now.getTime() - 60_000) }), now),
    ).toBe(true);
  });

  test("retryable rows check leases", () => {
    expect(
      isSceneArtClaimableNow(baseRow({ status: "retryable", generationLeaseUntil: new Date(now.getTime() + 60_000) }), now),
    ).toBe(false);
    expect(
      isSceneArtClaimableNow(baseRow({ status: "retryable", generationLeaseUntil: new Date(now.getTime() - 60_000) }), now),
    ).toBe(true);
  });

  test("failed non-retryable rows are blocked", () => {
    expect(isSceneArtClaimableNow(baseRow({ status: "failed", lastProviderRetryable: false }), now)).toBe(false);
  });

  test("attempt budgets gate claimability", () => {
    expect(isSceneArtClaimableNow(baseRow({ attemptCount: 3 }), now)).toBe(false);
    expect(isSceneArtClaimableNow(baseRow({ billableAttemptCount: 2 }), now)).toBe(false);
  });
});

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && process.env.SCENE_ART_TESTS === "1");

(shouldRunDbTests ? describe : describe.skip)("claimNextSceneArtForRender", () => {
  beforeEach(async () => {
    await prisma.sceneArt.deleteMany({});
  });

  async function seedRow(overrides?: Partial<Parameters<typeof prisma.sceneArt.create>[0]["data"]>) {
    return prisma.sceneArt.create({
      data: {
        sceneKey: `scene-${Date.now()}`,
        promptHash: `hash-${Date.now()}`,
        basePrompt: "test prompt",
        renderPrompt: "test render",
        engineVersion: "test",
        ...(overrides ?? {}),
      },
    });
  }

  test("ready rows are not claimed", async () => {
    await seedRow({ status: SceneArtStatus.ready, imageUrl: "/scene.png" });
    const job = await claimNextSceneArtForRender(now, "worker-1");
    expect(job).toBeNull();
  });

  test("only one claimant wins", async () => {
    await seedRow({ status: SceneArtStatus.queued });
    const [first, second] = await Promise.all([
      claimNextSceneArtForRender(now, "worker-1"),
      claimNextSceneArtForRender(now, "worker-2"),
    ]);
    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  test("expired generating leases become claimable", async () => {
    await seedRow({
      status: SceneArtStatus.generating,
      generationLeaseUntil: new Date(now.getTime() - 60_000),
      generationStartedAt: new Date(now.getTime() - 120_000),
      attemptCount: 1,
      billableAttemptCount: 1,
    });

    const job = await claimNextSceneArtForRender(now, "worker-1");
    expect(job).toBeTruthy();
  });

  test("stale worker cannot finalize after lease transfer", async () => {
    const row = await seedRow({
      status: SceneArtStatus.generating,
      leaseOwnerId: "worker-1",
      generationLeaseUntil: new Date(now.getTime() + 60_000),
      generationStartedAt: new Date(now.getTime() - 60_000),
    });

    await prisma.sceneArt.update({
      where: { id: row.id },
      data: { leaseOwnerId: "worker-2" },
    });

    const finalizeAttempt = await prisma.sceneArt.updateMany({
      where: { id: row.id, leaseOwnerId: "worker-1" },
      data: { status: SceneArtStatus.ready },
    });

    expect(finalizeAttempt.count).toBe(0);
  });
});
