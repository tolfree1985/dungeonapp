"use client";

import type { PlayTurn, PlayStatePanel } from "@/app/play/types";
import { formatTurnTimestamp } from "@/lib/ui/formatters";

type ResolvedResolution = Record<string, unknown>;

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

function splitLabelAndJson(value?: string | null): { label: string; record: Record<string, unknown> | null } {
  if (!value) return { label: "", record: null };
  const trimmed = value.trim();
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    return { label: trimmed, record: null };
  }
  const prefix = trimmed.slice(0, firstBrace).trim();
  const jsonPart = trimmed.slice(firstBrace).trim();
  const record = tryParseJson(jsonPart);
  return { label: prefix || trimmed, record };
}

function buildRecordDetail(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const pieces: string[] = [];
  if (record.detail) pieces.push(describeValue(record.detail));
  if (record.description) pieces.push(describeValue(record.description));
  if (record.clue) pieces.push(describeValue(record.clue));
  if (record.stage) pieces.push(`Stage: ${describeValue(record.stage)}`);
  if (record.status) pieces.push(`Status: ${describeValue(record.status)}`);
  if (record.qty !== undefined) pieces.push(`Qty: ${record.qty}`);
  if (record.tags) {
    if (Array.isArray(record.tags)) {
      pieces.push(`Tags: ${record.tags.map((tag) => describeValue(tag)).join(", ")}`);
    } else {
      pieces.push(`Tags: ${describeValue(record.tags)}`);
    }
  }
  return pieces.filter(Boolean).join(" • ") || null;
}

function describePlainText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
  return trimmed;
}

function normalizeResolutionValue(value: unknown): ResolvedResolution | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as ResolvedResolution;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = tryParseJson(trimmed);
    if (parsed) return parsed;
  }
  return null;
}

function formatTierLabel(tier?: string | null): string | null {
  if (!tier) return null;
  return tier
    .replace(/[\-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function describeResolutionOutcome(resolution: ResolvedResolution | null, fallback?: string | null): string | null {
  if (typeof resolution?.outcome === "string" && resolution.outcome.trim()) {
    return resolution.outcome.trim();
  }
  const tierValue = formatTierLabel(
    typeof resolution?.band === "string" && resolution.band.trim()
      ? resolution.band
      : typeof resolution?.tier === "string" && resolution.tier.trim()
      ? resolution.tier
      : null
  );
  if (tierValue) return tierValue;
  return fallback ?? null;
}

function describeResolutionAction(resolution: ResolvedResolution | null): string | null {
  const intent = typeof resolution?.intent === "string" ? resolution.intent.trim() : null;
  const action = typeof resolution?.action === "string" ? resolution.action.trim() : null;
  if (intent) return intent;
  if (action) return action;
  return null;
}

function describeResolutionNotes(resolution: ResolvedResolution | null): string | null {
  if (typeof resolution?.notes === "string" && resolution.notes.trim()) {
    return resolution.notes.trim();
  }
  if (typeof resolution?.description === "string" && resolution.description.trim()) {
    return resolution.description.trim();
  }
  return null;
}

type RollInfo = {
  rollTotal?: number;
  dice?: number[];
  tier?: string;
};

function extractRollInfo(value: unknown): RollInfo {
  const normalized = normalizeResolutionValue(value);
  if (!normalized) return {};
  const rollTotal = typeof normalized.rollTotal === "number" ? normalized.rollTotal : undefined;
  const dice = Array.isArray(normalized.dice)
    ? (normalized.dice.filter((entry) => typeof entry === "number") as number[])
    : undefined;
  const tierField =
    typeof normalized.band === "string"
      ? normalized.band
      : typeof normalized.tier === "string"
      ? normalized.tier
      : typeof normalized.outcome === "string"
      ? normalized.outcome
      : undefined;
  return {
    rollTotal,
    dice: dice && dice.length > 0 ? dice : undefined,
    tier: tierField,
  };
}

function buildRollSummary(rollTotal?: number, dice?: number[]): string | null {
  if (rollTotal === undefined) return null;
  const diceLabel = dice && dice.length > 0 ? `${dice.length}d6` : "Roll";
  return `${diceLabel} → ${rollTotal}`;
}

function buildRollDetail(dice?: number[]): string | null {
  if (!dice || dice.length === 0) return null;
  return `Dice: ${dice.join(" + ")}`;
}

export type LedgerCategory = "pressure" | "world" | "quest" | "inventory" | "npc" | "time";

export type LedgerEntryViewModel = {
  id: string;
  category: LedgerCategory;
  cause: string;
  effect: string;
  emphasis?: "normal" | "high";
};

export type LatestTurnViewModel = {
  turnIndex: number | null;
  mode: "DO" | "SAY" | "LOOK" | null;
  playerInput: string | null;
  sceneText: string | null;
  outcomeLabel: string | null;
  pressureLabel: string;
  ledgerEntries: LedgerEntryViewModel[];
  stateDeltas: Array<{
    key: string;
    value: string;
  }>;
  rollSummary?: string | null;
  rollDetail?: string | null;
  outcomeTierLabel?: string | null;
  intentLabel?: string | null;
  notesLabel?: string | null;
};

export type StateItemCategory = "world" | "quest" | "inventory" | "status" | "relation";

export type StateItemViewModel = {
  label: string;
  value: string;
  category: StateItemCategory;
  emphasis?: "normal" | "high";
};

export type StatePanelViewModel = {
  status: StateItemViewModel[];
  world: StateItemViewModel[];
  quests: StateItemViewModel[];
  inventory: StateItemViewModel[];
  relations: StateItemViewModel[];
};

export type AdventureHistoryRowViewModel = {
  turnIndex: number;
  mode: "DO" | "SAY" | "LOOK" | null;
  command: string;
  outcome: string | null;
  pressure: string;
  consequenceSummary: string[];
  timestampLabel: string;
  tierLabel?: string | null;
};

function parseModeLabel(input?: string | null) {
  if (!input) return undefined;
  const match = input.match(/^([A-Za-z]+):\s*/);
  return match ? match[1].toUpperCase() : undefined;
}

function parseIntentMode(input?: string | null): "DO" | "SAY" | "LOOK" | null {
  const label = parseModeLabel(input);
  if (!label) return null;
  if (label === "DO" || label === "SAY" || label === "LOOK") {
    return label;
  }
  return null;
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function describeStateDelta(delta: unknown): LatestTurnViewModel["stateDeltas"][number] | null {
  if (!delta) return null;
  if (typeof delta === "string") {
    const trimmed = delta.trim();
    if (!trimmed) return null;
    return { key: "State change", value: trimmed };
  }
  if (typeof delta === "object" && !Array.isArray(delta)) {
    const record = delta as Record<string, unknown>;
    const key =
      typeof record.key === "string"
        ? record.key
        : typeof record.name === "string"
        ? record.name
        : "State change";
    const value =
      record.value !== undefined
        ? describeValue(record.value)
        : record.detail !== undefined
        ? describeValue(record.detail)
        : record.description !== undefined
        ? describeValue(record.description)
        : undefined;
    if (!value) return null;
    return { key, value };
  }
  if (Array.isArray(delta) && delta.length > 0) {
    const flattened = delta.map((item) => describeValue(item)).join(", ");
    if (!flattened) return null;
    return { key: "State change", value: flattened };
  }
  return null;
}

const statusStatKeys = new Set([
  "pressure stage",
  "alert",
  "noise",
  "heat",
  "time",
  "trust",
  "turns",
  "progress",
  "alertness",
]);
const worldStatKeys = new Set(["location", "ambience", "time of day", "scene", "progress"]);

function classifyStatCategory(label: string): StateItemCategory {
  const normalized = label.toLowerCase();
  if (worldStatKeys.has(normalized)) return "world";
  if (statusStatKeys.has(normalized)) return "status";
  return "status";
}

function buildStateItem(label: string | undefined, value: unknown, category: StateItemCategory, emphasis?: "normal" | "high"): StateItemViewModel | null {
  if (!label) return null;
  const formattedValue = describeValue(value);
  if (!formattedValue) return null;
  return {
    label,
    value: formattedValue,
    category,
    emphasis,
  };
}

function normalizeLabel(label: string): string {
  return label.trim();
}

function buildStatePanelViewModelFromStats(state: PlayStatePanel): StatePanelViewModel {
  const seenLabels = new Set<string>();
  const statusItems: StateItemViewModel[] = [];
  const worldItems: StateItemViewModel[] = [];

  state.stats.forEach((stat) => {
    const label = normalizeLabel(stat.key);
    if (!label) return;
    const normalized = label.toLowerCase();
    if (seenLabels.has(normalized)) return;
    seenLabels.add(normalized);
    const category = classifyStatCategory(normalized);
    const emphasis = normalized.includes("alert") || normalized.includes("pressure") ? "high" : "normal";
    const item = buildStateItem(label, stat.value, category, emphasis);
    if (!item) return;
    if (category === "world") {
      worldItems.push(item);
    } else {
      statusItems.push(item);
    }
  });

  return {
    status: statusItems,
    world: worldItems,
    quests: [],
    inventory: [],
    relations: [],
  };
}

function normalizeLedger(entry: unknown) {
  if (!entry) return null;
  let text: string;
  if (typeof entry === "string") {
    text = entry.replace(/^\s*•?\s*/, "").trim();
  } else if (typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    if (typeof record.cause === "string" && typeof record.effect === "string") {
      text = `${record.cause.trim()} → ${record.effect.trim()}`;
    } else if (typeof record.cause === "string") {
      text = record.cause.trim();
    } else if (typeof record.effect === "string") {
      text = record.effect.trim();
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!text) return null;

  const parts = text.split("→").map((part) => part.trim());
  const cause = parts[0] || text;
  const effects = parts[1]
    ? parts[1]
        .split(/[,;]+/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
    : [];
  return { cause, effects };
}

type FlagValue = string | number | boolean | null;

function parseStateFlagEntry(value: string): { key: string; value: FlagValue } | null {
  const trimmed = value.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex === -1) return null;
  const key = trimmed.slice(0, colonIndex).trim();
  const rawValue = trimmed.slice(colonIndex + 1).trim();
  if (!key) return null;
  if (!rawValue) return null;
  const lowered = rawValue.toLowerCase();
  if (lowered === "true") return { key, value: true };
  if (lowered === "false") return { key, value: false };
  const numeric = Number(rawValue);
  if (!Number.isNaN(numeric)) {
    return { key, value: numeric };
  }
  return { key, value: rawValue };
}

function humanizeStateFlag(key: string, value: unknown): string | null {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey === "observed.risk_2" && value === true) {
    return "Risk increases.";
  }
  if (normalizedKey.startsWith("observed.risk_")) {
    return "Risk rises.";
  }
  if (normalizedKey === "observed.partial") {
    return "Only partial information recovered.";
  }
  if (normalizedKey === "observed.noisy") {
    return "Your investigation creates noise.";
  }
  return null;
}

function tryHumanizeLedgerText(text: string): string | null {
  const flag = parseStateFlagEntry(text);
  if (!flag) return null;
  return humanizeStateFlag(flag.key, flag.value);
}

function classifyLedgerCategory(text: string): LedgerCategory {
  const normalized = text.toLowerCase();
  if (normalized.includes("pressure") || normalized.includes("tension") || normalized.includes("calm")) {
    return "pressure";
  }
  if (normalized.includes("inventory") || normalized.includes("item") || normalized.includes("artifact")) {
    return "inventory";
  }
  if (normalized.includes("quest") || normalized.includes("mission") || normalized.includes("goal")) {
    return "quest";
  }
  if (normalized.includes("npc") || normalized.includes("servant") || normalized.includes("ghost") || normalized.includes("guard")) {
    return "npc";
  }
  if (normalized.includes("time") || normalized.includes("hour") || normalized.includes("night") || normalized.includes("day")) {
    return "time";
  }
  return "world";
}

export function formatLedgerDisplay(entries: unknown[]): LedgerEntryViewModel[] {
  return entries
    .map((entry, index) => {
      const normalized = normalizeLedger(entry);
      if (!normalized) {
        return null;
      }
      const { cause, effects } = normalized;
      const humanizedCause = tryHumanizeLedgerText(cause);
      const normalizedEffects = effects
        .map((effectText) => tryHumanizeLedgerText(effectText) ?? effectText)
        .map((text) => text.trim())
        .filter(Boolean);
      const displayCause = humanizedCause ?? cause;
      const displayEffect = normalizedEffects.join(", ");
      const category = classifyLedgerCategory(`${displayCause} ${displayEffect}`);
      const effectLower = displayEffect.toLowerCase();
      const emphasis =
        category === "pressure" || effectLower.includes("increased") || effectLower.includes("decreased")
          ? "high"
          : "normal";
      return {
        id: `${index}-${displayCause}-${displayEffect}`.replace(/\s+/g, "-").toLowerCase(),
        category,
        cause: displayCause,
        effect: displayEffect,
        emphasis,
      };
    })
    .filter((entry): entry is LedgerEntryViewModel => Boolean(entry));
}

export function buildLatestTurnViewModel(
  turn: PlayTurn,
  pressureStage: string | null | undefined
): LatestTurnViewModel {
  const pressureLabel = (pressureStage ?? "calm").toUpperCase();
  const ledgerEntries = formatLedgerDisplay(turn.ledgerAdds ?? []);
  const deltas = Array.isArray(turn.stateDeltas)
    ? turn.stateDeltas.map((delta) => describeStateDelta(delta)).filter(Boolean)
    : [];
  const resolutionSource = turn.resolutionJson ?? turn.resolution;
  const normalizedResolution = normalizeResolutionValue(resolutionSource);
  const rollInfo = extractRollInfo(resolutionSource);
  const rollSummary = buildRollSummary(rollInfo.rollTotal, rollInfo.dice);
  const rollDetail = buildRollDetail(rollInfo.dice);
  const outcomeTierLabel = formatTierLabel(rollInfo.tier ?? null);
  const fallbackPlainOutcome = describePlainText(turn.resolution ?? null);
  const outcomeLabel = describeResolutionOutcome(normalizedResolution, fallbackPlainOutcome);
  const intentLabel = describeResolutionAction(normalizedResolution);
  const notesLabel = describeResolutionNotes(normalizedResolution);
  return {
    turnIndex: Number.isFinite(turn.turnIndex) ? turn.turnIndex : null,
    mode: parseIntentMode(turn.playerInput),
    playerInput: turn.playerInput ? turn.playerInput.trim() || null : null,
    sceneText: turn.scene ? turn.scene.trim() || null : null,
    outcomeLabel,
    pressureLabel,
    ledgerEntries,
    stateDeltas: deltas,
    rollSummary,
    rollDetail,
    outcomeTierLabel,
    intentLabel,
    notesLabel,
  };
}

export function buildAdventureHistoryRowViewModel(
  turn: PlayTurn,
  pressureStage: string | null | undefined
): AdventureHistoryRowViewModel {
  const mode = parseIntentMode(turn.playerInput);
  const rawText = turn.playerInput?.trim() ?? "";
  const commandFallback = turn.turnIndex === 0 ? "Session start" : "Command not recorded";
  const command =
    rawText.replace(/^([A-Za-z]+):\s*/, "").trim() || rawText || commandFallback;
  const ledgerEntries = formatLedgerDisplay(turn.ledgerAdds ?? []);
  const consequenceSummary =
    ledgerEntries.slice(0, 2).map(({ cause, effect }) => (effect ? `${cause} → ${effect}` : cause)) ?? [];
  const pressureLabel = (pressureStage ?? "calm").toUpperCase();
  const resolutionSource = turn.resolutionJson ?? turn.resolution;
  const normalizedResolution = normalizeResolutionValue(resolutionSource);
  const fallbackOutcome =
    turn.turnIndex === 0 ? "Initial state recorded" : describePlainText(turn.resolution ?? null);
  const outcomeLabel = describeResolutionOutcome(normalizedResolution, fallbackOutcome);
  const tierCandidate =
    typeof normalizedResolution?.band === "string" && normalizedResolution.band.trim()
      ? normalizedResolution.band
      : typeof normalizedResolution?.tier === "string" && normalizedResolution.tier.trim()
      ? normalizedResolution.tier
      : typeof normalizedResolution?.outcome === "string" && normalizedResolution.outcome.trim()
      ? normalizedResolution.outcome
      : null;
  const outcomeTierLabel = formatTierLabel(tierCandidate);
  return {
    turnIndex: turn.turnIndex,
    mode,
    command,
    outcome: outcomeLabel,
    pressure: pressureLabel,
    tierLabel: outcomeTierLabel,
    consequenceSummary: consequenceSummary.length > 0 ? consequenceSummary : ["No consequences recorded."],
    timestampLabel: formatTurnTimestamp(turn.createdAt),
  };
}


function buildStateItemsFromQuest(state: PlayStatePanel): StateItemViewModel[] {
  return state.quests.map((quest, index) => {
    const rawLabel = quest.title ?? quest.label ?? quest.detail ?? `Quest ${index + 1}`;
    const { label: prefixLabel, record } = splitLabelAndJson(rawLabel);
    const recordName = record?.name ? describeValue(record.name) : null;
    const recordLabel = record?.label ? describeValue(record.label) : null;
    const recordId = record?.id ? describeValue(record.id) : null;
    const label =
      recordName ??
      recordLabel ??
      prefixLabel ??
      recordId ??
      `Quest ${index + 1}`;
    const detailSources: string[] = [];
    const recordDetail = buildRecordDetail(record);
    if (recordDetail) detailSources.push(recordDetail);
    if (quest.status && quest.status.trim()) {
      const statusValue = quest.status.trim();
      if (record?.status ? statusValue !== describeValue(record.status) : true) {
        detailSources.push(statusValue);
      }
    }
    if (typeof quest.detail === "string" && quest.detail.trim()) {
      const detailCandidate = quest.detail.trim();
      if (detailCandidate !== rawLabel) {
        const { label: detailLabel, record: detailRecord } = splitLabelAndJson(detailCandidate);
        const detailFromRecord = buildRecordDetail(detailRecord);
        if (detailFromRecord) {
          detailSources.push(detailFromRecord);
        } else if (detailLabel && detailLabel !== rawLabel) {
          detailSources.push(detailLabel);
        } else {
          detailSources.push(detailCandidate);
        }
      }
    }
    const value = detailSources.length > 0 ? detailSources.join(" • ") : "In progress";
    const emphasis = value.toLowerCase().includes("urgent") ? "high" : "normal";
    return {
      label,
      value,
      category: "quest",
      emphasis,
    };
  });
}

function buildInventoryItems(state: PlayStatePanel): StateItemViewModel[] {
  return state.inventory.map((item, index) => {
    const rawName = item.name ?? item.detail ?? `Item ${index + 1}`;
    const { label: prefixLabel, record } = splitLabelAndJson(rawName);
    const recordName = record?.name ? describeValue(record.name) : null;
    const recordLabel = record?.label ? describeValue(record.label) : null;
    const recordId = describeValue(record?.id);
    const label =
      recordName ??
      recordLabel ??
      prefixLabel ??
      recordId ??
      `Item ${index + 1}`;
    const detailSources: string[] = [];
    const recordDetail = buildRecordDetail(record);
    if (recordDetail) detailSources.push(recordDetail);
    if (typeof item.detail === "string" && item.detail.trim()) {
      const detailCandidate = item.detail.trim();
      if (detailCandidate !== rawName) {
        const { label: detailLabel, record: detailRecord } = splitLabelAndJson(detailCandidate);
        const detailFromRecord = buildRecordDetail(detailRecord);
        if (detailFromRecord) {
          detailSources.push(detailFromRecord);
        } else if (detailLabel && detailLabel !== rawName) {
          detailSources.push(detailLabel);
        } else {
          detailSources.push(detailCandidate);
        }
      }
    }
    const value = detailSources.length > 0 ? detailSources.join(" • ") : "In pack";
    const emphasis = value.toLowerCase().includes("rare") ? "high" : "normal";
    return {
      label,
      value,
      category: "inventory",
      emphasis,
    };
  });
}

function buildRelationItems(state: PlayStatePanel): StateItemViewModel[] {
  return state.relationships.map((relationship) => {
    const status = relationship.status?.trim() || "Neutral";
    const emphasis = status.toLowerCase().includes("suspicious") || status.toLowerCase().includes("alerted") ? "high" : "normal";
    return {
      label: relationship.name,
      value: status,
      category: "relation",
      emphasis,
    };
  });
}

function addWorldContextRows(state: PlayStatePanel, worldItems: StateItemViewModel[], seenLabels: Set<string>) {
  const contextRows: Array<[string, string | undefined]> = [
    ["Location", state.location],
    ["Time of day", state.timeOfDay],
    ["Ambience", state.ambience],
  ];
  contextRows.forEach(([label, value]) => {
    if (!value) return;
    const normalized = label.toLowerCase();
    if (seenLabels.has(normalized)) return;
    seenLabels.add(normalized);
    const item = buildStateItem(label, value, "world");
    if (item) worldItems.push(item);
  });
  if (state.contextTags && state.contextTags.length > 0) {
    const normalized = "context tags";
    if (!seenLabels.has(normalized)) {
      seenLabels.add(normalized);
      const item = buildStateItem("Context tags", state.contextTags.join(", "), "world");
      if (item) worldItems.push(item);
    }
  }
}

export function buildStatePanelViewModel(state: PlayStatePanel): StatePanelViewModel {
  const seenLabels = new Set<string>();
  const statusItems: StateItemViewModel[] = [];
  const worldItems: StateItemViewModel[] = [];

  state.stats.forEach((stat) => {
    const label = normalizeLabel(stat.key);
    if (!label) return;
    const normalized = label.toLowerCase();
    if (seenLabels.has(normalized)) return;
    seenLabels.add(normalized);
    const category = classifyStatCategory(normalized);
    const emphasis = normalized.includes("alert") || normalized.includes("pressure") ? "high" : "normal";
    const item = buildStateItem(label, stat.value, category, emphasis);
    if (!item) return;
    if (category === "world") {
      worldItems.push(item);
    } else {
      statusItems.push(item);
    }
  });

  addWorldContextRows(state, worldItems, seenLabels);

  const quests = buildStateItemsFromQuest(state);
  const inventory = buildInventoryItems(state);
  const relations = buildRelationItems(state);

  return {
    status: statusItems,
    world: worldItems,
    quests,
    inventory,
    relations,
  };
}
