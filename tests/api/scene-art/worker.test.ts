import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as getQueue } from "@/app/api/scene-art/worker/queue/route";
import { POST as postRunNext } from "@/app/api/scene-art/worker/run-next/route";
import { POST as postReclaimStale } from "@/app/api/scene-art/worker/reclaim-stale/route";
import { prisma } from "@/lib/prisma";
import { resetPrismaMock } from "../../mocks/prismaMock";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../../mocks/prismaMock");
  return { prisma: prismaMock };
});

vi.mock("@/lib/scene-art/runNextQueuedSceneArtGeneration", async () => {
  const actual = await import("@/lib/scene-art/runNextQueuedSceneArtGeneration");
  return {
    ...actual,
    runNextQueuedSceneArtGeneration: vi.fn(actual.runNextQueuedSceneArtGeneration),
  };
});

vi.mock("@/lib/sceneArtGenerator", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateImage: vi.fn().mockResolvedValue({ imageUrl: "/scene-art/fake.png", provider: "remote" }),
  };
});

describe("scene-art worker ops surface", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("queue endpoint returns queued and generating rows without mutation", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const first = await queueSceneArtGeneration(identity, { autoProcess: false });
    const second = await queueSceneArtGeneration({ ...identity, sceneKey: "dock_office_b" }, { autoProcess: false });
    const initial = await prisma.sceneArt.findUnique({
      where: { sceneKey_promptHash: { sceneKey: second.sceneKey, promptHash: second.promptHash } },
    });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: second.sceneKey, promptHash: second.promptHash } },
      data: { status: "generating" },
    });
    const updatedRow = await prisma.sceneArt.findUnique({
      where: { sceneKey_promptHash: { sceneKey: second.sceneKey, promptHash: second.promptHash } },
    });

    const response = await getQueue();
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((entry: any) => entry.status === "queued")).toBe(true);
    expect(data.some((entry: any) => entry.status === "generating")).toBe(true);

    const after = await prisma.sceneArt.findUnique({ where: { sceneKey_promptHash: { sceneKey: second.sceneKey, promptHash: second.promptHash } } });
    expect(after?.status).toBe("generating");
  });

  it("run-next endpoint returns null when nothing queued", async () => {
    const response = await postRunNext();
    expect(await response.json()).toEqual({ promptHash: null });
  });

  it("run-next endpoint processes the oldest queued row", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const first = await queueSceneArtGeneration(identity, { autoProcess: false });
    await queueSceneArtGeneration({ ...identity, sceneKey: "dock_office_b" }, { autoProcess: false });

    const response = await postRunNext();
    expect(await response.json()).toEqual({ promptHash: first.promptHash });
  });

  it("run-next endpoint does not process generating rows", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identity, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: queued.promptHash } },
      data: { status: "generating" },
    });

    const response = await postRunNext();
    expect(await response.json()).toEqual({ promptHash: null });
  });

  it("run-next works for rows enqueued with autoProcess: false", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identity, { autoProcess: false });

    const response = await postRunNext();
    expect(await response.json()).toEqual({ promptHash: queued.promptHash });
  });

  it("reclaim stale endpoint requeues expired generating rows", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identity, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: queued.promptHash } },
      data: {
        status: "generating",
        generationLeaseUntil: new Date(Date.now() - 60_000),
      },
    });

    const response = await postReclaimStale();
    expect(await response.json()).toEqual({ reclaimedCount: 1, promptHashes: [queued.promptHash] });

    const row = await prisma.sceneArt.findUnique({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: queued.promptHash } },
    });
    expect(row?.status).toBe("queued");
  });

  it("reclaim stale endpoint ignores active generating rows", async () => {
    const identity = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identity, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: queued.promptHash } },
      data: {
        status: "generating",
        generationLeaseUntil: new Date(Date.now() + 60_000),
      },
    });

    const response = await postReclaimStale();
    expect(await response.json()).toEqual({ reclaimedCount: 0, promptHashes: [] });

    const row = await prisma.sceneArt.findUnique({
      where: { sceneKey_promptHash: { sceneKey: identity.sceneKey, promptHash: queued.promptHash } },
    });
    expect(row?.status).toBe("generating");
  });
});
