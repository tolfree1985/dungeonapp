import { DEFAULT_ALERT_CLOCK_ID, DEFAULT_NOISE_CLOCK_ID } from "@/lib/game/bootstrap";
import { classifyDeltas } from "@/lib/engine/delta/classifyDeltas";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";

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

type MechanicFactsOptions = {
  debug?: boolean;
};

type MechanicFactsInput = {
  stateFlags?: Record<string, unknown> | null;
  stateDeltas?: unknown[];
  ledgerAdds?: unknown[];
  stats?: Record<string, unknown> | null;
  blockedActions?: Record<string, unknown> | null;
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

const CLOCK_PRESSURE_DOMAINS: Record<string, PressureDomain> = {
  [DEFAULT_NOISE_CLOCK_ID]: "noise",
  [DEFAULT_ALERT_CLOCK_ID]: "danger",
  "clk_suspicion": "suspicion",
};

const detectPressureDomainFromDelta = (record: Record<string, unknown>): PressureDomain | null => {
  const op = typeof record.op === "string" ? record.op.toLowerCase() : "";
  if (op === "time.inc" || op === "clock.inc") {
    return null;
  }
  if (op === "pressure.add") {
    const domain = typeof record.domain === "string" ? record.domain.toLowerCase() : "";
    return canonicalPressureDomain(domain);
  }
  return null;
};

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

const FLAG_FACTS: Record<
  string,
  {
    world?: { text: string; severity?: FactSeverity; priority?: number };
    careNow?: { text: string; severity?: FactSeverity; priority?: number };
  }
> = {
  "guard.alerted": {
    world: { text: "Guards are on alert.", priority: 80 },
    careNow: { text: "Enemies are watching for noise.", severity: "medium", priority: 90 },
  },
  "guard.searching": {
    world: { text: "Guards are searching the room.", severity: "medium", priority: 80 },
    careNow: { text: "Guards are combing the space; avoid exposure.", severity: "high", priority: 95 },
  },
  "player.revealed": {
    world: { text: "Your position is known.", priority: 80 },
  },
  "status.exposed": {
    careNow: { text: "You are exposed to danger; find cover.", severity: "high", priority: 90 },
  },
  "action.constraint_pressure": {
    careNow: { text: "Pressure constrains your actions now.", severity: "medium", priority: 70 },
  },
};

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

const sortFacts = (lines: FactLine[]): FactLine[] => {
  return [...lines].sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return a.id.localeCompare(b.id);
  });
};

const normalizeFactText = (text: string): string => text.trim().toLowerCase();

const dedupeFacts = (lines: FactLine[]): FactLine[] => {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.bucket}:${normalizeFactText(line.text)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeAndSortFacts = (lines: FactLine[]): FactLine[] => {
  const deduped = dedupeFacts(lines);
  return sortFacts(deduped);
};

const deriveParityWorldFactFromCareNow = (careFact: FactLine): FactLine | null => {
  const careId = careFact.id.toLowerCase();
  const careText = careFact.text.toLowerCase();

  const makeWorldFact = (id: string, text: string): FactLine => ({
    id,
    text,
    bucket: "world",
    kind: "info",
    severity: careFact.severity,
    priority: careFact.priority,
    source: careFact.source,
  });

  if (careId.includes("fire") || careText.includes("flame")) {
    return makeWorldFact("world_parity_fire", "Fire is burning.");
  }
  if (careId.includes("noise") || careText.includes("noise")) {
    return makeWorldFact("world_parity_noise", "Noise now carries through the area.");
  }
  if (careId.includes("alert") || careText.includes("alert")) {
    return makeWorldFact("world_parity_alert", "Guards are alert.");
  }
  if (careId.includes("search")) {
    return makeWorldFact("world_parity_search", "Guards are searching the room.");
  }
  if (careId.includes("exposure") || careText.includes("exposed")) {
    return makeWorldFact("world_parity_exposure", "Your position is known.");
  }
  if (careId.includes("danger")) {
    return makeWorldFact("world_parity_danger", "The room feels increasingly hostile.");
  }
  if (careId.includes("time")) {
    return makeWorldFact("world_parity_time", "Time has advanced.");
  }
  if (careId.includes("wait")) {
    return makeWorldFact("world_parity_wait", "Waiting is no longer safe.");
  }

  return makeWorldFact("world_parity_state", "The wider situation has materially changed.");
};

export function deriveMechanicFacts(
  {
    stateFlags,
    stateDeltas,
    ledgerAdds,
    stats,
    blockedActions,
  }: MechanicFactsInput,
  options?: MechanicFactsOptions,
): MechanicFacts | null {
  const normalizedStateDeltas = Array.isArray(stateDeltas) ? stateDeltas : [];
  const normalizedFlags = normalizeFlags(stateFlags);
  const stateHasFlags = Object.keys(normalizedFlags).length > 0;
  const classification = classifyDeltas(normalizedStateDeltas);
  const blockedActionsRaw = blockedActions ?? null;
  const normalizedBlockedActions = normalizeFlags(blockedActionsRaw);
  const hasBlockedWait = Boolean(
    normalizedBlockedActions["wait"] || normalizedBlockedActions["WAIT"],
  );

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

  const world = facts.world;
  const careNow = facts.careNow;

  const flags = normalizedFlags;
  const statMap = stats ?? {};
  const deltaKinds = normalizedStateDeltas.map((delta) => {
    if (!delta || typeof delta !== "object") return "unknown";
    return (delta as Record<string, unknown>).op ?? (delta as Record<string, unknown>).kind ?? "unknown";
  });
  const stateFlagKeys = Object.keys(flags);
  const classificationFlagKeys = classification.flagSets.map((entry) => entry.key);
  const combinedFlagKeys = Array.from(new Set([...stateFlagKeys, ...classificationFlagKeys]));
  console.log(
    "mechanic.truth.input",
    JSON.stringify(
      {
        flagKeys: combinedFlagKeys,
        timeIncs: classification.timeIncs,
        clockIncs: classification.clockIncs,
        ledgerAdds,
      },
      null,
      2,
    ),
  );

  const deriveFlagKeys = combinedFlagKeys;
  const ledgerTexts = collectLedgerTexts(ledgerAdds);
  const uniqueFlagKeys = Array.from(new Set(deriveFlagKeys));
  const pushUniqueFact = (bucket: FactLine[], fact: FactLine) => {
    if (bucket.some((entry) => entry.id === fact.id)) return;
    bucket.push(fact);
  };

  const pushPersistentWorldFact = (fact: FactLine) => {
    if (world.some((entry) => entry.id === fact.id)) return;
    world.push({ ...fact, source: fact.source ?? "state" });
  };

  const pushPersistentCareFact = (fact: FactLine) => {
    if (careNow.some((entry) => entry.id === fact.id)) return;
    careNow.push({ ...fact, source: fact.source ?? "state" });
  };

  if (stateHasFlags) {
    if (normalizedFlags[WORLD_FLAGS.guard.searching]) {
      pushPersistentWorldFact({
        id: "guard_searching_world",
        text: "Guards are searching the room.",
        bucket: "world",
        kind: "info",
        severity: "medium",
        source: "state",
      });
    }
    if (normalizedFlags[WORLD_FLAGS.guard.alerted]) {
      pushPersistentWorldFact({
        id: "guard_alerted_world",
        text: "Guards are on alert.",
        bucket: "world",
        kind: "info",
        severity: "medium",
        source: "state",
      });
    }
    if (normalizedFlags[WORLD_FLAGS.status.exposed]) {
      pushPersistentCareFact({
        id: "status.exposed_care",
        text: "You are exposed to danger; find cover.",
        bucket: "careNow",
        kind: "hazard",
        severity: "high",
        source: "state",
      });
    }
  }
  if (hasBlockedWait) {
    pushPersistentCareFact({
      id: "wait_blocked",
      text: "Waiting is no longer safe.",
      bucket: "careNow",
      kind: "hazard",
      severity: "high",
      source: "state",
    });
  }

  const resolveCareNowConflicts = (lines: FactLine[]): FactLine[] => {
    const hasExposedSignal = lines.some((fact) => fact.id === "status.exposed_care");
    if (!hasExposedSignal) return lines;
    return lines.filter((fact) => fact.id !== "exposure_reduced");
  };

  for (const flagKey of uniqueFlagKeys) {
    const fact = FLAG_FACTS[flagKey];
    if (!fact) continue;
    if (fact.world?.text) {
      const id = fact.world.id ?? `${flagKey}_world`;
      pushUniqueFact(world, {
        id,
        text: fact.world.text,
        bucket: "world",
        kind: "info",
        severity: fact.world.severity,
        source: "state",
      });
    }
    if (fact.careNow?.text) {
      const id = fact.careNow.id ?? `${flagKey}_care`;
      pushUniqueFact(careNow, {
        id,
        text: fact.careNow.text,
        bucket: "careNow",
        kind: "hazard",
        severity: fact.careNow.severity,
        source: "state",
      });
    }
  }
  const hasDoorOpen =
    Boolean(flags["ledger_room_door_open"]) ||
    deriveFlagKeys.includes("ledger_room_door_open") ||
    ledgerTexts.some((text) => /ledger room door/.test(text) && /open/i.test(text));

  if (hasDoorOpen) {
    const source: FactLine["source"] = "derived";
    pushFact(facts, seen, {
      id: "door_opened",
      text: "You opened the ledger room door.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "door_open_turn",
      text: "The ledger room door swings open.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "medium",
      priority: 65,
      source,
    });
    pushFact(facts, seen, {
      id: "door_open_persistent",
      text: "The ledger room door remains open.",
      bucket: "persistent",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "door_open_world",
      text: "The ledger room is now accessible.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "door_open_opportunity",
      text: "You can now move through the doorway.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 50,
      source,
    });
  }


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

  const addDoorInspectFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "door_inspect_achieved",
      text: "You inspected the door.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 60,
      source,
    });
    pushFact(facts, seen, {
      id: "door_inspect_world",
      text: "The door's condition is now revealed.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
  };

  const addSneakFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "sneak_achieved",
      text: "You moved quietly.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
  };

  const addHideFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "hide_achieved",
      text: "You slipped into cover.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "hide_world",
      text: "You remain hidden.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "hide_persistent",
      text: "Cover holds you in place.",
      bucket: "persistent",
      kind: "info",
      severity: "low",
      source,
    });
  };

  const addExposureReducedFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "exposure_reduced",
      text: "Your exposure to sight diminishes.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
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

  const addRoomSoundFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "room_sound_achieved",
      text: "You pinpoint the hidden sound source.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "room_sound_world",
      text: "A secret activity now pulses through the room.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "room_sound_opportunity",
      text: "You can now investigate the noise.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 55,
      source,
    });
  };

  const addHiddenActivityFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "hidden_activity_world",
      text: "A subtle activity now reveals itself.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "hidden_activity_opportunity",
      text: "Tracking the activity may expose a new lead.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 60,
      source,
    });
  };

  const addLedgerFragmentFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "ledger_fragment_world",
      text: "You uncovered a hidden ledger fragment.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "ledger_fragment_opportunity",
      text: "The fragment may point to useful intel.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
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

  const addContainerSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "container_search_achieved",
      text: "You uncovered what's inside the container.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 75,
      source,
    });
    pushFact(facts, seen, {
      id: "container_search_world",
      text: "The container's contents are now exposed.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "container_search_opportunity",
      text: "The container can now be cleaned out or used.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 50,
      source,
    });
  };

  const addObjectSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "object_search_achieved",
      text: "You deciphered the object's clues.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "object_search_world",
      text: "The object's purpose is now obvious.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "object_search_opportunity",
      text: "You can now manipulate the object with intent.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 55,
      source,
    });
  };

  const addFixtureSearchFacts = (source: FactLine["source"]) => {
    pushFact(facts, seen, {
      id: "fixture_search_achieved",
      text: "You mapped the fixture's secrets.",
      bucket: "achieved",
      kind: "progress",
      severity: "medium",
      priority: 70,
      source,
    });
    pushFact(facts, seen, {
      id: "fixture_search_world",
      text: "The fixture's design is now understood.",
      bucket: "world",
      kind: "info",
      severity: "medium",
      source,
    });
    pushFact(facts, seen, {
      id: "fixture_search_opportunity",
      text: "You can exploit the fixture's mechanics.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 55,
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
    return;
  };

  if (classification.hasTimeCost) {
    pushFact(facts, seen, {
      id: "time_cost",
      text: "Time advanced.",
      bucket: "costs",
      kind: "cost",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "time_care",
      text: "Time pressure grows.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      priority: 50,
      source: "delta",
    });
  }
  if (classification.hasNoiseCost) {
    const noiseDelta = classification.clockIncs.find((entry) => entry.id === "clk_noise");
    pushFact(facts, seen, {
      id: "noise_cost",
      text: `Noise increased (+${noiseDelta?.by ?? 1}).`,
      bucket: "costs",
      kind: "cost",
      severity: "medium",
      priority: 70,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "noise_care",
      text: "You may be detected.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
  }
  if (classification.hasAlertCost) {
    const alertDelta = classification.clockIncs.find((entry) => entry.id === "clk_alert");
    pushFact(facts, seen, {
      id: "alert_cost",
      text: `Alert increased (+${alertDelta?.by ?? 1}).`,
      bucket: "costs",
      kind: "cost",
      severity: "medium",
      priority: 70,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "alert_care",
      text: "Enemies are becoming alert.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
  }
  if (classification.hasAlertDelta) {
    pushFact(facts, seen, {
      id: "alert_signal",
      text: "Alert energy shifts around you.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      priority: 65,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "alert_opportunity",
      text: "Alertness alters the opportunity space.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 50,
      source: "delta",
    });
  }
  if (classification.hasDamageDelta) {
    pushFact(facts, seen, {
      id: "damage_detected",
      text: "Force leaves visible damage behind.",
      bucket: "world",
      kind: "hazard",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
  }
  if (classification.hasExposureDelta) {
    pushFact(facts, seen, {
      id: "exposure_signal",
      text: "Exposure just increased; keep moving.",
      bucket: "careNow",
      kind: "hazard",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "exposure_opportunity",
      text: "The scene knows about you now.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "medium",
      priority: 55,
      source: "delta",
    });
  }
  if (classification.hasPositionDelta) {
    pushFact(facts, seen, {
      id: "position_shift",
      text: "The tactical picture shifts.",
      bucket: "turnChanges",
      kind: "progress",
      severity: "low",
      priority: 50,
      source: "delta",
    });
    pushFact(facts, seen, {
      id: "position_persistent",
      text: "New positions open future steps.",
      bucket: "opportunities",
      kind: "opportunity",
      severity: "low",
      priority: 45,
      source: "delta",
    });
  }

  const addCostTurnChangeFact = (id: string, text: string) => {
    pushFact(facts, seen, {
      id,
      text,
      bucket: "turnChanges",
      kind: "progress",
      severity: "medium",
      priority: 60,
      source: "delta",
    });
  };
  if (classification.hasTimeCost) {
    addCostTurnChangeFact("time_advanced", "Time advanced.");
  }
  if (classification.hasNoiseCost) {
    addCostTurnChangeFact("noise_increased", "Noise increased.");
  }

  for (const delta of deltaRecords) {
    if (!delta || typeof delta !== "object") continue;
    const record = delta as Record<string, unknown>;
    const pressureDomain = detectPressureDomainFromDelta(record);
    if (pressureDomain) {
      if (!pressureDomainsThisTurn.has(pressureDomain)) {
        addPressureDomainFacts(pressureDomain, "delta");
        pressureDomainsThisTurn.add(pressureDomain);
      }
      continue;
    }
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
      if (normalizedKey.includes("room.sound_source_revealed")) {
        addRoomSoundFacts("delta");
        continue;
      }
      if (normalizedKey.includes("clue.hidden_activity_heard")) {
        addHiddenActivityFacts("delta");
        continue;
      }
      if (normalizedKey.includes("clue.ledger_fragment_found")) {
        addLedgerFragmentFacts("delta");
        continue;
      }
      if (normalizedKey.includes("status.hidden")) {
        addHideFacts("flag");
        continue;
      }
      if (normalizedKey.includes("status.repositioned")) {
        addSneakFacts("flag");
        continue;
      }
      if (normalizedKey.includes("status.exposed")) {
        addExposureReducedFacts("flag");
        continue;
      }
      if (normalizedKey.includes("door.kicked") || normalizedKey.includes("door.forced")) {
        addDoorActionFacts("delta");
        continue;
      }
      if (normalizedKey.includes("door.inspected") || normalizedKey.includes("door.condition_revealed")) {
        addDoorInspectFacts("delta");
        continue;
      }
      if (normalizedKey.includes("room.searched")) {
        addRoomSearchFacts("delta");
        continue;
      }
      if (normalizedKey.includes("desk.searched")) {
        addDeskSearchFacts("delta");
        continue;
      }
      if (normalizedKey.includes("drawer.pulled")) {
        addDrawerPulledFacts("delta");
        continue;
      }
      if (normalizedKey.includes("chair.moved")) {
        addChairMovedFacts("delta");
        continue;
      }
      if (normalizedKey.includes("cabinet.tipped")) {
        addCabinetTippedFacts("delta");
        continue;
      }
      if (normalizedKey.includes("crate.inspected")) {
        addCrateInspectFacts("delta");
        continue;
      }
      if (normalizedKey.includes("crate.searched")) {
        addCrateSearchFacts("delta");
        continue;
      }
      if (normalizedKey.includes("container.searched")) {
        addContainerSearchFacts("delta");
        continue;
      }
      if (normalizedKey.includes("object.searched")) {
        addObjectSearchFacts("delta");
        continue;
      }
      if (normalizedKey.includes("fixture.searched")) {
        addFixtureSearchFacts("delta");
        continue;
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

  for (const flagKey of deriveFlagKeys) {
    const mapping = FLAG_FACTS[flagKey];
    if (!mapping) continue;
    if (mapping.world) {
      pushFact(facts, seen, {
        id: `${flagKey}_world`,
        text: mapping.world.text,
        bucket: "world",
        kind: "info",
        severity: mapping.world.severity,
        priority: mapping.world.priority ?? 80,
        source: "flag",
      });
    }
    if (mapping.careNow) {
      pushFact(facts, seen, {
        id: `${flagKey}_care`,
        text: mapping.careNow.text,
        bucket: "careNow",
        kind: "hazard",
        severity: mapping.careNow.severity ?? "high",
        priority: mapping.careNow.priority ?? 90,
        source: "flag",
      });
    }
  }

  facts.careNow = resolveCareNowConflicts(facts.careNow);
  facts.careNow = dedupeAndSortFacts(facts.careNow);
  if (facts.careNow.length > 0 && facts.world.length === 0) {
    // Canonical parity guard: if a signal can surface as careNow, it must also yield world truth.
    const parityWorldFact = deriveParityWorldFactFromCareNow(facts.careNow[0]);
    if (parityWorldFact) {
      pushFact(facts, seen, parityWorldFact);
    }
  }
  facts.world = dedupeAndSortFacts(facts.world);
  return facts;
}
