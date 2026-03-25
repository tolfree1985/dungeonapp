import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateSceneArtVisualTrigger } from "@/lib/scene-art/visualTriggerIntegration";
import { queueSceneArtGeneration } from "@/lib/scene-art/queueSceneArtGeneration";
import { logSceneArtEvent } from "@/lib/scene-art/logging";
import type { SceneIdentity } from "@/server/scene/scene-identity";

vi.mock("@/lib/scene-art/queueSceneArtGeneration", () => ({
  queueSceneArtGeneration: vi.fn(async () => ({
    status: "pending",
    promptHash: "mock",
    imageUrl: null,
  })),
}));
vi.mock("@/lib/scene-art/logging", () => ({
  logSceneArtEvent: vi.fn(),
}));

const queueMock = vi.mocked(queueSceneArtGeneration);
const logMock = vi.mocked(logSceneArtEvent);

const baseIdentity: SceneIdentity = {
  locationKey: "camp",
  focalActorKey: null,
  objectiveKey: null,
  encounterPhase: "investigation",
};
const baseSceneKey = "camp-key";

function makeState(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const locationKey = (overrides.locationKey as string) ?? "camp";
  const scene = { locationKey, ...(overrides.scene as Record<string, unknown> | undefined) };
  return {
    scene,
    location: locationKey,
    pressureBand: overrides.pressureBand ?? "calm",
    pressureStage: overrides.pressureStage ?? "calm",
    visualMilestones: overrides.visualMilestones ?? [],
    importantObjectInspected: overrides.importantObjectInspected ?? false,
  };
}

describe("evaluateSceneArtVisualTrigger", () => {
  beforeEach(() => {
    queueMock.mockClear();
    logMock.mockClear();
  });

  it("queues when location changes", async () => {
    const previousState = makeState({ locationKey: "camp" });
    const currentState = makeState({ locationKey: "docks" });
    const previousIdentity: SceneIdentity = { ...baseIdentity };
    const currentIdentity: SceneIdentity = { ...baseIdentity, locationKey: "docks" };

    const trigger = await evaluateSceneArtVisualTrigger({
      previousState,
      currentState,
      previousIdentity,
      currentIdentity,
      sceneKey: "docks-key",
      sceneText: "Dock chronicles",
      stylePreset: "victorian-gothic-cinematic",
      renderMode: "full",
      engineVersion: "engine-v1",
    });

    expect(trigger.shouldGenerate).toBe(true);
    expect(trigger.tier).toBe("low");
    expect(queueMock).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      "scene.art.triggered",
      expect.objectContaining({
        sceneKey: expect.any(String),
        promptHash: expect.any(String),
        triggerReason: trigger.reason,
        triggerTier: trigger.tier,
        triggerMilestoneKind: trigger.milestoneKind ?? null,
      }),
    );
  });

  it("does not queue when nothing changes", async () => {
    const state = makeState({ locationKey: "camp" });
    const identity: SceneIdentity = { ...baseIdentity };

    const trigger = await evaluateSceneArtVisualTrigger({
      previousState: state,
      currentState: state,
      previousIdentity: identity,
      currentIdentity: identity,
      sceneKey: baseSceneKey,
      sceneText: "Camp",
      stylePreset: "victorian-gothic-cinematic",
      renderMode: "full",
      engineVersion: "engine-v1",
    });

    expect(trigger.shouldGenerate).toBe(false);
    expect(queueMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.some(([event]) => event === "scene.art.triggered")).toBe(false);
  });

  it("ignores important object inspections without milestones", async () => {
    const previousState = makeState({ importantObjectInspected: false });
    const currentState = makeState({ importantObjectInspected: true });
    const identity = { ...baseIdentity };

    const trigger = await evaluateSceneArtVisualTrigger({
      previousState,
      currentState,
      previousIdentity: identity,
      currentIdentity: identity,
      sceneKey: baseSceneKey,
      sceneText: "Camp",
      stylePreset: "victorian-gothic-cinematic",
      renderMode: "full",
      engineVersion: "engine-v1",
    });

    expect(trigger.shouldGenerate).toBe(false);
    expect(queueMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.some(([event]) => event === "scene.art.triggered")).toBe(false);
  });

  it("queues when a visual milestone appears", async () => {
    const previousState = makeState({ visualMilestones: [] });
    const currentState = makeState({ visualMilestones: ["artifact_discovered"] });
    const identity = { ...baseIdentity };

    const trigger = await evaluateSceneArtVisualTrigger({
      previousState,
      currentState,
      previousIdentity: identity,
      currentIdentity: identity,
      sceneKey: baseSceneKey,
      sceneText: "Camp",
      stylePreset: "victorian-gothic-cinematic",
      renderMode: "full",
      engineVersion: "engine-v1",
    });

    expect(trigger.shouldGenerate).toBe(true);
    expect(trigger.tier).toBe("medium");
    expect(queueMock).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      "scene.art.triggered",
      expect.objectContaining({
        sceneKey: expect.any(String),
        promptHash: expect.any(String),
        triggerReason: trigger.reason,
        triggerTier: trigger.tier,
        triggerMilestoneKind: trigger.milestoneKind ?? null,
      }),
    );
  });

  it("queues when encounter phase changes", async () => {
    const state = makeState({});
    const previousIdentity: SceneIdentity = { ...baseIdentity, encounterPhase: "investigation" };
    const currentIdentity: SceneIdentity = { ...baseIdentity, encounterPhase: "conflict" };

    const trigger = await evaluateSceneArtVisualTrigger({
      previousState: state,
      currentState: state,
      previousIdentity,
      currentIdentity,
      sceneKey: baseSceneKey,
      sceneText: "Camp",
      stylePreset: "victorian-gothic-cinematic",
      renderMode: "full",
      engineVersion: "engine-v1",
    });

    expect(trigger.shouldGenerate).toBe(true);
    expect(trigger.tier).toBe("medium");
    expect(queueMock).toHaveBeenCalledOnce();
    expect(logMock).toHaveBeenCalledWith(
      "scene.art.triggered",
      expect.objectContaining({
        sceneKey: expect.any(String),
        promptHash: expect.any(String),
        triggerReason: trigger.reason,
        triggerTier: trigger.tier,
        triggerMilestoneKind: trigger.milestoneKind ?? null,
      }),
    );
  });
});
