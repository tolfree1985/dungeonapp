import { describe, expect, it } from "vitest";
import { presentAlertTier, presentHeatTier, presentNoiseTier, presentTrustTier } from "./present-state-tier";
import { presentOverallRiskTier } from "./present-state-tier";

describe("present state tier helpers", () => {
  it("maps alert into semantic tiers", () => {
    expect(presentAlertTier(0)).toBe("Low");
    expect(presentAlertTier(250)).toBe("Moderate");
    expect(presentAlertTier(900)).toBe("High");
    expect(presentAlertTier(1200)).toBe("Extreme");
  });

  it("maps heat into semantic tiers", () => {
    expect(presentHeatTier(50)).toBe("Low");
    expect(presentHeatTier(500)).toBe("Moderate");
    expect(presentHeatTier(800)).toBe("High");
    expect(presentHeatTier(1500)).toBe("Extreme");
  });

  it("maps noise into semantic tiers", () => {
    expect(presentNoiseTier(1)).toBe("Low");
    expect(presentNoiseTier(4)).toBe("Moderate");
    expect(presentNoiseTier(7)).toBe("High");
    expect(presentNoiseTier(10)).toBe("Extreme");
  });

  it("maps trust into semantic tiers", () => {
    expect(presentTrustTier(100)).toBe("Low");
    expect(presentTrustTier(400)).toBe("Moderate");
    expect(presentTrustTier(700)).toBe("High");
    expect(presentTrustTier(1300)).toBe("Extreme");
  });

  it("computes an overall risk tier", () => {
    expect(presentOverallRiskTier({ alert: 100, noise: 1, heat: 80 })).toBe("Low");
    expect(presentOverallRiskTier({ alert: 300, noise: 3, heat: 500 })).toBe("Moderate");
    expect(presentOverallRiskTier({ alert: 800, noise: 6, heat: 900 })).toBe("High");
    expect(presentOverallRiskTier({ alert: 1200, noise: 9, heat: 1100 })).toBe("Extreme");
  });
});
