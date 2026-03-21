import type { SceneIdentity } from "@/server/scene/scene-identity";
import type { SceneDeltaKind } from "@/lib/resolveSceneDeltaKind";

export type SceneTransitionPressureResult = {
  pressureDelta: number;
  reason: string | null;
};

export function describeScenePressureChange(params: {
  previous: SceneIdentity | null;
  current: SceneIdentity;
  deltaKind: SceneDeltaKind;
}): SceneTransitionPressureResult {
  const { previous, current, deltaKind } = params;
  if (!previous || deltaKind === "none") {
    return { pressureDelta: 0, reason: null };
  }

  if (previous.encounterPhase === "conversation" && current.encounterPhase === "conflict") {
    return { pressureDelta: 1, reason: "phase.escalation.conflict" };
  }

  if (previous.encounterPhase === "conflict" && current.encounterPhase === "aftermath") {
    return { pressureDelta: -1, reason: "phase.deescalation.aftermath" };
  }

  if (
    deltaKind === "full" &&
    previous.locationKey !== current.locationKey &&
    current.encounterPhase === "conflict"
  ) {
    return { pressureDelta: 1, reason: "location.move.conflict" };
  }

  return { pressureDelta: 0, reason: null };
}

export type FailForwardSignal = {
  active: boolean;
  reason: string | null;
  pressure: number;
  severity: "none" | "low" | "medium" | "high";
};

const severityOrder: FailForwardSignal["severity"][] = ["none", "low", "medium", "high"];

function severityFromPressure(pressure: number): FailForwardSignal["severity"] {
  if (pressure >= 5) return "high";
  if (pressure >= 3) return "medium";
  if (pressure >= 1) return "low";
  return "none";
}

function bumpSeverity(severity: FailForwardSignal["severity"]): FailForwardSignal["severity"] {
  const idx = severityOrder.indexOf(severity);
  return severityOrder[Math.min(severityOrder.length - 1, idx + 1)];
}

function clampSeverity(severity: FailForwardSignal["severity"]): FailForwardSignal["severity"] {
  return severityOrder[Math.max(0, severityOrder.indexOf(severity))];
}

export function describeFailForwardSignal(params: {
  pressure: number;
  previousPressure: number;
  deltaKind: SceneDeltaKind;
  currentPhase: SceneIdentity["encounterPhase"];
  previousPhase: SceneIdentity["encounterPhase"] | null;
}): FailForwardSignal {
  const { pressure, previousPressure, deltaKind, currentPhase, previousPhase } = params;
  const baseSeverity = severityFromPressure(pressure);
  if (baseSeverity === "none") {
    return { active: false, reason: null, pressure, severity: "none" };
  }

  let severity = baseSeverity;
  if (deltaKind === "full" && currentPhase === "conflict" && pressure > previousPressure) {
    severity = bumpSeverity(severity);
  }
  if (deltaKind === "partial" && pressure < previousPressure) {
    severity = clampSeverity(severity);
  }

  const reason = `failforward.pressure.${severity}`;
  return { active: severity !== "none", reason, pressure, severity };
}
