import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { SceneArtPayload } from "@/lib/sceneArt";
import { queueSceneArt } from "@/lib/sceneArtRepo";
import { SceneArtStatus } from "@/generated/prisma";
import { ENGINE_VERSION } from "@/lib/game/engineVersion";
import { buildPromptHash } from "@/lib/sceneArtGenerator";

describe("sceneArtRepo.queueSceneArt", () => {
  beforeEach(async () => {
    await prisma.sceneArt.deleteMany();
  });

  const buildPayload = (sceneKey: string): SceneArtPayload => {
    const basePrompt = `Test prompt ${sceneKey}`;
    const renderPrompt = `Render prompt ${sceneKey}`;
    const promptHash = buildPromptHash(basePrompt, ENGINE_VERSION);
    return {
      sceneKey,
      identity: {
        locationId: sceneKey,
        pressureStage: "calm",
        lightingState: "stable",
        atmosphereState: "disturbed",
        environmentWear: "intact",
        threatPresence: "distant",
        frameKind: "wide_environment",
        shotScale: "wide",
        subjectFocus: "environment",
        cameraAngle: "level",
        primarySubjectKind: "environment",
        primarySubjectId: "environment",
        actorVisible: false,
        primaryActorId: null,
      },
      promptMetadata: {
        latestTurnScene: "Test scene",
        timeValue: "1",
        directorDecision: { emphasis: null, compositionBias: null },
      },
      title: "Queue test",
      basePrompt,
      renderPrompt,
      promptHash,
      stylePreset: "victorian-gothic-cinematic",
      tags: ["test"],
    };
  };

  it("creates a queued row when none exists", async () => {
    const payload = buildPayload("scene:create");
    const queued = await queueSceneArt(payload, "engine-v1");

    expect(queued.sceneKey).toBe("scene:create");
    expect(queued.status).toBe(SceneArtStatus.queued);
    expect(queued.imageUrl).toBe(`/scene-art/scene:create-${queued.promptHash}.png`);

    const stored = await prisma.sceneArt.findUniqueOrThrow({
      where: { sceneKey_promptHash: { sceneKey: queued.sceneKey, promptHash: queued.promptHash } },
    });
    expect(stored.id).toBe(queued.id);
  });

  it("returns an existing ready row without requeueing", async () => {
    const payload = buildPayload("scene:ready");
    const initial = await queueSceneArt(payload, "engine-v1");
    await prisma.sceneArt.update({
      where: { id: initial.id },
      data: { status: SceneArtStatus.ready, imageUrl: `/scene-art/${initial.sceneKey}-${initial.promptHash}.png` },
    });

    const result = await queueSceneArt(payload, "engine-v1");
    expect(result.id).toBe(initial.id);
    expect(result.status).toBe(SceneArtStatus.ready);

    const after = await prisma.sceneArt.findUnique({ where: { id: initial.id } });
    expect(after?.status).toBe(SceneArtStatus.ready);
  });

  it("requeues failed retryable rows", async () => {
    const payload = buildPayload("scene:retry");
    const initial = await queueSceneArt(payload, "engine-v1");
    await prisma.sceneArt.update({
      where: { id: initial.id },
      data: { status: SceneArtStatus.failed, lastProviderRetryable: true },
    });

    const result = await queueSceneArt(payload, "engine-v1");
    expect(result.id).toBe(initial.id);
    expect(result.status).toBe(SceneArtStatus.queued);
  });

  it("does not requeue failed non-retryable rows", async () => {
    const payload = buildPayload("scene:terminal");
    const initial = await queueSceneArt(payload, "engine-v1");
    await prisma.sceneArt.update({
      where: { id: initial.id },
      data: { status: SceneArtStatus.failed, lastProviderRetryable: false },
    });

    const result = await queueSceneArt(payload, "engine-v1");
    expect(result.id).toBe(initial.id);
    expect(result.status).toBe(SceneArtStatus.failed);
  });
});
