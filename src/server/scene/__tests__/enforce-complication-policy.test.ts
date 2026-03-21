import { describe, expect, it } from "vitest";
import { enforceComplicationPolicy } from "@/server/scene/enforce-complication-policy";

describe("enforceComplicationPolicy", () => {
  it("does nothing when forced count is satisfied", () => {
    const result = enforceComplicationPolicy({
      finalizedComplications: ["noise.escalation", "npc.suspicion"],
      forcedComplicationCount: 2,
    });
    expect(result.policyApplied).toBe(false);
    expect(result.finalizedComplications).toEqual(["noise.escalation", "npc.suspicion"]);
  });

  it("adds unique fallbacks before duplicating", () => {
    const result = enforceComplicationPolicy({
      finalizedComplications: ["complication-applied"],
      forcedComplicationCount: 4,
    });
    expect(result.policyApplied).toBe(true);
    expect(result.finalizedComplications.length).toBe(4);
    expect(new Set(result.finalizedComplications).size).toBeGreaterThanOrEqual(2);
  });

  it("duplicates fallbacks only after pool exhausted", () => {
    const result = enforceComplicationPolicy({
      finalizedComplications: [],
      forcedComplicationCount: 7,
    });
    expect(result.policyApplied).toBe(true);
    expect(result.finalizedComplications.length).toBe(7);
    expect(result.finalizedComplications.slice(0, 5)).toEqual([
      "complication-applied",
      "noise.escalation",
      "npc.suspicion",
      "position.penalty",
      "time.scene-prolonged",
    ]);
  });
});
