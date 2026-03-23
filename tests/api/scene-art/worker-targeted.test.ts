import { describe, expect, it, beforeEach, vi } from "vitest";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { prisma } from "@/lib/prisma";
import type { RunQueuedSceneArtGenerationModule } from "@/lib/scene-art/runQueuedSceneArtGeneration";
import { resetPrismaMock } from "../../mocks/prismaMock";

vi.mock("@/lib/prisma", async () => {
  const { prismaMock } = await import("../../mocks/prismaMock");
  return { prisma: prismaMock };
});

vi.mock("@/lib/sceneArtGenerator", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateImage: vi.fn().mockResolvedValue({ imageUrl: "/scene-art/fake.png", provider: "remote" }),
  };
});

describe("worker targeted run", () => {
  let runModule: typeof import("@/lib/scene-art/runQueuedSceneArtGeneration");
  let postRun: typeof import("@/app/api/scene-art/worker/run/[promptHash]/route").POST;

  beforeEach(async () => {
    resetPrismaMock();
    runModule = await import("@/lib/scene-art/runQueuedSceneArtGeneration");
    const routeModule = await import("@/app/api/scene-art/worker/run/[promptHash]/route");
    postRun = routeModule.POST;
  });

  it("processes a queued row via promptHash", async () => {
    const identityInput = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    const spy = vi.spyOn(runModule, "runQueuedSceneArtGeneration");

    const response = await postRun(new Request("http://localhost/"), { params: Promise.resolve({ promptHash: queued.promptHash }) });
    expect(await response.json()).toEqual({ promptHash: queued.promptHash });
    expect(spy).toHaveBeenCalledWith(queued.promptHash);
  });

  it("no-ops when row is generating", async () => {
    const identityInput = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: queued.sceneKey, promptHash: queued.promptHash } },
      data: { status: "generating" },
    });
    const spy = vi.spyOn(runModule, "runQueuedSceneArtGeneration");

    await postRun(new Request("http://localhost/"), { params: Promise.resolve({ promptHash: queued.promptHash }) });
    expect(spy).not.toHaveBeenCalled();
  });

  it("no-ops when row is ready", async () => {
    const identityInput = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await prisma.sceneArt.update({
      where: { sceneKey_promptHash: { sceneKey: queued.sceneKey, promptHash: queued.promptHash } },
      data: { status: "ready" },
    });
    const spy = vi.spyOn(runModule, "runQueuedSceneArtGeneration");

    await postRun(new Request("http://localhost/"), { params: Promise.resolve({ promptHash: queued.promptHash }) });
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses stored metadata when triggering run", async () => {
    const identityInput = { sceneKey: "dock_office", sceneText: "text", renderMode: "full" as const };
    const queued = await queueSceneArtGeneration(identityInput, { autoProcess: false });
    await postRun(new Request("http://localhost/"), { params: Promise.resolve({ promptHash: queued.promptHash }) });
    const row = await prisma.sceneArt.findFirst({ where: { promptHash: queued.promptHash } });
    expect(row?.imageUrl).toBeDefined();
  });
});
