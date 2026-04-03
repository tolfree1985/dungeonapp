import { describe, expect, it, vi, beforeEach } from "vitest";
import { runSceneArtTriggerIntegration } from "@/app/api/turn/route";
import { evaluateSceneArtVisualTrigger } from "@/lib/scene-art/visualTriggerIntegration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import { queueSceneArt } from "@/lib/sceneArtRepo";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { RenderMode } from "@/lib/sceneArtRepo";
import { SceneArtStatus } from "@/generated/prisma";
import { buildFinalSceneArtContract, resolveFinalSceneArtRow, type SceneArtRowLike } from "@/lib/scene-art/sceneArtContract";

vi.mock("@/lib/scene-art/visualTriggerIntegration", () => ({
  evaluateSceneArtVisualTrigger: vi.fn().mockResolvedValue({
    shouldGenerate: true,
    tier: "medium",
    reason: "location_entered",
  }),
}));
vi.mock("@/lib/scene-art/logging", () => ({
  logSceneArtEvent: vi.fn(),
}));
vi.mock("@/lib/sceneArtRepo", () => ({
  queueSceneArt: vi.fn(),
}));

const triggerMock = vi.mocked(evaluateSceneArtVisualTrigger);
const logMock = vi.mocked(logSceneArtEvent);
const queueSceneArtMock = vi.mocked(queueSceneArt);

const baseIdentity: SceneIdentity = {
  locationKey: "camp",
  focalActorKey: null,
  objectiveKey: null,
  encounterPhase: "investigation",
};

const payload: SceneArtPayload = {
  sceneKey: "scene-key",
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
  basePrompt: "base prompt",
  renderPrompt: "render prompt",
  promptHash: "trigger-hash",
  stylePreset: "victorian-gothic-cinematic",
  tags: [],
};

const baseTriggerOptions = {
  previousState: { location: "camp" } as Record<string, unknown>,
  currentState: { location: "camp" } as Record<string, unknown>,
  previousSceneIdentity: baseIdentity,
  currentSceneIdentity: baseIdentity,
  sceneArtPayload: payload,
  latestTurnScene: "scene text",
  renderMode: "full" as RenderMode,
};

describe("runSceneArtTriggerIntegration", () => {
  const defaultOptions = { ...baseTriggerOptions };

  beforeEach(() => {
    triggerMock.mockClear();
    logMock.mockClear();
    triggerMock.mockResolvedValue({
      shouldGenerate: true,
      tier: "medium",
      reason: "location_entered",
    });
  });

  it("calls evaluate when a canonical payload is present", async () => {
    const result = await runSceneArtTriggerIntegration(defaultOptions);
    expect(triggerMock).toHaveBeenCalled();
    expect(result).toEqual({
      shouldGenerate: true,
      tier: "medium",
      reason: "location_entered",
    });
  });

  it("skips evaluate when no canonical payload is passed", async () => {
    const result = await runSceneArtTriggerIntegration({ ...defaultOptions, sceneArtPayload: null });
    expect(triggerMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("logs a scene.art.trigger.error when the trigger throws", async () => {
    triggerMock.mockRejectedValue(new Error("boom"));
    await expect(runSceneArtTriggerIntegration(defaultOptions)).resolves.toBeNull();
    expect(logMock).toHaveBeenCalledWith(
      "scene.art.trigger.error",
      expect.objectContaining({ sceneKey: payload.sceneKey, message: "boom" }),
    );
  });

  it("returns a trigger decision for a visible disruption payload", async () => {
    triggerMock.mockResolvedValue({
      shouldGenerate: true,
      deltaKind: "environment",
      reason: "VISIBLE_DISRUPTION",
    });

    const result = await runSceneArtTriggerIntegration(defaultOptions);

    expect(triggerMock).toHaveBeenCalled();
    expect(result).toEqual({
      shouldGenerate: true,
      deltaKind: "environment",
      reason: "VISIBLE_DISRUPTION",
    });
  });
});

describe("turn route scene-art sink", () => {
  it("routes a visible disruption through the canonical sink", () => {
    const persistedSceneArt = {
      sceneKey: "scene-disruption",
      promptHash: "hash-123",
      status: SceneArtStatus.ready,
      imageUrl: "https://example.com/scene.png",
    };

    const finalSceneArt = buildFinalSceneArtContract(persistedSceneArt);
    const response = {
      body: {
        finalSceneArt,
        debug: {
          persistedSceneArt,
        },
      },
    };

    expect(response.body.finalSceneArt).toBeTruthy();
    expect(response.body.finalSceneArt?.sceneKey).toBe("scene-disruption");
    expect(response.body.finalSceneArt?.sceneKey).toEqual(response.body.debug.persistedSceneArt.sceneKey);
  });

  it("runs a visible disruption turn through the canonical scene-art sink", async () => {
    const queuedSceneArt: SceneArtRowLike = {
      sceneKey: "scene-disruption",
      promptHash: "queue-hash",
      status: SceneArtStatus.queued,
      imageUrl: null,
    };

    queueSceneArtMock.mockResolvedValue(queuedSceneArt);
    triggerMock.mockResolvedValue({
      shouldGenerate: true,
      deltaKind: "environment",
      reason: "VISIBLE_DISRUPTION",
    });

    const triggerDecision = await runSceneArtTriggerIntegration({
      ...baseTriggerOptions,
    });

    expect(triggerDecision?.shouldGenerate).toBe(true);
    expect(triggerDecision?.deltaKind).toBe("environment");
    expect(triggerDecision?.reason).toBe("VISIBLE_DISRUPTION");

    const refreshDecision = {
      shouldQueueRender: true,
      shouldReuseCurrentImage: false,
      shouldSwapImmediatelyWhenReady: false,
      renderPlan: "queue-full-render",
    };

    const finalSceneArtRow = await resolveFinalSceneArtRow({
      existingSceneArt: null,
      refreshDecision,
      sceneArtPayload: payload,
      renderPriority: "normal",
      renderMode: "full",
    });

    expect(queueSceneArtMock).toHaveBeenCalledWith(payload, expect.anything(), "normal", "full");
    expect(finalSceneArtRow).toBe(queuedSceneArt);

    const finalSceneArt = buildFinalSceneArtContract(finalSceneArtRow);
    expect(finalSceneArt).toBeTruthy();
    expect(finalSceneArt?.sceneKey).toBe(queuedSceneArt?.sceneKey);
    expect(finalSceneArt?.promptHash).toBe(queuedSceneArt?.promptHash);
    expect(finalSceneArt?.sceneKey).toBe(
      buildFinalSceneArtContract(queuedSceneArt!).sceneKey,
    );
  });
});
