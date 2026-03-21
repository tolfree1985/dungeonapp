import { describe, expect, it } from "vitest";
import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";
import type { FailForwardSignal } from "@/server/scene/scene-transition-pressure";
import { resolveFailForwardComplication } from "@/server/scene/fail-forward-complication";

function buildSignal(overrides: Partial<FailForwardSignal>): FailForwardSignal {
  return {
    active: overrides.active ?? true,
    reason: overrides.reason ?? "failforward.test",
    pressure: overrides.pressure ?? 4,
    severity: overrides.severity ?? "medium",
  };
}

describe("resolveFailForwardComplication", () => {
  it("returns noise-increased for active conflict pressure", () => {
    const signal = buildSignal({ severity: "medium", pressure: 4 });
    const result = resolveFailForwardComplication({
      signal,
      encounterPhase: "conflict",
      deltaKind: "partial",
      pressure: 4,
    });
    expect(result).toBe("noise-increased");
  });

  it("returns time-lost in aftermath when fail-forward remains active", () => {
    const signal = buildSignal({ severity: "low", pressure: 3 });
    const result = resolveFailForwardComplication({
      signal,
      encounterPhase: "aftermath",
      deltaKind: "partial",
      pressure: 3,
    });
    expect(result).toBe("time-lost");
  });

  it("returns null when the signal is inactive", () => {
    const signal = buildSignal({ active: false, severity: "none", pressure: 0 });
    const result = resolveFailForwardComplication({
      signal,
      encounterPhase: "conversation",
      deltaKind: "none",
      pressure: 0,
    });
    expect(result).toBeNull();
  });

  it("is deterministic for identical inputs", () => {
    const signal = buildSignal({ severity: "medium", pressure: 3 });
    const input = {
      signal,
      encounterPhase: "conflict" as SceneIdentity["encounterPhase"],
      deltaKind: "partial" as SceneDeltaKind,
      pressure: 3,
    } as const;
    expect(resolveFailForwardComplication(input)).toBe(resolveFailForwardComplication(input));
  });
});
