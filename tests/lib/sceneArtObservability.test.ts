import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { getSceneArtLogs, resetSceneArtLogs } from "@/lib/scene-art/logging";
import { resetPrismaMock } from "../mocks/prismaMock";
import { prisma } from "@/src/lib/prisma";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../mocks/prismaMock");
  return { prisma: prismaMock };
});
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { processSceneArtGeneration } from "@/lib/scene-art/processSceneArtGeneration";
import { getSceneArtIdentity } from "@/lib/sceneArtIdentity";
import * as sceneArtGenerator from "@/lib/sceneArtGenerator";
import { SceneArtStatus } from "@/generated/prisma";

describe("scene art observability", () => {
  const sceneKey = "dock_office";
  const sceneText = "You arrive at dawn to inspect the missing harbor ledgers.";
  const identityInput = { sceneKey, sceneText, renderMode: "full" as const };
  const identity = getSceneArtIdentity(identityInput);
  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetPrismaMock();
    resetSceneArtLogs();
    generateSpy = vi.spyOn(sceneArtGenerator, "generateImage").mockResolvedValue({ imageUrl: identity.imageUrl, provider: "remote" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs queued event with attempt count", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    const logs = getSceneArtLogs();
    expect(logs.some((entry) => entry.event === "scene.art.queued")).toBe(true);
  });

  it("logs claimed event with lease metadata", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await processSceneArtGeneration(identity);
    const claimed = getSceneArtLogs().find((entry) => entry.event === "scene.art.claimed");
    expect(claimed).toBeDefined();
    const payload = claimed?.payload;
    expect(payload?.sceneKey).toBe(sceneKey);
    expect(payload?.generationLeaseUntil).toBeInstanceOf(Date);
  });

  it("logs reclaimed event for stale leases", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey, promptHash: identity.promptHash } },
      data: {
        status: SceneArtStatus.generating,
        generationStartedAt: new Date(Date.now() - 60_000),
        generationLeaseUntil: new Date(Date.now() - 1),
      },
    });
    await queueSceneArtGeneration(identityInput);
    const logs = getSceneArtLogs();
    expect(logs.some((entry) => entry.event === "scene.art.reclaimed")).toBe(true);
  });

  it("logs completed event with duration", async () => {
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await processSceneArtGeneration(identity);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const completed = getSceneArtLogs().find((entry) => entry.event === "scene.art.completed");
    expect(completed).toBeDefined();
    expect(completed?.payload.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("logs failed event when generation throws", async () => {
    generateSpy.mockRejectedValueOnce(new Error("boom"));
    await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await expect(processSceneArtGeneration(identity)).rejects.toThrow("boom");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const failed = getSceneArtLogs().find((entry) => entry.event === "scene.art.failed");
    expect(failed).toBeDefined();
    expect(failed?.payload.errorCode).toBe("provider_error");
    expect(failed?.payload.errorMessage).toContain("boom");
  });
});
