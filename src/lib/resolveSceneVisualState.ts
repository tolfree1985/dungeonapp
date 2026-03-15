export type PressureStage = "calm" | "tension" | "danger" | "crisis";
export type LightingState = "stable" | "dim" | "flickering" | "failing";
export type AtmosphereState = "still" | "disturbed" | "tense" | "chaotic";
export type EnvironmentWear = "intact" | "disturbed" | "strained" | "breaking";
export type ThreatPresence = "absent" | "distant" | "nearby" | "imminent";

export type SceneVisualState = {
  locationId: string;
  timeValue: string;
  pressureStage: PressureStage;
  lightingState: LightingState;
  atmosphereState: AtmosphereState;
  environmentWear: EnvironmentWear;
  threatPresence: ThreatPresence;
};

export type VisualStateDelta = {
  key: "lighting" | "atmosphere" | "wear" | "threat";
  from: string;
  to: string;
  message: string;
};

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LooseRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizePressureStage(value: unknown): PressureStage {
  switch (value) {
    case "calm":
    case "tension":
    case "danger":
    case "crisis":
      return value;
    default:
      return "calm";
  }
}

function resolveTimeValue(stats: LooseRecord, state: LooseRecord): string {
  const timeOfDay = asString(state.timeOfDay) ?? asString(state.timeText);
  if (timeOfDay) return timeOfDay;
  const statsTime = asNumber(stats.time);
  if (statsTime !== null) return String(statsTime);
  return "Unknown time";
}

function resolveLightingState(pressureStage: PressureStage, heat: number): LightingState {
  if (pressureStage === "crisis") return "failing";
  if (pressureStage === "danger") return "flickering";
  if (pressureStage === "tension") return heat >= 6 ? "flickering" : "dim";
  return "stable";
}

function resolveAtmosphereState(
  pressureStage: PressureStage,
  noise: number,
  alert: number
): AtmosphereState {
  if (pressureStage === "crisis") return "chaotic";
  if (pressureStage === "danger") return "tense";
  if (noise > 0 || alert >= 3) return "disturbed";
  return "still";
}

function resolveEnvironmentWear(heat: number, noise: number): EnvironmentWear {
  if (heat >= 8) return "breaking";
  if (heat >= 5) return "strained";
  if (noise > 0) return "disturbed";
  return "intact";
}

function resolveThreatPresence(alert: number, pressureStage: PressureStage): ThreatPresence {
  if (alert >= 8 || pressureStage === "crisis") return "imminent";
  if (alert >= 5 || pressureStage === "danger") return "nearby";
  if (alert >= 2 || pressureStage === "tension") return "distant";
  return "absent";
}

export function resolveSceneVisualState(stateInput: LooseRecord | null | undefined): SceneVisualState {
  const state = asRecord(stateInput);
  const stats = asRecord(state.stats);

  const locationId =
    asString(state.location) ?? asString(stats.location) ?? "unknown_location";

  const pressureStage = normalizePressureStage(
    state.pressureStage ?? state.pressure ?? stats.pressureStage
  );

  const heat = asNumber(stats.heat) ?? 0;
  const noise = asNumber(stats.noise) ?? 0;
  const alert = asNumber(stats.alert) ?? 0;

  return {
    locationId,
    timeValue: resolveTimeValue(stats, state),
    pressureStage,
    lightingState: resolveLightingState(pressureStage, heat),
    atmosphereState: resolveAtmosphereState(pressureStage, noise, alert),
    environmentWear: resolveEnvironmentWear(heat, noise),
    threatPresence: resolveThreatPresence(alert, pressureStage),
  };
}

export function diffSceneVisualState(
  prev: SceneVisualState | null,
  next: SceneVisualState,
  options?: { includeWear?: boolean }
): VisualStateDelta[] {
  if (!prev) return [];
  const deltas: VisualStateDelta[] = [];
  if (prev.lightingState !== next.lightingState) {
    deltas.push({
      key: "lighting",
      from: prev.lightingState,
      to: next.lightingState,
      message: `Lighting shifted to ${next.lightingState}.`,
    });
  }
  if (prev.atmosphereState !== next.atmosphereState) {
    deltas.push({
      key: "atmosphere",
      from: prev.atmosphereState,
      to: next.atmosphereState,
      message: `Atmosphere became ${next.atmosphereState}.`,
    });
  }
  if ((options?.includeWear ?? false) && prev.environmentWear !== next.environmentWear) {
    deltas.push({
      key: "wear",
      from: prev.environmentWear,
      to: next.environmentWear,
      message: `The environment shows ${next.environmentWear} wear.`,
    });
  }
  if (prev.threatPresence !== next.threatPresence) {
    deltas.push({
      key: "threat",
      from: prev.threatPresence,
      to: next.threatPresence,
      message: `Threat presence escalated to ${next.threatPresence}.`,
    });
  }
  return deltas;
}
