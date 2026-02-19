import { createInitialStateV1 } from "./bootstrap";
import { applyDeltas } from "./state";

const FORBIDDEN_DELTA_KEYS = new Set([
  "seed",
  "randomseed",
  "rngseed",
  "timestamp",
  "createdat",
  "updatedat",
]);

export const ALLOWED_STATE_NAMESPACES = new Set([
  "stats",
  "inventory",
  "relationships",
  "quests",
  "flags",
]);

const STYLE_LOCK_KEYS = ["toneLock", "genreLock", "pacingLock"] as const;
const STYLE_LOCK_ALLOWED_VALUES = new Set(["none", "unlocked", "locked"]);

const ALLOWED_REPLAY_TOP_LEVEL_KEYS = new Set([
  "stateVersion",
  "world",
  "inventory",
  "map",
  "npcs",
  "intercepts",
  "stats",
  "relationships",
  "quests",
  "flags",
]);

const LEDGER_FORBIDDEN_PATTERNS = [
  /\bdate\.now\b/i,
  /\bmath\.random\b/i,
  /\brandom\b/i,
  /\bseed\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/i,
  /\b\d{13}\b/,
  /\b0\.\d{6,}\b/,
];

const STORY_CARD_NON_DETERMINISTIC_PATTERNS = [
  /\bdate\.now\b/i,
  /\bperformance\.now\b/i,
  /\btimestamp\b/i,
  /\brandom\b/i,
  /\bseed\b/i,
  /\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/i,
  /\b\d{13}\b/,
];

const PROTECTED_MEMORY_MUTATION_PREFIXES = [
  "flags.tonelock",
  "flags.genrelock",
  "flags.pacinglock",
  "world.flags.tonelock",
  "world.flags.genrelock",
  "world.flags.pacinglock",
  "flags.stakes",
  "flags.risk",
  "flags.escalation",
  "world.flags.stakes",
  "world.flags.risk",
  "world.flags.escalation",
  "meta.stakes",
  "world.meta.stakes",
];

type ReplayEvent = { seq: number; turnJson: any };
export type FailForwardSignal =
  | "STATE_DELTA"
  | "QUEST_ADVANCE"
  | "FLAG_SET"
  | "RELATIONSHIP_SHIFT"
  | "SYSTEM_NO_LEDGER";

export type ConsequenceRiskLevel = "LOW" | "MODERATE" | "HIGH";
export type ConsequenceCostType = "TIME" | "HEALTH" | "RESOURCE" | "RELATIONSHIP" | "REPUTATION" | "FLAG";
export type ConsequenceEscalation = "NONE" | "MINOR" | "MAJOR";

export type ConsequenceSummary = {
  riskLevel: ConsequenceRiskLevel;
  costTypes: ConsequenceCostType[];
  escalation: ConsequenceEscalation;
};

export const CONSEQUENCE_RULE_TABLE = {
  healthLossHighThreshold: 3,
  relationshipNegativeThreshold: 1,
  reputationNegativeThreshold: 1,
  namespaceEscalationMinor: 2,
  namespaceEscalationMajor: 3,
  failureMinimumRisk: "MODERATE" as const,
  costTypeOrder: [
    "HEALTH",
    "RESOURCE",
    "RELATIONSHIP",
    "REPUTATION",
    "TIME",
    "FLAG",
  ] as const,
} as const;

export type CausalCoverageSummary = {
  totalDeltas: number;
  explainedDeltas: number;
  unexplainedDeltas: number;
  coverageRatio: number;
};

export type StyleStabilitySummary = {
  toneStable: boolean;
  genreStable: boolean;
  pacingStable: boolean;
  driftCount: number;
};

export type MemoryStabilitySummary = {
  cardsTriggered: number;
  cardsApplied: number;
  memoryHash: string;
};

export type DeltaLedgerExplanationRow = {
  deltaPath: string;
  ledgerExplanations: string[];
  ledgerIndexes: number[];
  explained: boolean;
};

export type ReplayGuardName =
  | "TURN_MONOTONICITY"
  | "LEDGER_CONSISTENCY"
  | "FAIL_FORWARD_INVARIANT"
  | "MEMORY_STABILITY"
  | "CAUSAL_COVERAGE"
  | "DELTA_SHAPE"
  | "DELTA_NAMESPACE"
  | "DELTA_ORDER"
  | "DELTA_APPLY_IDEMPOTENCY"
  | "STYLE_LOCK_INVARIANT"
  | "REPLAY_STATE_INVARIANT";

export const REPLAY_GUARD_ORDER: readonly ReplayGuardName[] = [
  "TURN_MONOTONICITY",
  "LEDGER_CONSISTENCY",
  "FAIL_FORWARD_INVARIANT",
  "DELTA_SHAPE",
  "DELTA_NAMESPACE",
  "DELTA_ORDER",
  "DELTA_APPLY_IDEMPOTENCY",
  "STYLE_LOCK_INVARIANT",
  "MEMORY_STABILITY",
  "CAUSAL_COVERAGE",
  "REPLAY_STATE_INVARIANT",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function stableNormalizeValue(value: unknown, path: string, seen: WeakSet<object>): unknown {
  if (value === undefined) {
    throw new Error(`STATE_DELTA_UNDEFINED_VALUE path=${path}`);
  }
  if (typeof value === "function") {
    throw new Error(`STATE_DELTA_FUNCTION_VALUE path=${path}`);
  }
  if (value instanceof Date) {
    throw new Error(`STATE_DELTA_DATE_VALUE path=${path}`);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    throw new Error(`DELTA_VALUE_INVALID path=${path}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`DELTA_VALUE_INVALID path=${path}`);
  }
  if (Array.isArray(value)) {
    return value.map((entry, idx) => stableNormalizeValue(entry, `${path}[${idx}]`, seen));
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }
    seen.add(value);

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }

    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_DELTA_KEYS.has(normalizedKey)) {
        throw new Error(`STATE_DELTA_FORBIDDEN_KEY key=${key}`);
      }
      out[key] = stableNormalizeValue(value[key], path ? `${path}.${key}` : key, seen);
    }
    return out;
  }
  return value;
}

function stableStringifyDeterministic(value: unknown, path: string): string {
  const normalized = stableNormalizeValue(value, path, new WeakSet());
  return JSON.stringify(normalized);
}

function normalizeDeltaPath(path: unknown): string | null {
  if (typeof path === "string") {
    const text = path.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(path)) {
    const parts = path.map((part) => String(part).trim()).filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function explicitDeltaPath(delta: unknown): string | null {
  if (!isRecord(delta)) return null;
  if (!("path" in delta)) return null;
  const normalized = normalizeDeltaPath(delta.path);
  if (!normalized) {
    throw new Error("STATE_DELTA_PATH_INVALID");
  }
  return normalized;
}

function assertStatsIntegerValues(value: unknown, path: string): void {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`DELTA_VALUE_INVALID path=${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, idx) => assertStatsIntegerValues(entry, `${path}[${idx}]`));
    return;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      assertStatsIntegerValues(value[key], path ? `${path}.${key}` : key);
    }
  }
}

export function assertStateDeltaShape(delta: unknown): void {
  if (!isRecord(delta)) {
    throw new Error("STATE_DELTA_INVALID");
  }

  const explicitPath = explicitDeltaPath(delta);
  const op = typeof delta.op === "string" ? delta.op.trim() : "";
  const fallbackPath = op.length > 0 ? op : null;
  const path = explicitPath ?? fallbackPath;

  if (!path) {
    throw new Error("STATE_DELTA_PATH_INVALID");
  }

  stableStringifyDeterministic(delta, "delta");
  if (path.startsWith("stats.")) {
    assertStatsIntegerValues(delta, "delta");
  }
}

function deltaOrderKey(delta: unknown): string {
  const explicitPath = explicitDeltaPath(delta);
  if (explicitPath) return explicitPath;
  if (isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0) {
    return delta.op.trim();
  }
  return "";
}

function assertDeltaOrderIsSorted(deltas: unknown[], seq: number): unknown[] {
  const sorted = [...deltas].sort((a, b) => compareText(deltaOrderKey(a), deltaOrderKey(b)));
  for (let i = 0; i < deltas.length; i++) {
    if (deltaOrderKey(deltas[i]) !== deltaOrderKey(sorted[i])) {
      throw new Error(`DELTA_ORDER_NOT_SORTED seq=${seq}`);
    }
  }
  return sorted;
}

function assertDeltaNamespaceAllowed(delta: unknown): void {
  const path = explicitDeltaPath(delta);
  if (!path) return;
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
  if (!namespace || !ALLOWED_STATE_NAMESPACES.has(namespace)) {
    throw new Error(`DELTA_NAMESPACE_NOT_ALLOWED namespace=${namespace || "(none)"}`);
  }
}

function assertLedgerTextDeterminism(value: unknown): void {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    for (const pattern of LEDGER_FORBIDDEN_PATTERNS) {
      if (pattern.test(normalized)) {
        throw new Error("LEDGER_TEXT_NON_DETERMINISTIC");
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => assertLedgerTextDeterminism(entry));
    return;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      if (FORBIDDEN_DELTA_KEYS.has(key.toLowerCase())) {
        throw new Error("LEDGER_TEXT_NON_DETERMINISTIC");
      }
      assertLedgerTextDeterminism(value[key]);
    }
  }
}

function parseLedgerTurnIndex(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  const candidates = [entry.turnIndex, entry.refTurnIndex, entry.turn];
  for (const raw of candidates) {
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function readsFailureBand(turnJson: unknown): boolean {
  if (!isRecord(turnJson)) return false;

  const resolution = isRecord(turnJson.resolution) ? turnJson.resolution : null;
  const candidates = [
    resolution?.tier,
    resolution?.outcome,
    resolution?.band,
    turnJson.outcome,
    turnJson.tier,
    turnJson.band,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (normalized === "fail" || normalized === "failure" || normalized === "fail-forward") {
      return true;
    }
    if (normalized.includes("fail")) {
      return true;
    }
    if (normalized === "2-6") {
      return true;
    }
  }

  if (resolution && typeof resolution.total === "number" && Number.isFinite(resolution.total)) {
    return resolution.total <= 6;
  }
  return false;
}

function hash32Deterministic(input: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function stableHashHex64(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const h = hash32Deterministic(`${i}:${text}`);
    parts.push(h.toString(16).padStart(8, "0"));
  }
  return parts.join("");
}

function readCardIds(source: unknown): { ids: string[]; entries: unknown[] } {
  if (!Array.isArray(source)) return { ids: [], entries: [] };
  const ids: string[] = [];
  const entries: unknown[] = [];
  for (const entry of source) {
    entries.push(entry);
    if (typeof entry === "string") {
      const id = entry.trim();
      if (id.length > 0) ids.push(id);
      continue;
    }
    if (isRecord(entry)) {
      const cardIdRaw = typeof entry.cardId === "string" ? entry.cardId : typeof entry.id === "string" ? entry.id : "";
      const cardId = cardIdRaw.trim();
      if (cardId.length > 0) {
        ids.push(cardId);
      }
    }
  }
  return { ids, entries };
}

function extractStoryCardSignals(turnJson: unknown): {
  triggeredCardIds: string[];
  appliedCardIds: string[];
  triggerEntries: unknown[];
} {
  if (!isRecord(turnJson)) {
    return { triggeredCardIds: [], appliedCardIds: [], triggerEntries: [] };
  }
  const memory = isRecord(turnJson.memory) ? turnJson.memory : null;
  const triggeredCandidates = [
    turnJson.storyCardsTriggered,
    turnJson.storyCardTriggers,
    memory?.matchedIds,
    memory?.cardsTriggered,
  ];
  const appliedCandidates = [
    turnJson.storyCardsApplied,
    memory?.injected,
    memory?.cardsApplied,
  ];

  const triggeredCardIds: string[] = [];
  const triggerEntries: unknown[] = [];
  for (const candidate of triggeredCandidates) {
    const { ids, entries } = readCardIds(candidate);
    for (const id of ids) {
      triggeredCardIds.push(id);
    }
    for (const entry of entries) {
      triggerEntries.push(entry);
    }
  }

  const appliedCardIds: string[] = [];
  for (const candidate of appliedCandidates) {
    const { ids } = readCardIds(candidate);
    for (const id of ids) {
      appliedCardIds.push(id);
    }
  }
  return { triggeredCardIds, appliedCardIds, triggerEntries };
}

function normalizeMutationPath(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => String(entry).trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function readMemoryMutationPaths(turnJson: unknown): string[] {
  if (!isRecord(turnJson)) return [];
  const memory = isRecord(turnJson.memory) ? turnJson.memory : null;
  const candidates = [
    turnJson.memoryMutations,
    memory?.mutations,
    turnJson.storyCardMemoryMutations,
    turnJson.memoryMutationPaths,
  ];
  const out: string[] = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const entry of candidate) {
      if (typeof entry === "string") {
        const path = normalizeMutationPath(entry);
        if (path) out.push(path);
        continue;
      }
      if (!isRecord(entry)) continue;
      const path =
        normalizeMutationPath(entry.path) ??
        normalizeMutationPath(entry.key) ??
        normalizeMutationPath(entry.op);
      if (path) out.push(path);
    }
  }
  return out;
}

function assertMemoryMutationProtectedNamespace(turnJson: unknown, seq: number): void {
  const paths = readMemoryMutationPaths(turnJson);
  for (const path of paths) {
    const clean = path.startsWith("/") ? path.slice(1) : path;
    if (PROTECTED_MEMORY_MUTATION_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
      throw new Error(`MEMORY_MUTATION_VIOLATION seq=${seq} path=${clean}`);
    }
  }
}

function isQuestAdvanceMutation(delta: unknown): boolean {
  if (!isRecord(delta)) return false;
  const path = normalizeDeltaPath(delta.path);
  if (path) {
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
    if (namespace === "quests") return true;
  }
  const op = normalizeText(delta.op);
  return !!op && op.startsWith("quest.");
}

function isFlagSetMutation(delta: unknown): boolean {
  if (!isRecord(delta)) return false;
  const path = normalizeDeltaPath(delta.path);
  if (path) {
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
    if (namespace === "flags") return true;
  }
  const op = normalizeText(delta.op);
  return !!op && op.startsWith("flag.");
}

function isRelationshipShiftMutation(delta: unknown): boolean {
  if (!isRecord(delta)) return false;
  const path = normalizeDeltaPath(delta.path);
  if (path) {
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    const namespace = cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
    if (namespace === "relationships") return true;
  }
  const op = normalizeText(delta.op);
  return !!op && op.startsWith("relationship.");
}

const FAIL_FORWARD_SIGNAL_PRIORITY: readonly FailForwardSignal[] = [
  "QUEST_ADVANCE",
  "FLAG_SET",
  "RELATIONSHIP_SHIFT",
  "SYSTEM_NO_LEDGER",
  "STATE_DELTA",
] as const;

const CONSEQUENCE_COST_ORDER: readonly ConsequenceCostType[] = CONSEQUENCE_RULE_TABLE.costTypeOrder;

const CONSEQUENCE_RISK_ORDER: readonly ConsequenceRiskLevel[] = ["LOW", "MODERATE", "HIGH"] as const;
const CONSEQUENCE_ESCALATION_ORDER: readonly ConsequenceEscalation[] = ["NONE", "MINOR", "MAJOR"] as const;

function compareFailForwardSignalPriority(a: FailForwardSignal, b: FailForwardSignal): number {
  return FAIL_FORWARD_SIGNAL_PRIORITY.indexOf(a) - FAIL_FORWARD_SIGNAL_PRIORITY.indexOf(b);
}

function compareConsequenceRisk(a: ConsequenceRiskLevel, b: ConsequenceRiskLevel): number {
  return CONSEQUENCE_RISK_ORDER.indexOf(a) - CONSEQUENCE_RISK_ORDER.indexOf(b);
}

function compareConsequenceEscalation(a: ConsequenceEscalation, b: ConsequenceEscalation): number {
  return CONSEQUENCE_ESCALATION_ORDER.indexOf(a) - CONSEQUENCE_ESCALATION_ORDER.indexOf(b);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readTurnDeltasForConsequence(source: unknown): unknown[] {
  if (!isRecord(source)) return [];
  if (Array.isArray(source.deltas)) return source.deltas;
  if (Array.isArray(source.stateDeltas)) return source.stateDeltas;
  if (isRecord(source.turnJson)) {
    if (Array.isArray(source.turnJson.deltas)) return source.turnJson.deltas;
    if (Array.isArray(source.turnJson.stateDeltas)) return source.turnJson.stateDeltas;
  }
  return [];
}

function readTurnLedgerForConsequence(source: unknown): unknown[] {
  if (!isRecord(source)) return [];
  if (Array.isArray(source.ledgerAdds)) return source.ledgerAdds;
  if (isRecord(source.turnJson) && Array.isArray(source.turnJson.ledgerAdds)) {
    return source.turnJson.ledgerAdds;
  }
  return [];
}

function numericDecreaseForDelta(delta: unknown): number {
  if (!isRecord(delta)) return 0;
  const before = asNumber(delta.before);
  const after = asNumber(delta.after);
  if (before != null && after != null && before > after) {
    return before - after;
  }
  const by = asNumber(delta.by);
  const value = asNumber(delta.value);
  const op = normalizeText(delta.op) ?? "";
  if ((op.includes("dec") || op.includes("decrease") || op.includes("remove")) && by != null && by > 0) {
    return by;
  }
  if ((op.includes("dec") || op.includes("decrease") || op.includes("remove")) && value != null && value > 0) {
    return value;
  }
  return 0;
}

function ledgerMentions(text: string, token: string): boolean {
  return tokenInText(text, token.toLowerCase());
}

export type ConsequenceClassifierOptions = {
  ignoreLedgerStakesOverride?: boolean;
};

function parseConsequenceRiskMarker(raw: string): ConsequenceRiskLevel | null {
  const marker = raw.trim();
  if (marker === "stakes:LOW" || marker === "risk:LOW") return "LOW";
  if (marker === "stakes:MODERATE" || marker === "risk:MODERATE") return "MODERATE";
  if (marker === "stakes:HIGH" || marker === "risk:HIGH") return "HIGH";
  return null;
}

function readStringsForConsequenceMarker(source: unknown, out: string[]): void {
  if (typeof source === "string") {
    out.push(source);
    return;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (typeof entry === "string") {
        out.push(entry);
      }
    }
    return;
  }
}

export function readLedgerStakesRiskOverride(ledgerAdds: unknown[]): ConsequenceRiskLevel | null {
  let last: ConsequenceRiskLevel | null = null;
  for (const entry of ledgerAdds) {
    if (!isRecord(entry)) continue;
    const candidates: string[] = [];
    readStringsForConsequenceMarker(entry.stakes, candidates);
    readStringsForConsequenceMarker(entry.risk, candidates);
    readStringsForConsequenceMarker(entry.marker, candidates);
    readStringsForConsequenceMarker(entry.message, candidates);
    readStringsForConsequenceMarker(entry.because, candidates);
    readStringsForConsequenceMarker(entry.kind, candidates);
    readStringsForConsequenceMarker(entry.tag, candidates);
    readStringsForConsequenceMarker(entry.tags, candidates);
    readStringsForConsequenceMarker(entry.markers, candidates);
    for (const candidate of candidates) {
      const parsed = parseConsequenceRiskMarker(candidate);
      if (parsed) {
        last = parsed;
      }
    }
  }
  return last;
}

function consequenceFromTurn(source: unknown, options?: ConsequenceClassifierOptions): {
  summary: ConsequenceSummary;
  namespacesChanged: Set<string>;
  reasonLines: string[];
} {
  const deltas = readTurnDeltasForConsequence(source);
  const ledgerAdds = readTurnLedgerForConsequence(source);
  const ignoreLedgerStakesOverride = options?.ignoreLedgerStakesOverride === true;

  const namespacesChanged = new Set<string>();
  let healthDecreaseMax = 0;
  let relationshipNegative = false;
  let reputationNegative = false;
  let riskyFlagMutation = false;
  const reasonLines: string[] = [];

  const costTypes = new Set<ConsequenceCostType>();
  const ledgerText = ledgerAdds.map((entry) => ledgerEntrySearchText(entry)).join("\n");

  for (const delta of deltas) {
    const explicitPath = explicitDeltaPath(delta);
    const opPath =
      isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0
        ? normalizeReferenceToken(delta.op)
        : "";
    const op = isRecord(delta) ? normalizeText(delta.op) ?? "" : "";
    const path = explicitPath ? normalizeReferenceToken(explicitPath) : opPath;
    let namespace = path ? topNamespaceFromPath(path) : "";
    if (!namespace) {
      if (op.startsWith("flag.")) namespace = "flags";
      else if (op.startsWith("quest.")) namespace = "quests";
      else if (op.startsWith("relationship.")) namespace = "relationships";
      else if (op.startsWith("inv.") || op.startsWith("inventory.")) namespace = "inventory";
      else if (op.startsWith("time.")) namespace = "world";
    }
    if (namespace) namespacesChanged.add(namespace);

    const decrease = numericDecreaseForDelta(delta);
    if (path.startsWith("stats.health")) {
      if (decrease > 0) {
        costTypes.add("HEALTH");
        healthDecreaseMax = Math.max(healthDecreaseMax, decrease);
      }
    }
    if (namespace === "relationships") {
      if (decrease > 0) relationshipNegative = true;
      costTypes.add("RELATIONSHIP");
    }
    if (namespace === "inventory") {
      costTypes.add("RESOURCE");
    }
    if (namespace === "flags" || op.startsWith("flag.")) {
      costTypes.add("FLAG");
      const keyText =
        (isRecord(delta) && typeof delta.key === "string" ? delta.key.trim().toLowerCase() : "") || "";
      const riskText = `${path} ${keyText}`.trim();
      if (riskText.includes("failed") || riskText.includes("injury") || riskText.includes("harm")) {
        riskyFlagMutation = true;
      }
    }
    if (path.includes("reputation")) {
      if (decrease > 0) reputationNegative = true;
      costTypes.add("REPUTATION");
    }
    if (path.startsWith("world.time") || path.startsWith("time.")) {
      costTypes.add("TIME");
    }
  }

  if (ledgerMentions(ledgerText, "health")) costTypes.add("HEALTH");
  if (ledgerMentions(ledgerText, "relationship")) costTypes.add("RELATIONSHIP");
  if (ledgerMentions(ledgerText, "reputation")) costTypes.add("REPUTATION");
  if (ledgerMentions(ledgerText, "resource") || ledgerMentions(ledgerText, "inventory")) costTypes.add("RESOURCE");
  if (ledgerMentions(ledgerText, "time")) costTypes.add("TIME");
  if (ledgerMentions(ledgerText, "flag")) costTypes.add("FLAG");

  let riskLevel: ConsequenceRiskLevel = "LOW";
  if (healthDecreaseMax > CONSEQUENCE_RULE_TABLE.healthLossHighThreshold) {
    riskLevel = "HIGH";
    reasonLines.push(
      `HEALTH cost: stats.health decreased by ${healthDecreaseMax} (>=${CONSEQUENCE_RULE_TABLE.healthLossHighThreshold})`,
    );
  } else if (healthDecreaseMax > 0 || relationshipNegative || reputationNegative || riskyFlagMutation) {
    riskLevel = "MODERATE";
    if (healthDecreaseMax > 0) {
      reasonLines.push(
        `HEALTH cost: stats.health decreased by ${healthDecreaseMax} (<${CONSEQUENCE_RULE_TABLE.healthLossHighThreshold + 1})`,
      );
    }
    if (relationshipNegative) {
      reasonLines.push(
        `RELATIONSHIP cost: negative shift detected (>=${CONSEQUENCE_RULE_TABLE.relationshipNegativeThreshold})`,
      );
    }
    if (reputationNegative) {
      reasonLines.push(
        `REPUTATION cost: negative shift detected (>=${CONSEQUENCE_RULE_TABLE.reputationNegativeThreshold})`,
      );
    }
    if (riskyFlagMutation) {
      reasonLines.push("FLAG cost: risky failure flag mutation detected");
    }
  }
  if (namespacesChanged.size >= CONSEQUENCE_RULE_TABLE.namespaceEscalationMajor) {
    riskLevel = "HIGH";
  } else if (
    namespacesChanged.size >= CONSEQUENCE_RULE_TABLE.namespaceEscalationMinor &&
    compareConsequenceRisk(riskLevel, "MODERATE") < 0
  ) {
    riskLevel = "MODERATE";
  }

  const stakesOverride = ignoreLedgerStakesOverride ? null : readLedgerStakesRiskOverride(ledgerAdds);
  if (stakesOverride) {
    if (compareConsequenceRisk(stakesOverride, riskLevel) > 0) {
      riskLevel = stakesOverride;
      reasonLines.push(`RISK override: ${stakesOverride}`);
    } else if (compareConsequenceRisk(stakesOverride, riskLevel) < 0) {
      const floor = readsFailureBand(source) ? CONSEQUENCE_RULE_TABLE.failureMinimumRisk : "LOW";
      riskLevel =
        compareConsequenceRisk(stakesOverride, floor) >= 0 ? stakesOverride : floor;
      reasonLines.push(`RISK override (bounded): ${riskLevel}`);
    }
  }

  let escalation: ConsequenceEscalation = "NONE";
  if (
    namespacesChanged.size >= CONSEQUENCE_RULE_TABLE.namespaceEscalationMajor ||
    riskLevel === "HIGH"
  ) {
    escalation = "MAJOR";
    reasonLines.push(`ESCALATION MAJOR: ${namespacesChanged.size} namespaces changed`);
  } else if (
    namespacesChanged.size >= CONSEQUENCE_RULE_TABLE.namespaceEscalationMinor ||
    riskLevel === "MODERATE"
  ) {
    escalation = "MINOR";
    reasonLines.push(`ESCALATION MINOR: ${namespacesChanged.size} namespaces changed`);
  }

  const orderedCostTypes = [...costTypes].sort(
    (a, b) => CONSEQUENCE_COST_ORDER.indexOf(a) - CONSEQUENCE_COST_ORDER.indexOf(b),
  );
  return {
    summary: {
      riskLevel,
      costTypes: orderedCostTypes,
      escalation,
    },
    namespacesChanged,
    reasonLines,
  };
}

export function classifyFailForwardSignal(turnJson: unknown): FailForwardSignal | null {
  const tj = isRecord(turnJson) ? turnJson : {};
  if (!readsFailureBand(tj)) return null;
  const deltas = Array.isArray(tj.deltas) ? tj.deltas : [];
  const hasStateDelta = deltas.length > 0;
  const hasQuestAdvance = deltas.some((delta) => isQuestAdvanceMutation(delta));
  const hasFlagSet = deltas.some((delta) => isFlagSetMutation(delta));
  const hasRelationshipShift = deltas.some((delta) => isRelationshipShiftMutation(delta));
  const systemNoLedger = hasSystemNoLedgerTag(tj);

  if (hasQuestAdvance) return "QUEST_ADVANCE";
  if (hasFlagSet) return "FLAG_SET";
  if (hasRelationshipShift) return "RELATIONSHIP_SHIFT";
  if (systemNoLedger) return "SYSTEM_NO_LEDGER";
  if (hasStateDelta) return "STATE_DELTA";
  return null;
}

export function classifyConsequence(
  turnEvent: unknown,
  options?: ConsequenceClassifierOptions,
): ConsequenceSummary {
  return consequenceFromTurn(turnEvent, options).summary;
}

export function explainConsequence(
  turnEvent: unknown,
  options?: ConsequenceClassifierOptions,
): string[] {
  return consequenceFromTurn(turnEvent, options).reasonLines;
}

export function aggregateConsequences(turnEvents: unknown[]): ConsequenceSummary {
  let riskLevel: ConsequenceRiskLevel = "LOW";
  let escalation: ConsequenceEscalation = "NONE";
  const costTypes = new Set<ConsequenceCostType>();
  for (const event of turnEvents) {
    const summary = classifyConsequence(event);
    if (compareConsequenceRisk(summary.riskLevel, riskLevel) > 0) {
      riskLevel = summary.riskLevel;
    }
    if (compareConsequenceEscalation(summary.escalation, escalation) > 0) {
      escalation = summary.escalation;
    }
    for (const costType of summary.costTypes) {
      costTypes.add(costType);
    }
  }
  return {
    riskLevel,
    costTypes: [...costTypes].sort((a, b) => CONSEQUENCE_COST_ORDER.indexOf(a) - CONSEQUENCE_COST_ORDER.indexOf(b)),
    escalation,
  };
}

function getReplayDeltas(event: ReplayEvent): unknown[] {
  const tj = event?.turnJson ?? {};
  if (event.seq === 0 && !Array.isArray(tj?.deltas)) {
    const kind = typeof tj?.kind === "string" ? tj.kind : "";
    if (kind === "FORK_FROM_CHAIN" || kind === "ANCHOR" || kind === "GENESIS") {
      return [];
    }
  }
  return Array.isArray(tj?.deltas) ? tj.deltas : [];
}

function getReplayDeltasStrict(event: ReplayEvent): unknown[] {
  const tj = event?.turnJson ?? {};
  if (event.seq === 0 && !Array.isArray(tj?.deltas)) {
    const kind = typeof tj?.kind === "string" ? tj.kind : "";
    if (kind === "FORK_FROM_CHAIN" || kind === "ANCHOR" || kind === "GENESIS") {
      return [];
    }
  }
  if (!Array.isArray(tj?.deltas)) {
    throw new Error(`Bad event payload: seq=${event.seq} missing turnJson.deltas[]`);
  }
  return tj.deltas;
}

function hasSystemNoLedgerTag(turnJson: unknown): boolean {
  if (!isRecord(turnJson)) return false;
  const tagsCandidates = [
    turnJson.tags,
    isRecord(turnJson.meta) ? turnJson.meta.tags : undefined,
    turnJson.turnTags,
  ];
  for (const candidate of tagsCandidates) {
    if (!Array.isArray(candidate)) continue;
    for (const entry of candidate) {
      if (typeof entry === "string" && entry.trim() === "system/no-ledger") {
        return true;
      }
    }
  }
  return typeof turnJson.tag === "string" && turnJson.tag.trim() === "system/no-ledger";
}

function normalizeReferenceToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const stripped = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return stripped.replace(/\[(\d+)\]/g, ".$1");
}

function addTokenWithParents(raw: unknown, out: Set<string>): void {
  const token = normalizeReferenceToken(raw);
  if (!token) return;
  const parts = token.split(/[./[\]]+/).filter(Boolean);
  if (parts.length === 0) return;
  for (let i = parts.length; i >= 1; i--) {
    out.add(parts.slice(0, i).join("."));
  }
  out.add(parts[parts.length - 1]);
}

function readStringValues(source: unknown, keys: string[]): string[] {
  if (!isRecord(source)) return [];
  const out: string[] = [];
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      out.push(value.trim());
      continue;
    }
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        out.push(entry.trim());
      }
    }
  }
  return out;
}

function readLedgerExplicitReferencePaths(entry: unknown): string[] {
  return readStringValues(entry, ["path", "paths", "deltaPath", "deltaPaths", "refPath", "refPaths"]);
}

function readLedgerGroupTokens(entry: unknown): Set<string> {
  const out = new Set<string>();
  const groups = readStringValues(entry, ["causalGroup", "causalGroups", "group", "groups"]);
  for (const group of groups) {
    out.add(normalizeReferenceToken(group));
  }
  return out;
}

function isNamespaceWideLedgerEntry(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  return entry.namespace_wide === true || entry.namespaceWide === true;
}

function readDeltaGroupTokens(delta: unknown): Set<string> {
  const out = new Set<string>();
  const groups = readStringValues(delta, ["causalGroup", "causalGroups", "group", "groups"]);
  for (const group of groups) {
    out.add(normalizeReferenceToken(group));
  }
  return out;
}

function readDeltaDisplayPath(delta: unknown, index: number): string {
  const explicit = explicitDeltaPath(delta);
  if (explicit) return explicit;
  if (isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0) {
    return delta.op.trim();
  }
  if (isRecord(delta) && typeof delta.key === "string" && delta.key.trim().length > 0) {
    return delta.key.trim();
  }
  return `#${index}`;
}

function buildDeltaReferenceTokens(delta: unknown): string[] {
  const out = new Set<string>();
  const explicit = explicitDeltaPath(delta);
  if (explicit) {
    addTokenWithParents(explicit, out);
  }
  if (isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0) {
    addTokenWithParents(delta.op, out);
  }
  if (isRecord(delta) && typeof delta.key === "string" && delta.key.trim().length > 0) {
    addTokenWithParents(delta.key, out);
  }
  return [...out];
}

function ledgerEntrySearchText(entry: unknown): string {
  try {
    return stableStringifyDeterministic(entry, "ledger.search").toLowerCase();
  } catch {
    const fallback = JSON.stringify(entry);
    return typeof fallback === "string" ? fallback.toLowerCase() : "";
  }
}

function ledgerExplanationText(entry: unknown): string {
  if (isRecord(entry)) {
    const labels = ["message", "because", "kind"];
    const parts: string[] = [];
    for (const label of labels) {
      const value = entry[label];
      if (typeof value === "string" && value.trim().length > 0) {
        parts.push(value.trim());
      }
    }
    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }
  try {
    return stableStringifyDeterministic(entry, "ledger.explanation");
  } catch {
    const fallback = JSON.stringify(entry);
    return typeof fallback === "string" ? fallback : "(none)";
  }
}

function tokenInText(text: string, token: string): boolean {
  if (!token) return false;
  const normalizedToken = token.toLowerCase();
  const escaped = normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`);
  return pattern.test(text);
}

function buildDeltaTokenSet(deltas: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const delta of deltas) {
    for (const token of buildDeltaReferenceTokens(delta)) {
      out.add(token);
    }
  }
  return out;
}

function buildDeltaReferencePathsForLedger(deltas: unknown[]): string[] {
  const out: string[] = [];
  for (const delta of deltas) {
    const explicit = explicitDeltaPath(delta);
    if (explicit) {
      const normalized = normalizeReferenceToken(explicit);
      if (normalized) out.push(normalized);
      continue;
    }
    if (isRecord(delta) && typeof delta.op === "string" && delta.op.trim().length > 0) {
      const normalized = normalizeReferenceToken(delta.op);
      if (normalized) out.push(normalized);
      continue;
    }
    if (isRecord(delta) && typeof delta.key === "string" && delta.key.trim().length > 0) {
      const normalized = normalizeReferenceToken(delta.key);
      if (normalized) out.push(normalized);
    }
  }
  return out;
}

function ledgerPathMatchesDeltaPath(ledgerPath: string, deltaPath: string): boolean {
  if (ledgerPath === deltaPath) return true;
  return deltaPath.startsWith(`${ledgerPath}.`);
}

function topNamespaceFromPath(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return cleaned.split(/[./[\]]+/).filter(Boolean)[0] ?? "";
}

function explicitReferencePathsForEntry(entry: unknown): string[] {
  return readLedgerExplicitReferencePaths(entry)
    .map((rawPath) => normalizeReferenceToken(rawPath))
    .filter((value) => value.length > 0);
}

function entryReferencesNamespace(entry: unknown, namespace: string): boolean {
  const explicitPaths = explicitReferencePathsForEntry(entry);
  if (explicitPaths.some((path) => path === namespace || path.startsWith(`${namespace}.`))) {
    return true;
  }
  const groups = readLedgerGroupTokens(entry);
  if (groups.has(namespace)) return true;
  return tokenInText(ledgerEntrySearchText(entry), namespace);
}

export function buildDeltaLedgerExplanationRows(args: {
  deltas: unknown[];
  ledgerAdds: unknown[];
  allowImplicitSinglePair?: boolean;
  systemNoLedger?: boolean;
}): { rows: DeltaLedgerExplanationRow[]; coverage: CausalCoverageSummary } {
  const deltas = Array.isArray(args.deltas) ? args.deltas : [];
  const ledgerAdds = Array.isArray(args.ledgerAdds) ? args.ledgerAdds : [];
  const allowImplicitSinglePair = args.allowImplicitSinglePair !== false;
  const systemNoLedger = args.systemNoLedger === true;

  const ledgerContexts = ledgerAdds.map((entry, index) => {
    const explicitRefs = new Set<string>();
    for (const rawPath of readLedgerExplicitReferencePaths(entry)) {
      addTokenWithParents(rawPath, explicitRefs);
    }
    return {
      index,
      searchText: ledgerEntrySearchText(entry),
      explanation: ledgerExplanationText(entry),
      explicitRefs,
      groupTokens: readLedgerGroupTokens(entry),
    };
  });

  const rows: DeltaLedgerExplanationRow[] = deltas.map((delta, index) => {
    if (systemNoLedger && ledgerAdds.length === 0) {
      return {
        deltaPath: readDeltaDisplayPath(delta, index),
        ledgerExplanations: ["system/no-ledger"],
        ledgerIndexes: [],
        explained: true,
      };
    }

    const deltaTokens = buildDeltaReferenceTokens(delta);
    const deltaGroups = readDeltaGroupTokens(delta);

    const matchedExplanations: string[] = [];
    const matchedIndexes: number[] = [];
    for (const ledgerContext of ledgerContexts) {
      const byPath = deltaTokens.some((token) => ledgerContext.explicitRefs.has(token));
      const byGroup = deltaGroups.size > 0 && [...deltaGroups].some((group) => ledgerContext.groupTokens.has(group));
      const byText = deltaTokens.some((token) => tokenInText(ledgerContext.searchText, token));
      if (byPath || byGroup || byText) {
        matchedExplanations.push(ledgerContext.explanation);
        matchedIndexes.push(ledgerContext.index);
      }
    }

    if (
      matchedExplanations.length === 0 &&
      allowImplicitSinglePair &&
      deltas.length === 1 &&
      ledgerContexts.length === 1
    ) {
      matchedExplanations.push(ledgerContexts[0].explanation);
      matchedIndexes.push(ledgerContexts[0].index);
    }

    return {
      deltaPath: readDeltaDisplayPath(delta, index),
      ledgerExplanations: matchedExplanations,
      ledgerIndexes: matchedIndexes,
      explained: matchedExplanations.length > 0,
    };
  });

  const explainedDeltas = rows.filter((row) => row.explained).length;
  const totalDeltas = rows.length;
  return {
    rows,
    coverage: {
      totalDeltas,
      explainedDeltas,
      unexplainedDeltas: totalDeltas - explainedDeltas,
      coverageRatio: totalDeltas === 0 ? 1 : explainedDeltas / totalDeltas,
    },
  };
}

export function assertLedgerConsistency(events: ReplayEvent[]): void {
  const turnIndexes = new Set<number>(events.map((event) => event.seq));
  const seenLedgerIds = new Set<string>();
  const perTurnRows: Array<{ seq: number; deltaCount: number; ledgerCount: number }> = [];

  for (const event of events) {
    const tj = event?.turnJson ?? {};
    const deltas = getReplayDeltas(event);
    const ledgerAdds = Array.isArray(tj?.ledgerAdds) ? tj.ledgerAdds : [];

    const noLedgerTagged = hasSystemNoLedgerTag(tj);
    if (deltas.length > 0 && ledgerAdds.length === 0 && !noLedgerTagged) {
      throw new Error(`LEDGER_DELTA_COUPLING_VIOLATION seq=${event.seq} reason=delta_without_ledger`);
    }
    if (ledgerAdds.length > 0 && deltas.length === 0) {
      throw new Error(`LEDGER_DELTA_COUPLING_VIOLATION seq=${event.seq} reason=ledger_without_delta`);
    }

    ledgerAdds.forEach((entry, idx) => {
      assertLedgerTextDeterminism(entry);
      const refTurnIndex = parseLedgerTurnIndex(entry);
      if (refTurnIndex != null && !turnIndexes.has(refTurnIndex)) {
        throw new Error(`LEDGER_REFERENCE_INVALID seq=${event.seq} idx=${idx} turnIndex=${refTurnIndex}`);
      }

      if (isRecord(entry) && typeof entry.id === "string" && entry.id.trim().length > 0) {
        const id = entry.id.trim();
        if (seenLedgerIds.has(id)) {
          throw new Error(`LEDGER_DUPLICATE_ID id=${id}`);
        }
        seenLedgerIds.add(id);
      }
    });

    perTurnRows.push({
      seq: event.seq,
      deltaCount: deltas.length,
      ledgerCount: ledgerAdds.length,
    });
  }

  const totalLedgerFromRows = perTurnRows.reduce((sum, row) => sum + row.ledgerCount, 0);
  const totalLedgerFromEvents = events.reduce(
    (sum, event) => sum + (Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0),
    0,
  );
  if (totalLedgerFromRows !== totalLedgerFromEvents) {
    throw new Error("LEDGER_TELEMETRY_MISMATCH");
  }
}

export function assertCausalCoverage(events: ReplayEvent[]): CausalCoverageSummary {
  let totalDeltas = 0;
  let explainedDeltas = 0;
  let unexplainedDeltas = 0;

  for (const event of events) {
    const turnJson = isRecord(event.turnJson) ? event.turnJson : {};
    const deltas = getReplayDeltas(event);
    const ledgerAdds = Array.isArray(turnJson.ledgerAdds) ? turnJson.ledgerAdds : [];
    const systemNoLedger = hasSystemNoLedgerTag(turnJson) && ledgerAdds.length === 0;

    const { rows, coverage } = buildDeltaLedgerExplanationRows({
      deltas,
      ledgerAdds,
      allowImplicitSinglePair: true,
      systemNoLedger,
    });
    totalDeltas += coverage.totalDeltas;
    explainedDeltas += coverage.explainedDeltas;
    unexplainedDeltas += coverage.unexplainedDeltas;

    const firstUnexplained = rows.find((row) => !row.explained);
    if (firstUnexplained) {
      throw new Error(`DELTA_WITHOUT_LEDGER_EXPLANATION seq=${event.seq} path=${firstUnexplained.deltaPath}`);
    }

    const deltaTokens = buildDeltaTokenSet(deltas);
    const deltaReferencePaths = buildDeltaReferencePathsForLedger(deltas);
    const topNamespaces = new Set<string>();
    for (const path of deltaReferencePaths) {
      const namespace = topNamespaceFromPath(path);
      if (namespace) topNamespaces.add(namespace);
    }

    if (deltas.length > 1) {
      for (const namespace of [...topNamespaces].sort(compareText)) {
        const namespaceReferenced = ledgerAdds.some((entry) => entryReferencesNamespace(entry, namespace));
        if (!namespaceReferenced) {
          throw new Error(`DELTA_WITHOUT_LEDGER_EXPLANATION seq=${event.seq} namespace=${namespace}`);
        }
      }
    }

    for (let idx = 0; idx < ledgerAdds.length; idx++) {
      const entry = ledgerAdds[idx];
      const explicitPaths = readLedgerExplicitReferencePaths(entry);
      if (explicitPaths.length === 0) continue;
      const normalizedEntryPaths = explicitPaths
        .map((rawPath) => normalizeReferenceToken(rawPath))
        .filter((value) => value.length > 0);
      const entryNamespaceWide = isNamespaceWideLedgerEntry(entry);
      for (const entryPath of normalizedEntryPaths) {
        const namespace = topNamespaceFromPath(entryPath);
        if (!namespace || entryPath !== namespace) continue;
        const hasDeeperDelta = deltaReferencePaths.some(
          (deltaPath) =>
            topNamespaceFromPath(deltaPath) === namespace &&
            deltaPath !== namespace &&
            deltaPath.startsWith(`${namespace}.`),
        );
        if (!hasDeeperDelta) continue;
        const hasExplicitChildRef = normalizedEntryPaths.some(
          (candidate) => candidate !== namespace && candidate.startsWith(`${namespace}.`),
        );
        if (!hasExplicitChildRef && !entryNamespaceWide) {
          throw new Error(`LEDGER_TOO_BROAD_EXPLANATION seq=${event.seq} idx=${idx} path=${namespace}`);
        }
      }
      for (const rawPath of explicitPaths) {
        const normalizedPath = normalizeReferenceToken(rawPath);
        if (!normalizedPath) continue;
        const matchesDelta =
          deltaReferencePaths.some((deltaPath) => ledgerPathMatchesDeltaPath(normalizedPath, deltaPath)) ||
          deltaTokens.has(normalizedPath);
        if (!matchesDelta) {
          throw new Error(`LEDGER_WITHOUT_DELTA_MUTATION seq=${event.seq} idx=${idx} path=${normalizedPath}`);
        }
      }
    }
  }

  return {
    totalDeltas,
    explainedDeltas,
    unexplainedDeltas,
    coverageRatio: totalDeltas === 0 ? 1 : explainedDeltas / totalDeltas,
  };
}

export function assertFailForwardInvariant(events: ReplayEvent[]): Map<number, FailForwardSignal> {
  const byTurnIndex = new Map<number, FailForwardSignal>();
  for (const event of events) {
    const turnJson = isRecord(event.turnJson) ? event.turnJson : {};
    if (!readsFailureBand(turnJson)) continue;
    const signal = classifyFailForwardSignal(turnJson);
    if (!signal) {
      throw new Error(`FAIL_FORWARD_VIOLATION seq=${event.seq}`);
    }
    byTurnIndex.set(event.seq, signal);
  }
  return byTurnIndex;
}

export function assertFailForwardConsequenceAlignment(events: ReplayEvent[]): void {
  for (const event of events) {
    const turnJson = isRecord(event.turnJson) ? event.turnJson : {};
    if (!readsFailureBand(turnJson)) continue;
    const consequence = classifyConsequence(turnJson);
    const validEscalation = consequence.escalation === "MINOR" || consequence.escalation === "MAJOR";
    if (consequence.riskLevel === "LOW" || !validEscalation) {
      throw new Error(`FAIL_FORWARD_LOW_STAKES_VIOLATION seq=${event.seq}`);
    }
  }
}

export function assertTurnMonotonicity(events: ReplayEvent[]): void {
  let prev: number | null = null;
  for (const event of events) {
    if (!Number.isInteger(event.seq)) {
      throw new Error("TURN_INDEX_NOT_INTEGER");
    }
    if (event.seq < 0) {
      throw new Error("TURN_INDEX_NEGATIVE");
    }
    if (prev != null && event.seq === 0) {
      throw new Error("TURN_INDEX_ZERO_REGRESSION");
    }
    if (prev != null && event.seq <= prev) {
      throw new Error("TURN_INDEX_NOT_STRICTLY_INCREASING");
    }
    prev = event.seq;
  }
}

function assertReplayStateInvariant(state: unknown): void {
  if (!isRecord(state)) {
    throw new Error("REPLAY_STATE_INVALID");
  }
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    if (!ALLOWED_REPLAY_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`REPLAY_STATE_TOP_KEY_NOT_ALLOWED key=${key}`);
    }
  }
}

function readStyleLockFromState(state: unknown, key: (typeof STYLE_LOCK_KEYS)[number]): unknown {
  if (!isRecord(state)) return undefined;
  if (isRecord(state.flags) && key in state.flags) {
    return state.flags[key];
  }
  if (isRecord(state.world) && isRecord(state.world.flags) && key in state.world.flags) {
    return state.world.flags[key];
  }
  return undefined;
}

function styleStabilityKey(key: (typeof STYLE_LOCK_KEYS)[number]): keyof StyleStabilitySummary {
  if (key === "toneLock") return "toneStable";
  if (key === "genreLock") return "genreStable";
  return "pacingStable";
}

function readLedgerAddsForStyleOverride(turnJson: unknown): unknown[] {
  if (!isRecord(turnJson)) return [];
  if (Array.isArray(turnJson.ledgerAdds)) return turnJson.ledgerAdds;
  if (isRecord(turnJson.turnJson) && Array.isArray(turnJson.turnJson.ledgerAdds)) {
    return turnJson.turnJson.ledgerAdds;
  }
  return [];
}

function hasStyleOverrideBoolean(ledgerAdds: unknown[]): boolean {
  for (const entry of ledgerAdds) {
    if (!isRecord(entry)) continue;
    if (entry.style_override === true || entry.styleOverride === true) {
      return true;
    }
    try {
      const text = stableStringifyDeterministic(entry, "style.override.bool");
      if (text.includes("\"style_override\":true") || text.includes("\"styleOverride\":true")) {
        return true;
      }
    } catch {
      const fallback = JSON.stringify(entry);
      if (
        typeof fallback === "string" &&
        (fallback.includes("\"style_override\":true") || fallback.includes("\"styleOverride\":true"))
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasStyleOverrideMarker(ledgerAdds: unknown[]): boolean {
  for (const entry of ledgerAdds) {
    try {
      const text = stableStringifyDeterministic(entry, "style.override.marker");
      if (text.includes("STYLE_OVERRIDE")) {
        return true;
      }
    } catch {
      const fallback = JSON.stringify(entry);
      if (typeof fallback === "string" && fallback.includes("STYLE_OVERRIDE")) {
        return true;
      }
    }
  }
  return false;
}

function assertStyleLockInvariant(
  prevState: unknown,
  nextState: unknown,
  turnJson: unknown,
  seq: number,
  flipCounts: Map<(typeof STYLE_LOCK_KEYS)[number], number>,
  stability: StyleStabilitySummary,
): boolean {
  let styleLockSeen = false;
  const ledgerAdds = readLedgerAddsForStyleOverride(turnJson);
  const hasOverrideBoolean = hasStyleOverrideBoolean(ledgerAdds);
  const hasOverrideToken = hasStyleOverrideMarker(ledgerAdds);
  for (const key of STYLE_LOCK_KEYS) {
    const prevValue = readStyleLockFromState(prevState, key);
    const nextValue = readStyleLockFromState(nextState, key);
    if (prevValue !== undefined || nextValue !== undefined) {
      styleLockSeen = true;
    }

    if (prevValue !== undefined) {
      if (typeof prevValue !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(prevValue)) {
        throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=invalid_previous_value`);
      }
    }
    if (nextValue !== undefined) {
      if (typeof nextValue !== "string" || !STYLE_LOCK_ALLOWED_VALUES.has(nextValue)) {
        throw new Error(`STYLE_LOCK_VIOLATION seq=${seq} key=${key} reason=invalid_next_value`);
      }
    }

    if ((prevValue !== undefined || nextValue !== undefined) && prevValue !== nextValue) {
      stability[styleStabilityKey(key)] = false;
      stability.driftCount += 1;
    }

    if (prevValue !== undefined && nextValue === undefined) {
      throw new Error(`STYLE_LOCK_DRIFT_VIOLATION seq=${seq} key=${key} reason=deleted`);
    }

    if (prevValue !== undefined && nextValue !== undefined && prevValue !== nextValue) {
      if (!hasOverrideBoolean) {
        throw new Error(`STYLE_LOCK_DRIFT_VIOLATION seq=${seq} key=${key} reason=override_required`);
      }
      if (!hasOverrideToken) {
        throw new Error(`STYLE_OVERRIDE_MISSING_LEDGER seq=${seq} key=${key}`);
      }
      const nextFlipCount = (flipCounts.get(key) ?? 0) + 1;
      flipCounts.set(key, nextFlipCount);
      if (nextFlipCount > 1) {
        throw new Error(`STYLE_LOCK_DRIFT_VIOLATION seq=${seq} key=${key} reason=multiple_flips`);
      }
    }
  }
  return styleLockSeen;
}

export function assertDeltaApplyIdempotency(
  state: unknown,
  deltas: unknown[],
  applyFn: (base: any, inputDeltas: unknown[]) => unknown = (base, inputDeltas) => applyDeltas(base, inputDeltas as any),
): void {
  const stateA = applyFn(structuredClone(state), deltas);
  const stateB = applyFn(structuredClone(state), deltas);
  const hashA = stableStringifyDeterministic(stateA, "idempotency.a");
  const hashB = stableStringifyDeterministic(stateB, "idempotency.b");
  if (hashA !== hashB) {
    throw new Error("DELTA_APPLY_NON_IDEMPOTENT");
  }
}

export type ReplayWithGuardSummary = {
  state: any;
  guardSummary: readonly ReplayGuardName[];
  styleLockPresent: boolean;
  styleStability: StyleStabilitySummary;
  memoryStability: MemoryStabilitySummary;
  failForwardCheck: "PASS" | "FAIL";
  failForwardSignal: FailForwardSignal | "NONE";
  causalCoverage: CausalCoverageSummary;
  consequenceSummary: ConsequenceSummary;
};

/**
 * Deterministic replay of canonical event log payloads.
 *
 * NOTE: We allow an explicit "anchor" genesis event (seq=0) to omit deltas.
 * This enables fork/anchor strategies without rewriting history.
 */
function replayStateFromTurnJsonInternal(
  events: ReplayEvent[],
  genesisState: any,
  withGuardSummary: boolean,
): any | ReplayWithGuardSummary {
  const executedGuards = new Set<ReplayGuardName>();
  const mark = (name: ReplayGuardName) => executedGuards.add(name);
  let state: any = genesisState ?? createInitialStateV1();
  let styleLockPresent = false;
  const styleLockFlipCounts = new Map<(typeof STYLE_LOCK_KEYS)[number], number>();
  const styleStability: StyleStabilitySummary = {
    toneStable: true,
    genreStable: true,
    pacingStable: true,
    driftCount: 0,
  };
  let memoryStability: MemoryStabilitySummary = {
    cardsTriggered: 0,
    cardsApplied: 0,
    memoryHash: stableHashHex64("[]"),
  };
  const memoryDigestRows: Array<{ seq: number; triggered: string[]; applied: string[] }> = [];
  let failForwardSignal: FailForwardSignal | "NONE" = "NONE";
  let causalCoverage: CausalCoverageSummary = {
    totalDeltas: 0,
    explainedDeltas: 0,
    unexplainedDeltas: 0,
    coverageRatio: 1,
  };
  let consequenceSummary: ConsequenceSummary = {
    riskLevel: "LOW",
    costTypes: [],
    escalation: "NONE",
  };

  assertTurnMonotonicity(events);
  mark("TURN_MONOTONICITY");
  assertLedgerConsistency(events);
  mark("LEDGER_CONSISTENCY");
  const failForwardSignals = assertFailForwardInvariant(events);
  failForwardSignal = [...failForwardSignals.values()].sort(compareFailForwardSignalPriority)[0] ?? "NONE";
  mark("FAIL_FORWARD_INVARIANT");
  consequenceSummary = aggregateConsequences(events.map((event) => event.turnJson));
  assertFailForwardConsequenceAlignment(events);

  for (const e of events) {
    const rawDeltas = getReplayDeltasStrict(e);
    rawDeltas.forEach((delta) => {
      assertStateDeltaShape(delta);
      assertDeltaNamespaceAllowed(delta);
    });
    mark("DELTA_SHAPE");
    mark("DELTA_NAMESPACE");
    const deltas = assertDeltaOrderIsSorted(rawDeltas, e.seq);
    mark("DELTA_ORDER");

    assertDeltaApplyIdempotency(state, deltas);
    mark("DELTA_APPLY_IDEMPOTENCY");

    const nextState = applyDeltas(state, deltas as any);
    styleLockPresent =
      assertStyleLockInvariant(state, nextState, e.turnJson, e.seq, styleLockFlipCounts, styleStability) ||
      styleLockPresent;
    mark("STYLE_LOCK_INVARIANT");
    const cardSignals = extractStoryCardSignals(e.turnJson);
    for (const triggerEntry of cardSignals.triggerEntries) {
      let triggerText = "";
      try {
        triggerText = stableStringifyDeterministic(triggerEntry, `story.trigger.${e.seq}`).toLowerCase();
      } catch {
        throw new Error(`STORY_CARD_NON_DETERMINISTIC_TRIGGER seq=${e.seq}`);
      }
      for (const pattern of STORY_CARD_NON_DETERMINISTIC_PATTERNS) {
        if (pattern.test(triggerText)) {
          throw new Error(`STORY_CARD_NON_DETERMINISTIC_TRIGGER seq=${e.seq}`);
        }
      }
    }
    const sortedTriggered = [...cardSignals.triggeredCardIds].sort(compareText);
    if (cardSignals.triggeredCardIds.join("|") !== sortedTriggered.join("|")) {
      throw new Error(`STORY_CARD_ORDER_UNSTABLE seq=${e.seq}`);
    }
    const sortedApplied = [...cardSignals.appliedCardIds].sort(compareText);
    assertMemoryMutationProtectedNamespace(e.turnJson, e.seq);
    memoryDigestRows.push({
      seq: e.seq,
      triggered: sortedTriggered,
      applied: sortedApplied,
    });
    memoryStability = {
      cardsTriggered: memoryStability.cardsTriggered + sortedTriggered.length,
      cardsApplied: memoryStability.cardsApplied + sortedApplied.length,
      memoryHash: memoryStability.memoryHash,
    };
    mark("MEMORY_STABILITY");
    state = nextState;
  }
  memoryStability.memoryHash = stableHashHex64(stableStringifyDeterministic(memoryDigestRows, "memory.digest"));
  causalCoverage = assertCausalCoverage(events);
  mark("CAUSAL_COVERAGE");
  assertReplayStateInvariant(state);
  mark("REPLAY_STATE_INVARIANT");

  if (withGuardSummary) {
    return {
      state,
      guardSummary: REPLAY_GUARD_ORDER.filter((name) => executedGuards.has(name)),
      styleLockPresent,
      styleStability,
      memoryStability,
      failForwardCheck: "PASS",
      failForwardSignal,
      causalCoverage,
      consequenceSummary,
    };
  }

  return state;
}

export function deriveStyleStabilityFromEvents(
  events: Array<{ seq: number; turnJson: any }>,
  genesisState?: unknown,
): StyleStabilitySummary {
  let state: unknown = genesisState ?? createInitialStateV1();
  const sortedEvents = [...events].sort((a, b) => a.seq - b.seq);
  const flipCounts = new Map<(typeof STYLE_LOCK_KEYS)[number], number>();
  const stability: StyleStabilitySummary = {
    toneStable: true,
    genreStable: true,
    pacingStable: true,
    driftCount: 0,
  };

  for (const event of sortedEvents) {
    const deltas = getReplayDeltas(event as ReplayEvent);
    const nextState = applyDeltas(state, deltas as any);
    assertStyleLockInvariant(state, nextState, event.turnJson, event.seq, flipCounts, stability);
    state = nextState;
  }

  return stability;
}

export function replayStateFromTurnJson(
  events: ReplayEvent[],
  genesisState?: any,
) {
  return replayStateFromTurnJsonInternal(events, genesisState, false) as any;
}

export function replayStateFromTurnJsonWithGuardSummary(
  events: ReplayEvent[],
  genesisState?: any,
): ReplayWithGuardSummary {
  return replayStateFromTurnJsonInternal(events, genesisState, true) as ReplayWithGuardSummary;
}
