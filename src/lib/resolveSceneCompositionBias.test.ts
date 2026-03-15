import { describe, expect, it } from "vitest";
import { resolveSceneCompositionBias } from "@/lib/resolveSceneCompositionBias";

describe("resolveSceneCompositionBias", () => {
  it("returns centered balance for close shots", () => {
    const bias = resolveSceneCompositionBias({
      framingState: { frameKind: "investigation_focus", shotScale: "close", subjectFocus: "detail", cameraAngle: "level" },
      visualState: { locationId: "room", timeValue: "night", pressureStage: "tension", lightingState: "even", atmosphereState: "still", environmentWear: "intact", threatPresence: "distant" },
      focusState: { focusType: "detail", focusId: "stone", focusLabel: "Stone" },
    });
    expect(bias.balance).toBe("centered");
    expect(bias.depth).toBe("layered");
    expect(bias.density).toBe("sparse");
  });

  it("returns diagonal/deep/crowded for threat focus and harsh wear", () => {
    const bias = resolveSceneCompositionBias({
      framingState: { frameKind: "threat_focus", shotScale: "medium", subjectFocus: "threat", cameraAngle: "low" },
      visualState: { locationId: "room", timeValue: "night", pressureStage: "danger", lightingState: "flickering", atmosphereState: "tense", environmentWear: "breaking", threatPresence: "imminent" },
      focusState: { focusType: "threat", focusId: "guard", focusLabel: "Guard" },
    });
    expect(bias.balance).toBe("diagonal");
    expect(bias.depth).toBe("deep");
    expect(bias.density).toBe("crowded");
  });
});
