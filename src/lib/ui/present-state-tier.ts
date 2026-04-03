export type StateTier = "Low" | "Moderate" | "High" | "Extreme";

export function presentAlertTier(alert: number): StateTier {
  if (alert < 200) return "Low";
  if (alert < 600) return "Moderate";
  if (alert < 1000) return "High";
  return "Extreme";
}

export function presentHeatTier(heat: number): StateTier {
  if (heat < 200) return "Low";
  if (heat < 600) return "Moderate";
  if (heat < 1000) return "High";
  return "Extreme";
}

export function presentNoiseTier(noise: number): StateTier {
  if (noise <= 2) return "Low";
  if (noise <= 5) return "Moderate";
  if (noise <= 8) return "High";
  return "Extreme";
}

export function presentTrustTier(trust: number): StateTier {
  if (trust < 200) return "Low";
  if (trust < 600) return "Moderate";
  if (trust < 1000) return "High";
  return "Extreme";
}

export function presentDangerTier(danger: number): StateTier {
  if (danger < 200) return "Low";
  if (danger < 600) return "Moderate";
  if (danger < 1000) return "High";
  return "Extreme";
}

export function presentSuspicionTier(suspicion: number): StateTier {
  if (suspicion < 200) return "Low";
  if (suspicion < 600) return "Moderate";
  if (suspicion < 1000) return "High";
  return "Extreme";
}

export function presentOverallRiskTier(args: { alert: number; noise: number; heat: number }): StateTier {
  const score = args.alert * 0.45 + args.heat * 0.45 + args.noise * 25;
  if (score < 200) return "Low";
  if (score < 600) return "Moderate";
  if (score < 1000) return "High";
  return "Extreme";
}
