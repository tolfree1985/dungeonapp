import { describe, expect, it, vi } from "vitest";
import { SceneArtStatus } from "@/generated/prisma";
import type { SceneArtPayload } from "@/lib/sceneArt";
import { buildFinalSceneArtContract, resolveFinalSceneArtRow, SceneArtRowLike } from "@/lib/scene-art/sceneArtContract";

describe("scene art contract helper", () => {
  const baseRow: SceneArtRowLike = {
    sceneKey: "test_scene",
    promptHash: "hash",
    status: SceneArtStatus.queued,
    imageUrl: "/scene-art/test_scene-hash.png",
  };

  it("returns null when row is null", () => {
    expect(buildFinalSceneArtContract(null)).toBeNull();
  });

  it("preserves queued rows", () => {
    const result = buildFinalSceneArtContract(baseRow);
    expect(result).toEqual({
      sceneKey: "test_scene",
      promptHash: "hash",
      status: SceneArtStatus.queued,
      imageUrl: "/scene-art/test_scene-hash.png",
    });
  });

  it("preserves generating rows", () => {
    const generating = { ...baseRow, status: SceneArtStatus.generating };
    const result = buildFinalSceneArtContract(generating);
    expect(result?.status).toBe(SceneArtStatus.generating);
  });

  it("preserves ready rows", () => {
    const ready = { ...baseRow, status: SceneArtStatus.ready };
    const result = buildFinalSceneArtContract(ready);
    expect(result?.status).toBe(SceneArtStatus.ready);
  });

  it("does not rewrite canonical identity fields", () => {
    const mutated = { ...baseRow, sceneKey: "mutated", promptHash: "mutated" };
    const result = buildFinalSceneArtContract(mutated);
    expect(result?.sceneKey).toBe("mutated");
    expect(result?.promptHash).toBe("mutated");
  });
});

describe("resolveFinalSceneArtRow helper", () => {
  const payload: SceneArtPayload = {
    sceneKey: "scene:test",
    identity: {
      locationId: null,
      pressureStage: null,
      lightingState: null,
      atmosphereState: null,
      environmentWear: null,
      threatPresence: null,
      frameKind: null,
      shotScale: null,
      subjectFocus: null,
      cameraAngle: null,
      primarySubjectKind: null,
      primarySubjectId: null,
      actorVisible: false,
      primaryActorId: null,
    },
    promptMetadata: {
      latestTurnScene: "",
      timeValue: null,
      directorDecision: { emphasis: null, compositionBias: null },
    },
    basePrompt: "base",
    renderPrompt: "render",
    promptHash: "hash",
    stylePreset: "victorian-gothic-cinematic",
    tags: [],
  };

  it("returns existing row when present", async () => {
    const existing: SceneArtRowLike = {
      sceneKey: "existing",
      promptHash: "hash",
      status: SceneArtStatus.ready,
      imageUrl: "/scene-art/existing-hash.png",
    };
    const result = await resolveFinalSceneArtRow({
      existingSceneArt: existing,
      refreshDecision: null,
      queueSceneArt: vi.fn(),
      sceneArtPayload: null,
      renderPriority: "normal",
      renderMode: "full",
    });
    expect(result).toBe(existing);
  });

  it("queues when missing and should queue render", async () => {
    const queuedRow = {
      sceneKey: "scene:test",
      promptHash: "hash",
      status: SceneArtStatus.queued,
      imageUrl: "/scene-art/scene:test-hash.png",
    };
    const queue = vi.fn().mockResolvedValue(queuedRow);
    const result = await resolveFinalSceneArtRow({
      existingSceneArt: null,
      refreshDecision: { shouldQueueRender: true, shouldReuseCurrentImage: false, shouldSwapImmediatelyWhenReady: false, renderPlan: "queue-full-render" },
      queueSceneArt: queue,
      sceneArtPayload: payload,
      renderPriority: "normal",
      renderMode: "full",
    });
    expect(queue).toHaveBeenCalled();
    expect(result).toBe(queuedRow);
  });

  it("returns null when missing and should not queue", async () => {
    const queue = vi.fn();
    const result = await resolveFinalSceneArtRow({
      existingSceneArt: null,
      refreshDecision: { shouldQueueRender: false, shouldReuseCurrentImage: true, shouldSwapImmediatelyWhenReady: false, renderPlan: "reuse-current" },
      queueSceneArt: queue,
      sceneArtPayload: payload,
      renderPriority: "normal",
      renderMode: "full",
    });
    expect(queue).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
