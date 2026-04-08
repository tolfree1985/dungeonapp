export type FactBucket =
  | "achieved"
  | "costs"
  | "turnChanges"
  | "persistent"
  | "careNow"
  | "world"
  | "opportunities";

export type FactKind = "hazard" | "pressure" | "progress" | "opportunity" | "cost" | "info";

export type FactSeverity = "low" | "medium" | "high";

export type FactLine = {
  id: string;
  text: string;
  bucket: FactBucket;
  kind?: FactKind;
  severity?: FactSeverity;
  priority?: number;
  source?: "flag" | "delta" | "ledger" | "stats";
};

export type MechanicFacts = {
  achieved: FactLine[];
  costs: FactLine[];
  turnChanges: FactLine[];
  persistent: FactLine[];
  careNow: FactLine[];
  world: FactLine[];
  opportunities: FactLine[];
};

type MechanicFactsInput = {
  stateFlags?: Record<string, unknown> | null;
  stateDeltas?: unknown[];
  ledgerAdds?: unknown[];
  stats?: Record<string, unknown> | null;
};

type PressureDomain = "danger" | "noise" | "time" | "suspicion";
type PressureCostDefinition = {
  costText: string;
  turnText: string;
  careText: string;
  severity: FactSeverity;
  priority: number;
};

const PRESSURE_COST_DEFINITIONS: Record<PressureDomain, PressureCostDefinition> = {
  danger: {
    costText: "Danger increased.",
    turnText: "Danger increased.",
    careText: "Danger surges nearby; move with focused intent.",
    severity: "high",
    priority: 90,
  },
  noise: {
    costText: "Noise increased.",
    turnText: "Noise increased.",
    careText: "Noise is rising around you; silence now matters.",
    severity: "medium",
    priority: 60,
  },
  time: {
    costText: "Time advanced.",
    turnText: "Time advanced.",
    careText: "Time slips away faster than expected.",
    severity: "medium",
    priority: 50,
  },
  suspicion: {
    costText: "Suspicion tightened.",
    turnText: "Suspicion tightened.",
    careText: "Eyes linger on you; suspicion is growing.",
    severity: "medium",
    priority: 70,
  },
};

const PRESSURE_DOMAIN_SYNONYMS: Record<string, PressureDomain> = {
  heat: "danger",
  "npc suspicion": "suspicion",
};

const LEDGER_PRESSURE_KEYWORDS: Array<{ domain: PressureDomain; keywords: string[] }> = [
  { domain: "danger", keywords: ["danger", "heat", "fire", "threat", "burn", "pressure"] },
  { domain: "noise", keywords: ["noise", "sound", "attention", "watchfulness", "clatter", "drum"] },
  { domain: "time", keywords: ["time", "delay", "turn", "clock", "minute", "wait", "waiting"] },
  { domain: "suspicion", keywords: ["suspicion", "alert", "watchful", "npc suspicion", "eyes"] },
];

const canonicalPressureDomain = (value: string): PressureDomain | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  const mapped = PRESSURE_DOMAIN_SYNONYMS[normalized];
  if (mapped) return mapped;
  if (normalized in PRESSURE_COST_DEFINITIONS) {
    return normalized as PressureDomain;
  }
  const looseMatch = Object.keys(PRESSURE_COST_DEFINITIONS).find((candidate) => normalized.includes(candidate));
  if (looseMatch) return looseMatch as PressureDomain;
  return null;
};

const detectLedgerPressureDomain = (message: string): PressureDomain | null => {
  for (const candidate of LEDGER_PRESSURE_KEYWORDS) {
    if (candidate.keywords.some((keyword) => message.includes(keyword))) {
      return candidate.domain;
    }
  }
  return null;
};

const numberFrom = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const normalizeFlags = (flags?: Record<string, unknown> | null): Record<string, boolean> => {
  if (!flags) return {};
  const normalized: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    normalized[key] = Boolean(value);
  }
  return normalized;
};

const collectLedgerTexts = (ledgerAdds?: unknown[]): string[] => {
  if (!Array.isArray(ledgerAdds)) return [];
  const texts: string[] = [];
  for (const entry of ledgerAdds) {
    if (!entry) continue;
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) texts.push(trimmed);
      continue;
    }
    if (typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const candidate =
        (typeof record.effect === "string" && record.effect) ||
        (typeof record.text === "string" && record.text) ||
        (typeof record.message === "string" && record.message) ||
        "";
      if (candidate.trim()) {
        texts.push(candidate.trim());
      }
    }
  }
  return texts;
};

const includesAll = (text: string, keywords: string[]): boolean =>
  keywords.every((keyword) => text.includes(keyword));

function pushFact(
  facts: MechanicFacts,
  seen: Record<FactBucket, Set<string>>,
  line: FactLine
) {
  const bucketSet = seen[line.bucket];
  if (bucketSet.has(line.id)) return;
  bucketSet.add(line.id);
  facts[line.bucket].push(line);
}

export function deriveMechanicFacts({
  stateFlags,
  stateDeltas,
  ledgerAdds,
  stats,
}: MechanicFactsInput): MechanicFacts {
  const facts: MechanicFacts = {
    achieved: [],
    costs: [],
    turnChanges: [],
    persistent: [],
    careNow: [],
    world: [],
    opportunities: [],
  };
  const seen: Record<FactBucket, Set<string>> = {
    achieved: new Set(),
    costs: new Set(),
    turnChanges: new Set(),
    persistent: new Set(),
    careNow: new Set(),
    world: new Set(),
    opportunities: new Set(),
  };

  const flags = normalizeFlags(stateFlags);
  const statMap = stats ?? {};

  const deltaKeys =
    Array.isArray(stateDeltas) && stateDeltas.length > 0
      ? stateDeltas
          .filter(
            (delta): delta is { kind: string; key?: string; value?: unknown } =>
              Boolean(delta && typeof delta === "object" && typeof (delta as Record<string, unknown>).kind === "string"),
          )
          .filter((delta) => delta.kind === "flag.set" && typeof delta.key === "string")
          .map((delta) => ({ key: delta.key, value: delta.value }))
      : [];
  console.log(
    "mechanic.truth.input",
    JSON.stringify(
      {
        deltaKeys,
        ledgerAdds,
      },
      null,
      2,
    ),
  );

  const deriveFlagKeys =
    Array.isArray(stateDeltas) && stateDeltas.length > 0
      ? stateDeltas
          .filter(
            (delta): delta is { kind: string; key?: string } =>
              Boolean(delta && typeof delta === "object" && typeof (delta as Record<string, unknown>).kind === "string"),
          )
          .filter((delta) => delta.kind === "flag.set" && typeof delta.key === "string")
          .map((delta) => delta.key)
      : [];
  const ledgerTexts = collectLedgerTexts(ledgerAdds);
  console.log(
    "mechanic.truth.derive_input",
    JSON.stringify(
      {
        flagKeys: deriveFlagKeys,
        ledgerTexts,
      },
      null,
      2,
    ),
  );

  const lookupStat = (keys: string[]): number | null => {
    for (const key of keys) {
      const value = statMap[key];
      const normalized = numberFrom(value);
      if (normalized !== null) return normalized;
    }
    return null;
  };

  const addOilFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "oil_turn",
      text: "Oil spreads across the floor.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "medium",
      priority: 80,
      source,
    });
    pushFact(facts, seen, {
      id: "oil_achieved",
      text: "You spread the oil.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "oil_world",
      text: "Oil coats the floor.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "fabric_persistent",
      text: "The fabric remains saturated with oil.",
      bucket: "persistent",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "oil_opportunity",
      text: "The oil can be ignited.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 50,
      source,
    });
    pushFact(facts, seen, {
      id: "oil_care",
      text: "The floor is slick and volatile.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      source,
    });
  };

  const addFireFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "fire_turn",
      text: "Flames take hold.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "high",
      priority: 90,
      source,
    });
    pushFact(facts, seen, {
      id: "fire_achieved",
      text: "You ignited the oil.",
      bucket: "achieved",
      kind: "progress",
      severity: "high",
      priority: 80,
      source,
    });
    pushFact(facts, seen, {
      id: "fire_persistent",
      text: "The chamber is on fire.",
      bucket: "persistent",
      kind: "hazard",
      severity: "high",
      priority: 100,
      source,
    });
    pushFact(facts, seen, {
      id: "fire_world",
      text: "The chamber is on fire.",
      bucket: "world",
      kind: "info",
      severity: "high",
      source,
    });
    pushFact(facts, seen, {
      id: "active_fire",
      text: "Fire is spreading nearby.",
      bucket: "careNow",
      kind: "hazard",
      severity: "high",
      source,
    });
  };

  const addFireAccelerantFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "fire_accelerant",
      text: "Oil-fed fire is spreading faster than normal.",
      bucket: "careNow",
      kind: "hazard",
      severity: "high",
      priority: 95,
      source,
    });
    pushFact(facts, seen, {
      id: "fire_accelerant_world",
      text: "Oil-fed flames race through the chamber.",
      bucket: "world",
      kind: "info",
      severity: "high",
      source,
    });
  };

  const addCrateWeakenFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "crate_weakened",
      text: "You weakened the crate.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 75,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_weakened_turn",
      text: "The crate structure weakens.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_weakened_world",
      text: "The crate is weakened.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "crate_pry_opportunity",
      text: "The weakened crate can be pried open.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 60,
      source,
    });
  };

  const addCrateOpenedFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "crate_opened",
      text: "The crate was opened.",
      bucket: "achieved",
      kind: "progress",
      severity: "high",
      priority: 90,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_opened_turn",
      text: "The crate opens this turn.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "high",
      priority: 85,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_open_world",
      text: "The crate lies open.",
      bucket: "world",
      kind: "info",
      severity: "high",
      source,
    });
    pushFact(facts, seen, {
      id: "crate_searchable",
      text: "The crate contents can be searched.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 65,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_open_persistent",
      text: "The crate is open.",
      bucket: "persistent",
      kind: "info",
      severity: "medium",
      priority: 80,
      source,
    });
  };

  const addDoorActionFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "door_force_achieved",
      text: "You forced the door open.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 90,
      source,
    });
    pushFact(facts, seen, {
      id: "door_force_world",
      text: "The door hangs crooked on its hinges.",
      bucket: "world",
      kind: "info",
      severity: "high",
      source,
    });
    pushFact(facts, seen, {
      id: "door_force_persistent",
      text: "The room is exposed.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 60,
      source,
    });
    pushFact(facts, seen, {
      id: "door_force_opportunity",
      text: "The next room can be entered.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 70,
      source,
    });
  };

  const addRoomSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "room_search_achieved",
      text: "You found something useful.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 80,
      source,
    });
    pushFact(facts, seen, {
      id: "room_search_world",
      text: "A hidden compartment is revealed.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "room_search_persistent",
      text: "The room has been disturbed.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 50,
      source,
    });
    pushFact(facts, seen, {
      id: "room_search_opportunity",
      text: "The compartment can be opened.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 55,
      source,
    });
  };

  const addDeskSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "desk_search_achieved",
      text: "You uncovered a useful detail in the desk.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 75,
      source,
    });
    pushFact(facts, seen, {
      id: "desk_search_world",
      text: "The desk has been disturbed.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "desk_search_persistent",
      text: "The workspace remains unsettled.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 45,
      source,
    });
    pushFact(facts, seen, {
      id: "desk_search_opportunity",
      text: "The hidden drawer invites further inspection.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 50,
      source,
    });
  };

  const addDrawerPulledFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "drawer_pulled_achieved",
      text: "The drawer slides open, revealing a narrow cavity.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "drawer_pulled_world",
      text: "The revealed cavity shifts the room’s layout.",
      bucket: "world",
      kind: "info",
      severity: "low",
      source,
    });
    pushFact(facts, seen, {
      id: "drawer_pulled_persistent",
      text: "The drawer is now misaligned.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 40,
      source,
    });
    pushFact(facts, seen, {
      id: "drawer_pulled_opportunity",
      text: "The cavity can be scoured for secrets.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 45,
      source,
    });
  };

  const addChairMovedFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "chair_moved_achieved",
      text: "You reposition the chair and expose a new angle.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 65,
      source,
    });
    pushFact(facts, seen, {
      id: "chair_moved_world",
      text: "The chair now blocks a different line of sight.",
      bucket: "world",
      kind: "info",
      severity: "low",
      source,
    });
    pushFact(facts, seen, {
      id: "chair_moved_persistent",
      text: "The floor stays scuffed where the chair was dragged.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 40,
      source,
    });
    pushFact(facts, seen, {
      id: "chair_moved_opportunity",
      text: "The gap beneath the chair can be used next.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 40,
      source,
    });
  };

  const addCabinetTippedFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "cabinet_tipped_achieved",
      text: "You tip the cabinet.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "cabinet_tipped_world",
      text: "The cabinet leans and its contents spill out.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "cabinet_tipped_persistent",
      text: "The cabinet remains askew.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 45,
      source,
    });
    pushFact(facts, seen, {
      id: "cabinet_tipped_opportunity",
      text: "The toppled shelf reveals a new opening.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 50,
      source,
    });
  };

  const addCrateInspectFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "crate_inspect_achieved",
      text: "You identified a weak point.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 80,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_inspect_world",
      text: "The crate creaks under the attention.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "crate_inspect_persistent",
      text: "The crate remains rattled.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 60,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_inspect_opportunity",
      text: "The weak plank can be pried aside.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 65,
      source,
    });
  };

  const addCrateSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "crate_search_achieved",
      text: "You found something useful inside the crate.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 85,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_search_world",
      text: "The crate contents glimmer in the light.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "crate_search_persistent",
      text: "The crate remains open.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      priority: 60,
      source,
    });
    pushFact(facts, seen, {
      id: "crate_search_opportunity",
      text: "The contents can now be handled.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 60,
      source,
    });
  };

  const deltaRecords = Array.isArray(stateDeltas) ? stateDeltas : [];
  const pressureDomainsThisTurn = new Set<PressureDomain>();
  const addPressureDomainFacts = (domain: PressureDomain, source: FactLine["source"]) => {
    const definition = PRESSURE_COST_DEFINITIONS[domain];
    if (!definition) return;
    pushFact(facts, seen, {
      id: `pressure_cost_${domain}`,
      text: definition.costText,
      bucket: "costs",
      kind: "cost",
      severity: definition.severity,
      priority: definition.priority,
      source,
    });
    pushFact(facts, seen, {
      id: `pressure_turn_${domain}`,
      text: definition.turnText,
      bucket: "turnChanges",
      kind: "hazard",
      severity: definition.severity,
      priority: definition.priority,
      source,
    });
    pushFact(facts, seen, {
      id: `pressure_care_${domain}`,
      text: definition.careText,
      bucket: "careNow",
      kind: "hazard",
      severity: definition.severity,
      priority: Math.max(definition.priority - 10, 20),
      source,
    });
  };

  for (const delta of deltaRecords) {
    if (!delta || typeof delta !== "object") continue;
    const record = delta as Record<string, unknown>;
    const rawKey = typeof record.key === "string" ? record.key : "";
    const key = rawKey.toLowerCase();
    const nextValue = record.next ?? record.value;
    const truthy = nextValue === true;

    if (record.kind === "flag.set" && rawKey === "oilSpread" && truthy) {
      addOilFacts("delta");
      continue;
    }
    if (record.kind === "flag.set" && rawKey === "fireStarted" && truthy) {
      addFireFacts("delta");
      continue;
    }
    if (record.kind === "flag.set" && rawKey === "crateWeakened" && truthy) {
      addCrateWeakenFacts("delta");
      continue;
    }
    if (record.kind === "flag.set" && rawKey === "crateOpened" && truthy) {
      addCrateOpenedFacts("delta");
      continue;
    }

    if (record.kind === "flag.set" && typeof rawKey === "string") {
      const normalizedKey = rawKey.toLowerCase();
      if (normalizedKey.includes("door.kicked") || normalizedKey.includes("door.forced")) {
        addDoorActionFacts("delta");
      }
      if (normalizedKey.includes("room.searched")) {
        addRoomSearchFacts("delta");
      }
      if (normalizedKey.includes("desk.searched")) {
        addDeskSearchFacts("delta");
      }
      if (normalizedKey.includes("drawer.pulled")) {
        addDrawerPulledFacts("delta");
      }
      if (normalizedKey.includes("chair.moved")) {
        addChairMovedFacts("delta");
      }
      if (normalizedKey.includes("cabinet.tipped")) {
        addCabinetTippedFacts("delta");
      }
      if (normalizedKey.includes("crate.inspected")) {
        addCrateInspectFacts("delta");
      }
      if (normalizedKey.includes("crate.searched")) {
        addCrateSearchFacts("delta");
      }
    }

    if (key.includes("fabric") && key.includes("oil") && truthy) {
      addOilFacts("delta");
    }
    if (key.includes("scene.fire.accelerant") && truthy) {
      addFireAccelerantFacts("delta");
    }
    if (key.includes("scene.fire") && truthy) {
      addFireFacts("delta");
    }
    if (key.includes("crate") && key.includes("weaken") && truthy) {
      addCrateWeakenFacts("delta");
    }
    if (key.includes("crate") && key.includes("open") && truthy) {
      addCrateOpenedFacts("delta");
    }
    if (record.kind === "pressure.add" && typeof record.domain === "string") {
      const domain = canonicalPressureDomain(record.domain);
      if (domain) {
        addPressureDomainFacts(domain, "delta");
        pressureDomainsThisTurn.add(domain);
      }
    }
  }

  if (flags["fabric.oiled"]) {
    addOilFacts("flag");
  }
  if (flags["scene.fire"]) {
    addFireFacts("flag");
    if (flags["scene.fire.accelerant"]) {
      addFireAccelerantFacts("flag");
    }
  }
  if (flags["crate.weakened"]) {
    addCrateWeakenFacts("flag");
  }
  if (flags["container.crate_open"]) {
    addCrateOpenedFacts("flag");
  }
  if (flags["oilSpread"]) {
    addOilFacts("flag");
  }
  if (flags["fireStarted"]) {
    addFireFacts("flag");
  }
  if (flags["crateWeakened"]) {
    addCrateWeakenFacts("flag");
  }
  if (flags["crateOpened"]) {
    addCrateOpenedFacts("flag");
  }

  if (flags["door.kicked"] || flags["door.forced"]) {
    addDoorActionFacts("flag");
  }
  if (flags["room.searched"]) {
    addRoomSearchFacts("flag");
  }
  if (flags["desk.searched"]) {
    addDeskSearchFacts("flag");
  }
  if (flags["drawer.pulled"]) {
    addDrawerPulledFacts("flag");
  }
  if (flags["chair.moved"]) {
    addChairMovedFacts("flag");
  }
  if (flags["cabinet.tipped"]) {
    addCabinetTippedFacts("flag");
  }
  if (flags["crate.inspected"]) {
    addCrateInspectFacts("flag");
  }
  if (flags["crate.searched"]) {
    addCrateSearchFacts("flag");
  }

  const dangerValue = lookupStat(["danger", "heat"]);
  if (dangerValue !== null) {
    if (dangerValue >= 25) {
      pushFact(facts, seen, {
        id: "danger_critical",
        text: "Danger is critical.",
        bucket: "careNow",
        kind: "hazard",
        severity: "high",
        priority: 70,
        source: "stats",
      });
      pushFact(facts, seen, {
        id: "danger_world_hot",
        text: "The chamber is dangerously hot.",
        bucket: "world",
        kind: "info",
        severity: "high",
        source: "stats",
      });
      pushFact(facts, seen, {
        id: "danger_opportunity",
        text: "The heat could force a retreat.",
        bucket: "opportunities",
        kind: "opportunity",
        severity: "medium",
        priority: 40,
        source: "stats",
      });
    } else if (dangerValue >= 15) {
      pushFact(facts, seen, {
        id: "danger_elevated",
        text: "Danger is elevated.",
        bucket: "careNow",
        kind: "hazard",
        severity: "medium",
        source: "stats",
      });
      pushFact(facts, seen, {
        id: "danger_world_warm",
        text: "The room feels increasingly hostile.",
        bucket: "world",
        kind: "info",
        severity: "medium",
        source: "stats",
      });
    }
  }

  const noiseValue = lookupStat(["noise"]);
  if (noiseValue !== null) {
    if (noiseValue >= 25) {
      pushFact(facts, seen, {
        id: "noise_attention",
        text: "Noise is drawing attention.",
        bucket: "careNow",
        kind: "hazard",
        severity: "medium",
        source: "stats",
      });
      pushFact(facts, seen, {
        id: "noise_opportunity",
        text: "Someone may be tracking the sound.",
        bucket: "opportunities",
        kind: "opportunity",
        severity: "low",
        source: "stats",
      });
    } else if (noiseValue >= 15) {
      pushFact(facts, seen, {
        id: "noise_rising",
        text: "Noise is rising.",
        bucket: "careNow",
        kind: "hazard",
        severity: "low",
        source: "stats",
      });
    }
  }

  const alertValue = lookupStat(["alert"]);
  if (alertValue !== null && alertValue >= 2) {
    pushFact(facts, seen, {
      id: "alert_elevated",
      text: "Alertness is elevated.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      source: "stats",
    });
  }

  const timeValue = lookupStat(["time"]);
  if (timeValue !== null) {
    if (timeValue >= 30) {
      pushFact(facts, seen, {
        id: "time_critical",
        text: "Time pressure is critical.",
        bucket: "careNow",
        kind: "hazard",
        severity: "medium",
        source: "stats",
      });
    } else if (timeValue >= 15) {
      pushFact(facts, seen, {
        id: "time_building",
        text: "Time pressure is building.",
        bucket: "careNow",
        kind: "hazard",
        severity: "low",
        source: "stats",
      });
    }
  }

  let crateOpenedSeen = seen.turnChanges.has("crate_opened_turn");
  let crateWeakenSeen = seen.turnChanges.has("crate_weakened_turn");
  for (const text of ledgerTexts) {
    const normalized = text.toLowerCase();
    const ledgerDomain = detectLedgerPressureDomain(normalized);
    if (ledgerDomain && !pressureDomainsThisTurn.has(ledgerDomain)) {
      addPressureDomainFacts(ledgerDomain, "ledger");
      pressureDomainsThisTurn.add(ledgerDomain);
    }
    if (includesAll(normalized, ["crate", "open"])) {
      if (!crateOpenedSeen) {
        addCrateOpenedFacts("ledger");
        pushFact(facts, seen, {
          id: "crate_open_ledger",
          text: "Crate opened from ledger.",
          bucket: "turnChanges",
          kind: "progress",
          severity: "medium",
          source: "ledger",
        });
        crateOpenedSeen = true;
      }
    }
    if (includesAll(normalized, ["crate", "weaken"])) {
      if (!crateWeakenSeen) {
        addCrateWeakenFacts("ledger");
        crateWeakenSeen = true;
      }
    }
    if (includesAll(normalized, ["hidden", "clue"]) || includesAll(normalized, ["clue", "uncovered"])) {
      pushFact(facts, seen, {
        id: "clue_uncovered",
        text: "A hidden clue was uncovered.",
        bucket: "turnChanges",
        kind: "opportunity",
        severity: "medium",
        priority: 40,
        source: "ledger",
      });
      pushFact(facts, seen, {
        id: "clue_uncovered_opportunity",
        text: "A hidden clue was uncovered.",
        bucket: "opportunities",
        kind: "opportunity",
        severity: "medium",
        priority: 40,
        source: "ledger",
      });
    }
    if (includesAll(normalized, ["movement"]) || includesAll(normalized, ["heavy object"])) {
      pushFact(facts, seen, {
        id: "movement_signs",
        text: "Signs of movement found.",
        bucket: "opportunities",
        kind: "opportunity",
        severity: "low",
        priority: 30,
        source: "ledger",
      });
    }
  }

  return facts;
}
