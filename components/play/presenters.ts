"use client";

import type {
  PlayTurn,
  PlayStatePanel,
  PlayTurnPresentation,
  PressureStage,
  StatePrioritySignal,
} from "@/app/play/types";
import type { StateTier } from "@/lib/ui/present-state-tier";
import {
  presentAlertTier,
  presentDangerTier,
  presentNoiseTier,
  presentOverallRiskTier,
  presentSuspicionTier,
  presentTrustTier,
} from "@/lib/ui/present-state-tier";
import type { FailForwardComplication } from "@/lib/fail-forward-complication";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import type { OpportunityResolutionModifier } from "@/lib/opportunity-resolution-modifier";
import type { OpportunityWindowState } from "@/lib/opportunity-window";
import type { WatchfulnessActionFlags } from "@/lib/watchfulness-action-flags";
import type { PositionActionFlags } from "@/lib/position-action-flags";
import type { NoiseActionFlags } from "@/lib/noise-action-flags";
import type { ActionConstraints } from "@/lib/action-constraints";
import { formatTurnTimestamp } from "@/lib/ui/formatters";
import { flattenNarrationLines } from "@/server/scene/finalized-consequence-narration";
import type { ConsequenceEntry } from "@/server/scene/consequence-bundle";
import { projectLedgerEntries, type LedgerPresentationEntry } from "@/server/scene/ledger-presentation";
import { buildPlayTurnPresentation } from "@/app/play/normalizeTurnPresentation";
import type { TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";
import type { InventoryDelta } from "@/lib/engine/types/inventory";
import { shapeTurnPresentation } from "@/lib/presentation/shapeTurnPresentation";
import { mapLedgerText } from "@/lib/presentation/ledgerLabels";
import {
  describeMetricDetail,
  describePressureSummary,
  describeTurnPressure,
  PressureAxis,
  PressureSummary,
} from "@/lib/presentation/pressureLanguage";
import type { StateSummaryBucket } from "@/lib/engine/presentation/stateSummaryTranslator";
import {
  ConsequenceCategory,
  ConsequenceLine,
  translateConsequences,
} from "@/lib/engine/presentation/consequenceTranslator";

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

const THRESHOLD_EVENT_LABELS: Record<string, string> = {
  guard_alerted: "Guard alerted",
  area_compromised: "Area compromised",
  window_narrowed: "Window narrowed",
  situation_critical: "Situation critical",
};

function extractPressureChange(delta: unknown): { domain: string; amount: number } | null {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return null;
  const record = delta as Record<string, unknown>;
  if (record.kind !== "pressure.add") return null;
  const domain = typeof record.domain === "string" ? record.domain : null;
  const amount = typeof record.amount === "number" ? record.amount : null;
  if (!domain || amount === null) return null;
  return { domain, amount };
}

function extractThresholdEvent(delta: unknown): string | null {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return null;
  const record = delta as Record<string, unknown>;
  if (record.kind !== "flag.set") return null;
  const key = typeof record.key === "string" ? record.key : null;
  if (!key) return null;
  return THRESHOLD_EVENT_LABELS[key] ?? null;
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
  priority: number;
};

export type LatestTurnViewModel = {
  turnIndex: number | null;
  mode: "DO" | "SAY" | "LOOK" | null;
  playerInput: string | null;
  sceneText: string | null;
  sceneSummary: string | null;
  storyBeat: string;
  outcomeLabel: string | null;
  pressureLabel: string;
  ledgerEntries: LedgerEntryViewModel[];
  stateDeltas: Array<{
    key: string;
    value: string;
  }>;
  pressureChanges: Array<{ domain: string; amount: number }>;
  thresholdEvents: string[];
  worldConsequences: string[];
  riskConsequences: string[];
  opportunityConsequences: string[];
  persistentWorldConsequences: string[];
  persistentRiskConsequences: string[];
  persistentOpportunityConsequences: string[];
  fireNarrationLine?: string | null;
  rollSummary?: string | null;
  rollDetail?: string | null;
  outcomeTierLabel?: string | null;
  intentLabel?: string | null;
  notesLabel?: string | null;
  presentation: PlayTurnPresentation;
  failForwardComplication: FailForwardComplication | null;
  effectSummaries: FinalizedEffectSummary[];
  watchfulness?: string | null;
  watchfulnessCostDelta?: number | null;
  watchfulnessEffect?: FinalizedEffectSummary | null;
  watchfulnessActionFlags?: WatchfulnessActionFlags | null;
  positionActionFlags?: PositionActionFlags | null;
  noiseActionFlags?: NoiseActionFlags | null;
  actionConstraints?: ActionConstraints | null;
  constraintPressure?: number | null;
  constraintPressureActive?: string[] | null;
  actionRiskDelta?: number | null;
  actionRiskTier?: "none" | "elevated" | "high" | null;
  complicationWeightDelta?: number | null;
  complicationTier?: "none" | "light" | "heavy" | null;
  forcedComplicationCount?: number | null;
  outcomeSeverity?: OutcomeSeverity | null;
  consequenceBudgetExtraCostCount?: number | null;
  consequenceComplicationEntries?: ConsequenceEntry[] | null;
  consequenceExtraCostEntries?: ConsequenceEntry[] | null;
  consequenceNarration?: { headline: string; lines: string[] } | null;
  narrationLines: string[];
  consequenceLedgerEntries: LedgerPresentationEntry[];
  followUpHook?: string | null;
  pressureNote?: string | null;
  opportunityWindow: OpportunityWindowState;
  opportunityResolutionModifier?: OpportunityResolutionModifier | null;
  opportunityCost?: string | null;
  finalizedComplications?: string[];
  complicationApplied?: boolean;
  finalizedComplicationDeltas?: Record<string, number>;
  complicationDeltaApplied?: boolean;
  npcStance?: string | null;
  pressureStage: PressureStage;
};

export type StateItemCategory = "world" | "quest" | "inventory" | "status" | "relation";

export type StateItemViewModel = {
  label: string;
  value: string;
  category: StateItemCategory;
  emphasis?: "normal" | "high";
};

export type PresentedStateMetric = {
  raw: number;
  label: string;
};

export type StatePanelViewModel = {
  status: StateItemViewModel[];
  world: StateItemViewModel[];
  quests: StateItemViewModel[];
  inventory: StateItemViewModel[];
  relations: StateItemViewModel[];
  metrics: {
    alert: PresentedStateMetric | null;
    noise: PresentedStateMetric | null;
    heat: PresentedStateMetric | null;
    trust: PresentedStateMetric | null;
  };
  time: number | null;
  turns: number | null;
  risk: StateTier | null;
  pressureStage: PressureStage;
  pressureSummary: PressureSummary;
  pressureAxisDescriptions: Record<PressureAxis, string>;
  pressureTotals: {
    suspicion: number;
    noise: number;
    time: number;
    danger: number;
  };
  prioritySignals: StatePrioritySignal[];
  summary: StateSummaryBucket;
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

function parseNumericStateValue(value: PlayStatePanel["stats"][number]["value"]): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
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

function normalizePressureStage(stage?: string | null): PressureStage {
  if (!stage) return "calm";
  const normalized = stage.trim().toLowerCase();
  if (normalized === "tension") return "tension";
  if (normalized === "danger") return "danger";
  if (normalized === "crisis") return "crisis";
  return "calm";
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

function computeLedgerPriority(cause: string, effect: string, category: LedgerCategory): number {
  const combined = `${cause} ${effect}`.toLowerCase();
  if (/fire|burn|ignite/.test(combined)) return 100;
  if (/crate/.test(combined) && /(open|pried|search|splinter)/.test(combined)) return 95;
  if (/clue|evidence|hidden/.test(combined)) return 90;
  if (category === "quest") return 85;
  if (/noise|watch|attention|suspicion|alert/.test(combined)) return 80;
  if (/danger|risk|heat/.test(combined)) return 75;
  if (category === "pressure" || category === "time") return 70;
  if (/time/.test(combined)) return 65;
  return 50;
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
  const displayCause = mapLedgerText(humanizedCause ?? cause);
  const mappedEffects = normalizedEffects.map((value) => mapLedgerText(value));
  const displayEffect = mappedEffects.join(", ");
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
        priority: computeLedgerPriority(displayCause, displayEffect, category),
      };
    })
    .filter((entry): entry is LedgerEntryViewModel => Boolean(entry))
    .sort((a, b) => b.priority - a.priority);
}

export function buildLatestTurnViewModel(
  turn: PlayTurn,
  pressureStage: string | null | undefined,
  context?: { recentSceneSummaries?: string[] }
): LatestTurnViewModel {
  const resolvedPressureStage = normalizePressureStage(pressureStage ?? null);
  const pressureLabel = resolvedPressureStage.toUpperCase();
  const ledgerEntries = formatLedgerDisplay(turn.ledgerAdds ?? []);
  const deltas = Array.isArray(turn.stateDeltas)
    ? turn.stateDeltas.map((delta) => describeStateDelta(delta)).filter(Boolean)
    : [];
  const rawStateDeltas = Array.isArray(turn.stateDeltas) ? turn.stateDeltas : [];
  const pressureChanges = rawStateDeltas
    .map(extractPressureChange)
    .filter((entry): entry is { domain: string; amount: number } => Boolean(entry));
  const pressureNote = describeTurnPressure(pressureChanges) ?? null;
  const thresholdEvents = rawStateDeltas
    .map(extractThresholdEvent)
    .filter((label): label is string => Boolean(label));
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
  const opportunityWindow =
    turn.opportunityWindow ?? { windowNarrowed: false, opportunityTier: "normal" };
  const opportunityResolutionModifier = turn.opportunityResolutionModifier ?? null;
  const opportunityCost = turn.opportunityCost ?? null;
  const finalizedComplications = turn.finalizedComplications ?? [];
  const complicationApplied = Boolean(turn.complicationApplied);
  const finalizedComplicationDeltas = (turn.finalizedComplicationDeltas ?? {}) as Record<string, number>;
  const complicationDeltaApplied = Boolean(turn.complicationDeltaApplied);
  const npcStance = turn.npcStance ?? "calm";
  const watchfulness = turn.watchfulness ?? null;
  const watchfulnessCostDelta = typeof turn.watchfulnessCostDelta === "number" ? turn.watchfulnessCostDelta : null;
  const watchfulnessEffect = turn.watchfulnessEffect ?? null;
  const watchfulnessActionFlags = turn.watchfulnessActionFlags ?? null;
  const positionActionFlags = turn.positionActionFlags ?? null;
  const noiseActionFlags = turn.noiseActionFlags ?? null;
  const actionConstraints = turn.actionConstraints ?? null;
  const constraintPressure = typeof turn.constraintPressure === "number" ? turn.constraintPressure : null;
  const constraintPressureActive = turn.constraintPressureActive ?? null;
  const actionRiskDelta = typeof turn.actionRiskDelta === "number" ? turn.actionRiskDelta : null;
  const actionRiskTier = turn.actionRiskTier ?? null;
  const complicationWeightDelta = typeof turn.complicationWeightDelta === "number" ? turn.complicationWeightDelta : null;
  const complicationTier = turn.complicationTier ?? null;
  const forcedComplicationCount = typeof turn.forcedComplicationCount === "number" ? turn.forcedComplicationCount : null;
  const complicationPolicyApplied = Boolean(turn.complicationPolicyApplied);
  const outcomeSeverity = turn.outcomeSeverity ?? null;
  const consequenceBudgetExtraCostCount = typeof turn.consequenceBudgetExtraCostCount === "number" ? turn.consequenceBudgetExtraCostCount : null;
  const consequenceComplicationEntries = turn.consequenceComplicationEntries ?? [];
  const consequenceExtraCostEntries = turn.consequenceExtraCostEntries ?? [];
  const normalizedPresentation = buildPlayTurnPresentation(turn);
  const turnPresentation: PlayTurnPresentation = turn.presentation ?? normalizedPresentation;
  const consequenceNarration = turnPresentation.narration;
  const narrationLines = consequenceNarration ? flattenNarrationLines(consequenceNarration) : [];
  const consequenceLedgerEntries = turnPresentation.ledgerEntries;
  const rawLedgerLines = [
    ...(consequenceLedgerEntries ?? []).map((entry) =>
      (entry as { narrationText?: string; ledgerText?: string }).narrationText ??
      (entry as { ledgerText?: string }).ledgerText ??
      entry.text ??
      ""
    ),
    ...(consequenceComplicationEntries ?? []).map((entry) =>
      entry.narrationText ?? entry.ledgerText ?? ""
    ),
    ...(consequenceExtraCostEntries ?? []).map((entry) =>
      entry.narrationText ?? entry.ledgerText ?? ""
    ),
  ];
  const rawConsequenceLines = [
    ...(consequenceNarration?.lines ?? []),
    ...rawLedgerLines,
  ]
    .map((line) => line.trim())
    .filter(Boolean);

  const stateFlags = (turn as any).stateFlags as Record<string, unknown> | null;
  const translatedConsequences = translateConsequences({
    stateFlags,
    stateDeltas: rawStateDeltas,
    ledgerAdds: turn.ledgerAdds ?? [],
  });
  const persistentLines = translatedConsequences.filter((line) => line.scope === "persistent");
  const turnLines = translatedConsequences.filter((line) => line.scope === "turn");
  const hasAccelerantFire =
    stateFlags?.["scene.fire.accelerant"] === true ||
    persistentLines.some(
      (line) =>
        line.category === "world" &&
        line.text.toLowerCase().includes("burning fast")
    );
  const hasSceneFire =
    stateFlags?.["scene.fire"] === true ||
    persistentLines.some(
      (line) =>
        line.category === "world" &&
        line.text.toLowerCase().includes("on fire")
    );
  const fireNarrationLine = hasAccelerantFire
    ? "Fire now spreads faster due to accelerant."
    : hasSceneFire
    ? "The chamber is on fire."
    : null;
  const shapedPresentation = shapeTurnPresentation({
    turnIndex: Number.isFinite(turn.turnIndex) ? turn.turnIndex : null,
    mode: parseIntentMode(turn.playerInput),
    playerInput: turn.playerInput ?? null,
    sceneSummary: turn.scene ? turn.scene.trim() : null,
    consequenceLines: rawConsequenceLines,
    ledgerEntries: consequenceLedgerEntries,
    sceneKey: null,
    promptHash: null,
    outcomeTier: rollInfo.tier ?? (normalizedResolution?.tier ?? null),
  });
  const intent = parseIntentMode(turn.playerInput);
  const isInventoryTurn = Boolean(turn.isInventoryTurn);
  const inventoryActionKind = turn.inventoryActionKind ?? null;
  const inventoryTargetName = deriveInventoryTargetName(turn) ?? turn.inventoryActionTarget ?? null;
  const storyBeat = isInventoryTurn
    ? buildInventoryStoryBeat(inventoryActionKind, inventoryTargetName)
    : shapedPresentation.storyBeat;
  const consequencePresentation = buildPlayerConsequenceBuckets({
    persistentLines,
    turnLines,
  });

  return {
    turnIndex: Number.isFinite(turn.turnIndex) ? turn.turnIndex : null,
    mode: parseIntentMode(turn.playerInput),
    playerInput: turn.playerInput ? turn.playerInput.trim() || null : null,
    sceneText: turn.scene ? turn.scene.trim() || null : null,
    sceneSummary: shapedPresentation.sceneSummary,
    storyBeat,
    outcomeLabel,
    pressureLabel,
    ledgerEntries,
    stateDeltas: deltas,
    pressureChanges,
    thresholdEvents,
    persistentWorldConsequences: consequencePresentation.persistent.world,
    persistentRiskConsequences: consequencePresentation.persistent.risk,
    persistentOpportunityConsequences: consequencePresentation.persistent.opportunity,
    worldConsequences: consequencePresentation.thisTurn.world,
    riskConsequences: consequencePresentation.thisTurn.risk,
    opportunityConsequences: consequencePresentation.thisTurn.opportunity,
    fireNarrationLine,
    rollSummary,
    rollDetail,
    outcomeTierLabel,
    intentLabel,
    notesLabel,
    failForwardComplication: turn.failForwardComplication ?? null,
    effectSummaries: turn.effectSummaries ?? [],
    watchfulness,
    watchfulnessCostDelta,
    watchfulnessEffect,
    watchfulnessActionFlags,
    positionActionFlags,
    noiseActionFlags,
    actionConstraints,
    constraintPressure,
    constraintPressureActive,
    actionRiskDelta,
    actionRiskTier,
    complicationWeightDelta,
    complicationTier,
    forcedComplicationCount,
    complicationPolicyApplied,
    outcomeSeverity,
    consequenceBudgetExtraCostCount,
    consequenceComplicationEntries,
    consequenceExtraCostEntries,
    consequenceNarration,
    narrationLines,
    consequenceLedgerEntries,
    followUpHook: isInventoryTurn ? null : shapedPresentation.followUpHook ?? null,
    pressureNote,
    presentation: turnPresentation,
    opportunityWindow,
    opportunityResolutionModifier,
    opportunityCost,
    finalizedComplications,
    complicationApplied,
    finalizedComplicationDeltas,
    complicationDeltaApplied,
    npcStance,
    pressureStage: resolvedPressureStage,
  };
}

type ConsequenceBucketName = "gained" | "cost" | "worldChange" | "pressureChange";

type ConsequenceBuckets = Record<ConsequenceBucketName, string[]>;

type PlayerConsequenceBuckets = {
  world: string[];
  risk: string[];
  opportunity: string[];
};

type PlayerConsequencePresentation = {
  persistent: PlayerConsequenceBuckets;
  thisTurn: PlayerConsequenceBuckets;
};

type ConsequencePriorityLevel = "high" | "medium" | "low";

const LOW_SIGNAL_KEYS = new Set([
  "scene shifted",
  "additional effort required",
  "partial read",
]);

const PRIORITY_RULES: Record<string, ConsequencePriorityLevel> = {
  "The chamber is on fire.": "high",
  "Fire is spreading faster due to accelerant.": "high",
  "Fabric is oil-soaked.": "high",
  "The crate is weakened.": "high",
  "The crate is open.": "high",
  "The crate is easier to pry open now.": "medium",
  "The crate can now be searched.": "medium",
  "The fabric is primed to ignite.": "medium",
};

const PLAYER_FACING_PERSISTENT_LINES = new Set([
  "the chamber is on fire.",
  "fire is spreading faster due to accelerant.",
  "fabric is oil-soaked.",
  "the crate is weakened.",
  "the crate is open.",
  "the crate is easier to pry open now.",
]);

const PLAYER_FACING_RISK_PATTERNS: RegExp[] = [
  /noise increased/i,
  /time/i,
  /danger/i,
  /pressure/i,
];

const PLAYER_FACING_OPPORTUNITY_PATTERNS: RegExp[] = [
  /hidden clue/i,
  /crate can now be searched/i,
  /crate is easier to pry open/i,
  /fabric is primed to ignite/i,
  /route upward/i,
];

const BANNED_CONSEQUENCE_LINES = new Set([
  "your position is less concealed",
  "a scrape in the wood suggests the frame was forced recently.",
  "dust patterns show something heavy was moved.",
]);

const INTERNAL_CONSEQUENCE_MAPPINGS: Array<[RegExp, string]> = [
  [/^inventory\.chemical.*oil spreads across the fabric$/i, "Fabric is oil-soaked."],
  [/^action.*partial access gained.*$/i, "The crate is partially opened."],
];

function prioritizeConsequenceLines(lines: string[], bucket: "world" | "risk" | "opportunity") {
  const result: Record<ConsequencePriorityLevel, string[]> = {
    high: [],
    medium: [],
    low: [],
  };
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;
    if (LOW_SIGNAL_KEYS.has(normalized.toLowerCase())) {
      result.low.push(line);
      continue;
    }
    const priority = PRIORITY_RULES[normalized] ?? (bucket === "risk" ? "medium" : "medium");
    result[priority].push(line);
  }
  return result;
}

function filterGeneralPressureLine(lines: string[]): string[] {
  const normalizedLines = lines.map((line) => line.trim().toLowerCase());
  const hasSpecific = normalizedLines.some((value) =>
    value.includes("noise increased") ||
    value.includes("time") ||
    value.includes("danger") ||
    value.includes("pressure from")
  );
  if (!hasSpecific) return lines;
  return lines.filter((line) => line.trim().toLowerCase() !== "pressure increased");
}

function normalizePlayerFacingLine(line: string, bucket: "world" | "risk" | "opportunity") {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (BANNED_CONSEQUENCE_LINES.has(lower)) return null;
  for (const [pattern, replacement] of INTERNAL_CONSEQUENCE_MAPPINGS) {
    if (pattern.test(trimmed)) {
      return replacement;
    }
  }
  switch (bucket) {
    case "world":
      return PLAYER_FACING_PERSISTENT_LINES.has(lower) ? trimmed : null;
    case "risk":
      return PLAYER_FACING_RISK_PATTERNS.some((pattern) => pattern.test(trimmed)) ? trimmed : null;
    case "opportunity":
      return PLAYER_FACING_OPPORTUNITY_PATTERNS.some((pattern) => pattern.test(trimmed)) ? trimmed : null;
  }
  return null;
}

function filterPlayerFacingLines(lines: string[], bucket: "world" | "risk" | "opportunity") {
  return lines
    .map((line) => normalizePlayerFacingLine(line, bucket))
    .filter((line): line is string => Boolean(line));
}

type ConsequencePreset = {
  bucket: ConsequenceBucketName;
  text: string;
  key: string;
  patterns: RegExp[];
};

type ConsequenceSourceKey = "clues" | "costs" | "world" | "pressure" | "social" | "position";

type ConsequenceSource = Record<ConsequenceSourceKey, string[]>;

const CONSEQUENCE_PRESETS: ConsequencePreset[] = [
  { bucket: "gained", text: "Hidden clue recovered", key: "clue_recovered", patterns: [/clue/, /observation/, /evidence/, /ledger/] },
  { bucket: "cost", text: "Time advanced", key: "time_advanced", patterns: [/time/, /delay/, /waiting/, /turn/, /opportunity/] },
  { bucket: "worldChange", text: "Your position is less concealed", key: "position_exposed", patterns: [/position/, /stealth/, /cover/, /hostile/, /exposed/, /penalty|rank/] },
  { bucket: "worldChange", text: "Scene shifted", key: "scene_shift", patterns: [/scene/, /door/, /floor/, /wall/, /tile/, /tapestry/, /brazier/, /lantern/] },
  { bucket: "worldChange", text: "The environment becomes more dangerous", key: "scene_danger", patterns: [/complication/, /failforward/] },
  { bucket: "pressureChange", text: "Noise increased", key: "noise", patterns: [/noise/, /attention/, /watchfulness/ ] },
  { bucket: "pressureChange", text: "Pressure increased", key: "pressure_increase", patterns: [/pressure/, /danger/, /risk/, /suspicion/, /alert/, /threat/, /tension/] },
  { bucket: "pressureChange", text: "Risk intensified", key: "risk", patterns: [/risk/] },
  { bucket: "cost", text: "Additional effort required", key: "extra_cost", patterns: [/extra cost/, /consequence-budget/] },
];

const INVENTORY_KEY_LABELS: Record<string, string> = {
  wax_seal_fragment: "Wax seal fragment",
  stolen_reliquary: "Stolen reliquary",
  iron_lantern: "Iron lantern",
};

function normalizeInventoryLabel(key?: string | null, fallback?: string): string {
  if (!key) return fallback ?? "item";
  const normalized = key.trim().toLowerCase();
  if (normalized in INVENTORY_KEY_LABELS) {
    return INVENTORY_KEY_LABELS[normalized];
  }
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveInventoryTargetName(turn: PlayTurn): string | null {
  if (!Array.isArray(turn.stateDeltas)) return null;
  for (const delta of turn.stateDeltas as InventoryDelta[]) {
    if (!delta || typeof delta !== "object") continue;
    switch (delta.type) {
      case "inventory.add":
        return delta.item?.name ?? normalizeInventoryLabel(delta.item?.key);
      case "inventory.remove":
        return normalizeInventoryLabel(delta.itemKey);
      case "inventory.transfer_to_world":
        return normalizeInventoryLabel(delta.placement.itemKey);
      case "inventory.state":
        return normalizeInventoryLabel(delta.itemKey);
      default:
        break;
    }
  }
  return null;
}

function buildInventoryStructuredConsequences(actionKind?: string | null, targetName?: string | null): StructuredConsequences {
  const label = targetName || "the item";
  const lowerLabel = label.toLowerCase();
  const worldLines: string[] = [];
  const gainedLines: string[] = [];
  switch (actionKind) {
    case "take":
      gainedLines.push(`${label} acquired`);
      worldLines.push(`${label} removed from the scene`);
      break;
    case "drop":
      worldLines.push(`${label} placed in the room`);
      break;
    case "stash":
      worldLines.push(`${label} stashed away out of sight`);
      break;
    case "light":
      worldLines.push(`${label} lit`);
      break;
    case "extinguish":
      worldLines.push(`${label} extinguished`);
      break;
    case "present":
      gainedLines.push(`${label} revealed to the room`);
      worldLines.push(`${label} now stands at the center of attention`);
      break;
    default:
      worldLines.push(`${label} handled with care`);
      break;
  }

  return {
    gained: gainedLines,
    cost: [],
    worldChange: worldLines,
    pressureChange: [],
  };
}

function buildInventoryStoryBeat(actionKind?: string | null, targetName?: string | null): string {
  const label = targetName ? targetName : "the item";
  switch (actionKind) {
    case "take":
      return `You lift ${label.toLowerCase()} and tuck it into your pack before the room can respond.`;
    case "drop":
      return `You set ${label.toLowerCase()} down with deliberate care and let the dust settle around it.`;
    case "stash":
      return `You slip ${label.toLowerCase()} into a hidden nook where it might stay unnoticed.`;
    case "light":
      return `You strike a small flame and let ${label.toLowerCase()} brighten the darkness.`;
    case "extinguish":
      return `You snuff ${label.toLowerCase()}, letting the shadows close in again.`;
    case "present":
      return `You hold ${label.toLowerCase()} up as evidence and wait to see who flinches.`;
    default:
      return `You handle ${label.toLowerCase()} with steady hands.`;
  }
}

const SEMANTIC_KEY_MAP: Record<string, string> = {
  scene_shift: "scene_change",
  scene_danger: "scene_change",
  position_exposed: "position_exposed",
  extra_cost: "extra_cost",
};

const pressureLabelMap: Record<string, string> = {
  suspicion: "Suspicion intensified",
  danger: "Danger increased",
  noise: "Noise increased",
  time: "Time advanced",
};

const LOOK_CLUE_KEYWORDS = ["clue", "observation", "detail", "trace", "pattern", "ledger", "reveal", "seam", "evidence"];
const COST_KEYWORDS = ["time", "delay", "waiting", "opportunity", "turn", "spent", "extra", "effort", "penalty", "strain", "budget"];
const WORLD_REVEAL_KEYWORDS = ["scene", "door", "tile", "wall", "brazier", "tapestry", "floor", "compartment", "chamber", "frame", "seam"];
const PRESSURE_KEYWORDS = ["pressure", "danger", "risk", "alert", "threat", "noise", "suspicion", "watch", "attention"];
const SOCIAL_KEYWORDS = ["suspicion", "danger", "alert", "trust", "listen", "voice", "reaction", "silence", "watchful", "npc", "response", "counter", "attend"];
const POSITION_KEYWORDS = ["position", "cover", "exposed", "penalty", "guard", "concealed", "ghost", "trace", "hall", "doorway"];
const MINOR_PRESSURE_KEYWORDS = ["noise", "time", "suspicion", "alert"];
const RESPONSE_KEYWORDS = ["response", "silence", "listen", "react", "answer", "movement", "watchful"];

const CONSEQUENCE_BUCKET_ORDER: ConsequenceBucketName[] = ["gained", "cost", "worldChange", "pressureChange"];

function includesKeyword(value: string, keywords: string[]): boolean {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function classifySourceToken(token: string): ConsequenceSourceKey | null {
  const lower = token.toLowerCase();
  if (includesKeyword(lower, LOOK_CLUE_KEYWORDS)) return "clues";
  if (includesKeyword(lower, COST_KEYWORDS)) return "costs";
  if (includesKeyword(lower, PRESSURE_KEYWORDS)) return "pressure";
  if (includesKeyword(lower, SOCIAL_KEYWORDS)) return "social";
  if (includesKeyword(lower, POSITION_KEYWORDS)) return "position";
  if (includesKeyword(lower, WORLD_REVEAL_KEYWORDS)) return "world";
  return null;
}

function createConsequenceSource(): ConsequenceSource {
  return {
    clues: [],
    costs: [],
    world: [],
    pressure: [],
    social: [],
    position: [],
  };
}

function addSourceToken(source: ConsequenceSource, key: ConsequenceSourceKey, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (source[key].includes(trimmed)) return;
  source[key].push(trimmed);
}

function mapLedgerCategoryToSourceKey(category: LedgerCategory): ConsequenceSourceKey {
  switch (category) {
    case "pressure":
      return "pressure";
    case "time":
      return "costs";
    case "quest":
    case "inventory":
    case "npc":
      return "clues";
    case "world":
    default:
      return "world";
  }
}

function extractConsequenceSources(params: {
  stateDeltas: LatestTurnViewModel["stateDeltas"];
  ledgerEntries: LedgerEntryViewModel[];
  pressureChanges: LatestTurnViewModel["pressureChanges"];
}): ConsequenceSource {
  const sources = createConsequenceSource();

  for (const delta of params.stateDeltas) {
    const valueText = typeof delta.value === "string" ? delta.value : delta.value ? String(delta.value) : null;
    const token = valueText && valueText.trim() ? valueText.trim() : delta.key;
    if (!token) continue;
    const category = classifySourceToken(token);
    if (!category) {
      addSourceToken(sources, "world", token);
      continue;
    }
    addSourceToken(sources, category, token);
  }

  for (const entry of params.ledgerEntries) {
    const cause = entry.cause ? mapLedgerText(entry.cause) : "";
    const effect = entry.effect ? mapLedgerText(entry.effect) : "";
    const text = [cause, effect].filter(Boolean).join(" → ");
    if (!text) continue;
    const categoryKey = mapLedgerCategoryToSourceKey(entry.category);
    addSourceToken(sources, categoryKey, text);
    const category = classifySourceToken(text) ?? categoryKey;
    addSourceToken(sources, category, text);
  }

  for (const change of params.pressureChanges) {
    const label = pressureLabelMap[change.domain] ?? `Pressure ${change.domain} increased`;
    addSourceToken(sources, "pressure", label);
  }

  return sources;
}

function isAdditionalEffortToken(value: string): boolean {
  return includesKeyword(value, ["extra", "effort", "penalty", "strain", "cost", "budget"]);
}

function isLookWorldSignal(value: string): boolean {
  return includesKeyword(value, ["clue", "detail", "trace", "seam", "ledger", "reveal"]);
}

function isMinorPressureToken(value: string): boolean {
  return includesKeyword(value, MINOR_PRESSURE_KEYWORDS);
}

function isSuspicionPressure(value: string): boolean {
  return includesKeyword(value, ["suspicion", "alert", "watch", "reaction"]);
}

function isSocialWorldSignal(value: string): boolean {
  return includesKeyword(value, RESPONSE_KEYWORDS);
}

const INTENT_BUCKET_MAP: Record<"DO" | "LOOK" | "SAY", Array<ConsequenceSourceKey>> = {
  DO: ["clues", "costs", "world", "pressure", "position"],
  LOOK: ["clues", "costs", "pressure"],
  SAY: ["social", "costs", "pressure"],
};

function filterSourcesByIntent(intent: LatestTurnViewModel["mode"] | null, sources: ConsequenceSource): ConsequenceSource {
  const intentKey: "DO" | "LOOK" | "SAY" = intent ?? "DO";
  const allowed = new Set(INTENT_BUCKET_MAP[intentKey]);
  const filtered = createConsequenceSource();
  for (const key of Object.keys(sources) as ConsequenceSourceKey[]) {
    filtered[key] = allowed.has(key) ? [...sources[key]] : [];
  }
  if (intentKey === "LOOK") {
    filtered.costs = filtered.costs.filter((value) => !isAdditionalEffortToken(value));
    filtered.pressure = filtered.pressure.filter(isMinorPressureToken);
  }
  if (intentKey === "SAY") {
    filtered.costs = filtered.costs.filter((value) => includesKeyword(value, ["time", "suspicion", "noise", "alert"]));
    filtered.pressure = filtered.pressure.filter(isSuspicionPressure);
  }
  return filtered;
}

function sanitizeConsequenceLine(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function addUniqueLine(lines: string[], text: string) {
  const sanitized = sanitizeConsequenceLine(text);
  if (!sanitized) return;
  if (lines.includes(sanitized)) return;
  lines.push(sanitized);
}

function buildPlayerConsequenceBuckets(params: {
  persistentLines: ConsequenceLine[];
  turnLines: ConsequenceLine[];
}): PlayerConsequencePresentation {
  const bucket = (lines: ConsequenceLine[], category: ConsequenceCategory) =>
    lines
      .filter((line) => line.category === category)
      .sort((a, b) => b.priority - a.priority)
      .map((line) => line.text);
  return {
    persistent: {
      world: bucket(params.persistentLines, "world"),
      risk: bucket(params.persistentLines, "risk"),
      opportunity: bucket(params.persistentLines, "opportunity"),
    },
    thisTurn: {
      world: bucket(params.turnLines, "world"),
      risk: filterGeneralPressureLine(bucket(params.turnLines, "risk")),
      opportunity: bucket(params.turnLines, "opportunity"),
    },
  };
}

const HARD_BLOCK_FOR_LOOK_SAY = new Set([
  "Additional effort required",
  "Your position is less concealed",
  "Scene shifted",
  "Noise increased",
  "Pressure increased",
]);

function stripHardBlocked(intent: LatestTurnViewModel["mode"] | null, buckets: ConsequenceBuckets): ConsequenceBuckets {
  const normalizedIntent: "DO" | "LOOK" | "SAY" = intent ?? "DO";
  if (normalizedIntent === "DO") return buckets;
  const deny = HARD_BLOCK_FOR_LOOK_SAY;
  const filter = (values: string[]) => values.filter((value) => !deny.has(value));
  return {
    gained: filter(buckets.gained),
    cost: filter(buckets.cost),
    worldChange: filter(buckets.worldChange),
    pressureChange: filter(buckets.pressureChange),
  };
}

function enforceIntentContract(intent: LatestTurnViewModel["mode"] | null, buckets: ConsequenceBuckets): ConsequenceBuckets {
  const normalizedIntent: "DO" | "LOOK" | "SAY" = intent ?? "DO";
  if (normalizedIntent === "LOOK") {
    const result: ConsequenceBuckets = {
      gained: buckets.gained,
      cost: buckets.cost.filter((value) => /time|delay|waiting|attention|turn/i.test(value)),
      worldChange: [],
      pressureChange: buckets.pressureChange.filter((value) => /slight|minor|attention|tension|time|noise/i.test(value)),
    };
    return stripHardBlocked(intent, result);
  }
  if (normalizedIntent === "SAY") {
    const result: ConsequenceBuckets = {
      gained: buckets.gained.filter((value) => /response|reaction|reply|attention|heard|voice|presence|suspicion|alert|watch/i.test(value)),
      cost: buckets.cost.filter((value) => /time|delay|waiting|suspicion|attention/i.test(value)),
      worldChange: buckets.worldChange.filter((value) => /heard|attention|presence|response|suspicion/i.test(value)),
      pressureChange: buckets.pressureChange.filter((value) => /suspicion|alert|attention/i.test(value)),
    };
    return stripHardBlocked(intent, result);
  }
  return buckets;
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
    ledgerEntries.slice(0, 1).map(({ cause, effect }) => (effect ? `${cause} → ${effect}` : cause)) ?? [];
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
  let alertValue: number | null = null;
  const canonicalPressure = {
    suspicion:
      typeof (state as any).pressure?.suspicion === "number" ? (state as any).pressure.suspicion : null,
    noise: typeof (state as any).pressure?.noise === "number" ? (state as any).pressure.noise : null,
    time: typeof (state as any).pressure?.time === "number" ? (state as any).pressure.time : null,
    danger: typeof (state as any).pressure?.danger === "number" ? (state as any).pressure.danger : null,
  };
  let noiseValue: number | null = canonicalPressure.noise;
  let heatValue: number | null = canonicalPressure.danger;
  let trustValue: number | null = null;
  let timeValue: number | null = canonicalPressure.time;
  const resolvedPressureStage = normalizePressureStage(state.pressureStage ?? null);

  state.stats.forEach((stat) => {
    const label = normalizeLabel(stat.key);
    if (!label) return;
    const normalized = label.toLowerCase();
    const numericValue = parseNumericStateValue(stat.value);
    if (numericValue !== null) {
      if (normalized === "alert" && alertValue === null) {
        alertValue = numericValue;
      } else if (normalized === "noise" && noiseValue === null) {
        noiseValue = numericValue;
      } else if (normalized === "heat" && heatValue === null) {
        heatValue = numericValue;
      } else if (normalized === "trust" && trustValue === null) {
        trustValue = numericValue;
      } else if (normalized === "time" && timeValue === null) {
        timeValue = numericValue;
      }
    }
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

  const statMap = new Map<string, number>();
  state.stats.forEach((stat) => {
    const key = normalizeLabel(stat.key).toLowerCase();
    const value = parseNumericStateValue(stat.value);
    if (value !== null) {
      statMap.set(key, value);
    }
  });
  const pressureTotals = {
    suspicion:
      state.pressure?.suspicion ?? statMap.get("suspicion") ?? statMap.get("npc suspicion") ?? 0,
    noise: state.pressure?.noise ?? statMap.get("noise") ?? 0,
    time:
      state.pressure?.time ?? statMap.get("time") ?? statMap.get("time advance") ?? 0,
    danger:
      state.pressure?.danger ?? statMap.get("danger") ?? statMap.get("position penalty") ?? 0,
  };
  const suspicionValue = pressureTotals.suspicion;
  const metrics = {
    alert: alertValue !== null ? { raw: alertValue, label: presentAlertTier(alertValue) } : null,
    noise: noiseValue !== null ? { raw: noiseValue, label: presentNoiseTier(noiseValue) } : null,
    danger: heatValue !== null ? { raw: heatValue, label: presentDangerTier(heatValue) } : null,
    trust: trustValue !== null ? { raw: trustValue, label: presentTrustTier(trustValue) } : null,
    suspicion: suspicionValue !== null ? { raw: suspicionValue, label: presentSuspicionTier(suspicionValue) } : null,
  };
  const risk = presentOverallRiskTier({
    alert: pressureTotals.suspicion,
    noise: pressureTotals.noise,
    heat: pressureTotals.danger,
  });
  const pressureSummary = describePressureSummary(pressureTotals);
  const pressureAxisDescriptions: Record<PressureAxis, string> = {
    suspicion: describeMetricDetail("suspicion", pressureTotals.suspicion),
    noise: describeMetricDetail("noise", pressureTotals.noise),
    time: describeMetricDetail("time", pressureTotals.time),
    danger: describeMetricDetail("danger", pressureTotals.danger),
  };
  const inputTurnsValue =
    typeof (state as PlayStatePanel & { latestTurnIndex?: number }).latestTurnIndex === "number"
      ? (state as PlayStatePanel & { latestTurnIndex?: number }).latestTurnIndex
      : null;
  const stateTurnsValue = Array.isArray((state as PlayStatePanel & { turns?: unknown[] }).turns)
    ? ((state as PlayStatePanel & { turns?: unknown[] }).turns as unknown[]).length
    : null;
  const turnsValue = inputTurnsValue ?? stateTurnsValue ?? 0;

  return {
    status: statusItems,
    world: worldItems,
    quests,
    inventory,
    relations,
    metrics,
    time: timeValue,
    turns: turnsValue,
    risk,
    pressureStage: resolvedPressureStage,
    pressureSummary,
    pressureAxisDescriptions,
    pressureTotals,
    prioritySignals: state.prioritySignals ?? [],
    summary: state.summary ?? { careNow: [], world: [], opportunities: [] },
  };
}
