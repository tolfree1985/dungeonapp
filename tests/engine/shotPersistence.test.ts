import { describe, expect, it } from "vitest";
import { persistShot } from "@/engine/shotPersistence";

describe("persistShot", () => {
  it("increments duration when shot persists", () => {
    const result = persistShot({
      previousShotKey: "shot1",
      currentShotKey: "shot1",
      previousShotDuration: 3,
      shotPersisted: true,
    });

    expect(result.shotDuration).toBe(4);
    expect(result.shotPersisted).toBe(true);
  });

  it("resets duration when the shot changes", () => {
    const result = persistShot({
      previousShotKey: "shot1",
      currentShotKey: "shot2",
      previousShotDuration: 3,
      shotPersisted: false,
    });

    expect(result.shotDuration).toBe(1);
    expect(result.shotPersisted).toBe(false);
  });
});
