// Sole canonical phrasing registry for mechanic facts.
// Presentation layers should key into this instead of inventing local copy.
export type CanonicalFactKey =
  | "alert_state"
  | "exposure_risk"
  | "fire_active"
  | "fire_burned_out"
  | "fire_oiled"
  | "noise_state"
  | "search_active";

export type CanonicalFactText = {
  achieved?: string;
  careNow: string;
  world?: string;
  opportunity?: string;
  turnChange?: string;
  persistent?: string;
};

export const FACT_TEXT: Record<CanonicalFactKey, CanonicalFactText> = {
  alert_state: {
    careNow: "Enemies are on alert.",
    world: "Guards are alert.",
    turnChange: "Alertness rose.",
  },
  exposure_risk: {
    careNow: "Your position is exposed.",
    world: "Your position is known.",
    turnChange: "Position exposed.",
  },
  fire_active: {
    achieved: "Oil ignited.",
    careNow: "Flames are spreading.",
    world: "Fire is burning.",
    turnChange: "Fire intensified.",
  },
  fire_burned_out: {
    careNow: "Fire is out.",
    world: "Fire is out.",
    turnChange: "Fire went out.",
  },
  fire_oiled: {
    achieved: "You spread oil.",
    careNow: "Oil coats the floor.",
    world: "Oil coats the floor.",
    opportunity: "Ignite the oil.",
    turnChange: "Oil spread.",
  },
  noise_state: {
    careNow: "Noise is rising.",
    world: "Noise lingers.",
    turnChange: "Noise increased.",
  },
  search_active: {
    careNow: "Enemies are searching.",
    world: "Guards are searching.",
  },
};

export function getCanonicalFactText(key: CanonicalFactKey, bucket: keyof CanonicalFactText): string {
  const entry = FACT_TEXT[key];
  if (!entry) {
    throw new Error(`Missing canonical fact text for key: ${key}`);
  }
  return entry[bucket] ?? entry.careNow;
}
