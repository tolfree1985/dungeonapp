import { describe, expect, it } from "vitest";
import { resolveNpcSuspicionEffect } from "@/server/scene/npc-suspicion-effects";

describe("resolveNpcSuspicionEffect", () => {
  it("returns null for zero suspicion", () => {
    expect(resolveNpcSuspicionEffect(0)).toBeNull();
  });

  it("returns npc.suspicious for 1", () => {
    expect(resolveNpcSuspicionEffect(1)).toBe("npc.suspicious");
  });

  it("returns npc.alerted for 2", () => {
    expect(resolveNpcSuspicionEffect(2)).toBe("npc.alerted");
  });

  it("returns npc.hostile-watch for 3+", () => {
    expect(resolveNpcSuspicionEffect(3)).toBe("npc.hostile-watch");
    expect(resolveNpcSuspicionEffect(5)).toBe("npc.hostile-watch");
  });
});
