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
  }
  if (flags["crate.weakened"]) {
    world.push("The crate structure is compromised");
    opportunities.push("Crate is weakened and can be pried");
  }
  if (flags["container.crate_open"]) {
    world.push("The crate has been opened");
    opportunities.push("Opened crate may contain useful items");
    careNow.push("Crate can now be searched");
  }

  if (danger !== null && danger >= 20) {
    careNow.push("Danger is high");
  } else if (danger !== null && danger >= 12) {
    careNow.push("Danger is elevated");
  }
  if (noise !== null && noise >= 25) {
    careNow.push("Noise is drawing attention");
  } else if (noise !== null && noise >= 15) {
    careNow.push("Noise is rising");
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
