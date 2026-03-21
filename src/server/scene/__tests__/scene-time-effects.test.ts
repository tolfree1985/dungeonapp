import { describe, expect, it } from "vitest";
import { resolveSceneTimeEffect } from "@/server/scene/scene-time-effects";

describe("resolveSceneTimeEffect", () => {
  it("ignores non-same-scene advances", () => {
    expect(resolveSceneTimeEffect({ sceneClock: 1, sameScene: false, timeAdvanceDelta: 1 })).toBeNull();
  });

  it("returns scene.time-shifted before threshold", () => {
    expect(resolveSceneTimeEffect({ sceneClock: 1, sameScene: true, timeAdvanceDelta: 1 })).toBe("scene.time-shifted");
  });

  it("returns scene.window-narrowed after threshold", () => {
    expect(resolveSceneTimeEffect({ sceneClock: 4, sameScene: true, timeAdvanceDelta: 1 })).toBe("scene.window-narrowed");
  });
});
