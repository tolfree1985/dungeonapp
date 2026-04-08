type StateSummaryInput = {
  flags?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
};

export type StateSummaryBucket = {
  careNow: string[];
  world: string[];
  opportunities: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizedFlags(flags?: Record<string, unknown> | null): Record<string, boolean> {
  if (!flags) return {};
  const normalized: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === "boolean") {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function buildStateSummary(input: StateSummaryInput): StateSummaryBucket {
  const careNow: string[] = [];
  const world: string[] = [];
  const opportunities: string[] = [];
  const flags = normalizedFlags(input.flags);

  const noise = toNumber(input.stats?.noise);
  const danger = toNumber(input.stats?.heat);
  const time = toNumber(input.stats?.time);

  if (flags["scene.fire"]) {
    world.push("Chamber fire remains active");
    if (flags["fabric.oiled"] || flags["scene.fire.accelerant"]) {
      careNow.push("Fire is spreading rapidly");
    } else {
      careNow.push("Fire is active nearby");
    }
  }
  if (flags["fabric.oiled"]) {
    world.push("Tapestry is oil-soaked");
    opportunities.push("The oil can be ignited");
    careNow.push("Oil makes the floor slick and volatile");
  }
  if (flags["crate.weakened"]) {
    world.push("The crate structure is compromised");
    opportunities.push("Crate is weakened and can be pried");
    careNow.push("The weakened crate draws your attention");
  }
  if (flags["container.crate_open"]) {
    world.push("The crate has been opened");
    opportunities.push("Opened crate may contain useful items");
    careNow.push("Crate can now be searched");
  }

  if (flags["scene.fire.accelerant"]) {
    world.push("Oil-fed flames race through the chamber");
    careNow.push("Oil-fed fire is spreading faster than normal");
  }

  if (danger !== null && danger >= 25) {
    careNow.push("Danger is critical");
    world.push("The chamber is dangerously hot");
    opportunities.push("The heat could force a retreat");
  } else if (danger !== null && danger >= 15) {
    careNow.push("Danger is elevated");
    world.push("The room feels increasingly hostile");
  }
  if (noise !== null && noise >= 25) {
    careNow.push("Noise is drawing attention");
    opportunities.push("Someone may be tracking the sound");
  } else if (noise !== null && noise >= 15) {
    careNow.push("Noise is rising");
  }
  const alert = toNumber(input.stats?.alert);
  if (alert !== null && alert >= 2) {
    careNow.push("Alertness is elevated");
  }
  if (time !== null && time >= 30) {
    careNow.push("Time pressure is critical");
  } else if (time !== null && time >= 15) {
    careNow.push("Time pressure is building");
  }

  const dedupe = (list: string[]) => [...new Set(list)].slice(0, 3);
  const summary: StateSummaryBucket = {
    careNow: dedupe(careNow),
    world: dedupe(world),
    opportunities: dedupe(opportunities),
  };
  return summary;
}

export type { StateSummaryInput };
