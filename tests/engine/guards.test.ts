import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkIdentityDrift,
  checkRenderAnomaly,
  checkRenderThrottle,
  resetSceneHistory,
} from "@/engine/guards";

describe("guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSceneHistory();
  });

  it("logs an anomaly when reuse rate drops below the threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRenderAnomaly({ reuseRate: 0.1, turnIndex: 15, sceneKey: "sceneA", adventureId: "adv" });

    expect(warn).toHaveBeenCalledWith(
      "scene.render.anomaly",
      expect.objectContaining({ reuseRate: 0.1 }),
    );
  });

  it("logs a throttle when the reuse rate is very low", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkRenderThrottle({ reuseRate: 0.1, turnIndex: 20, sceneKey: "sceneB", adventureId: "adv" });

    expect(warn).toHaveBeenCalledWith(
      "scene.render.throttle",
      expect.objectContaining({ reuseRate: 0.1 }),
    );
  });

  it("logs identity drift when the scene flips back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    checkIdentityDrift({
      adventureId: "adv",
      currentSceneKey: "sceneA",
      previousSceneKey: null,
      turnIndex: 1,
    });
    checkIdentityDrift({
      adventureId: "adv",
      currentSceneKey: "sceneB",
      previousSceneKey: "sceneA",
      turnIndex: 2,
    });
    checkIdentityDrift({
      adventureId: "adv",
      currentSceneKey: "sceneA",
      previousSceneKey: "sceneB",
      turnIndex: 3,
    });

    expect(warn).toHaveBeenCalledWith(
      "scene.identity.drift",
      expect.objectContaining({ sceneHistory: ["sceneA", "sceneB", "sceneA"] }),
    );
  });
});
