import { describe, expect, it, vi, beforeEach } from "vitest";
import { runSceneArtTriggerIntegration } from "@/app/api/turn/route";
import { evaluateSceneArtVisualTrigger } from "@/lib/scene-art/visualTriggerIntegration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import type { SceneArtPayload } from "@/lib/sceneArt";
import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { RenderMode } from "@/lib/sceneArtRepo";

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

const triggerMock = vi.mocked(evaluateSceneArtVisualTrigger);
const logMock = vi.mocked(logSceneArtEvent);

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

describe("runSceneArtTriggerIntegration", () => {
  const defaultOptions = {
    previousState: { location: "camp" } as Record<string, unknown>,
    currentState: { location: "camp" } as Record<string, unknown>,
    previousSceneIdentity: baseIdentity,
    currentSceneIdentity: baseIdentity,
    sceneArtPayload: payload,
    latestTurnScene: "scene text",
    renderMode: "full" as RenderMode,
  };

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
    await runSceneArtTriggerIntegration(defaultOptions);
    expect(triggerMock).toHaveBeenCalled();
  });

  it("skips evaluate when no canonical payload is passed", async () => {
    await runSceneArtTriggerIntegration({ ...defaultOptions, sceneArtPayload: null });
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it("logs a scene.art.trigger.error when the trigger throws", async () => {
    triggerMock.mockRejectedValue(new Error("boom"));
    await expect(runSceneArtTriggerIntegration(defaultOptions)).resolves.toBeUndefined();
    expect(logMock).toHaveBeenCalledWith(
      "scene.art.trigger.error",
      expect.objectContaining({ sceneKey: payload.sceneKey, message: "boom" }),
    );
  });
});
