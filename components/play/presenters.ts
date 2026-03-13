"use client";

import type { PlayTurn } from "@/app/play/types";
import { formatTurnTimestamp } from "@/lib/ui/formatters";

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
};

export type RecentTurnDisplay = {
  turnIndex: number;
  modeLabel?: string;
  outcomeLabel?: string;
  pressureLabel: string;
  timestampLabel: string;
  summary: string;
  highlightChips: string[];
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
      const effect = effects.join(", ");
      const category = classifyLedgerCategory(`${cause} ${effect}`);
      const emphasis =
        category === "pressure" || effect.toLowerCase().includes("increased") || effect.toLowerCase().includes("decreased")
          ? "high"
          : "normal";
      return {
        id: `${index}-${cause}-${effect}`.replace(/\s+/g, "-").toLowerCase(),
        category,
        cause,
        effect,
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
  return {
    turnIndex: Number.isFinite(turn.turnIndex) ? turn.turnIndex : null,
    mode: parseIntentMode(turn.playerInput),
    playerInput: turn.playerInput ? turn.playerInput.trim() || null : null,
    sceneText: turn.scene ? turn.scene.trim() || null : null,
    outcomeLabel: turn.resolution ? turn.resolution.trim() || null : null,
    pressureLabel,
    ledgerEntries,
    stateDeltas: deltas,
  };
}

export function formatRecentTurnDisplay(turn: PlayTurn, fallbackPressure: string): RecentTurnDisplay {
  const mode = parseModeLabel(turn.playerInput);
  const rowPressure = typeof (turn as any).pressureStage === "string" ? (turn as any).pressureStage : fallbackPressure;
  const highlights = formatLedgerDisplay(turn.ledgerAdds ?? []).flatMap(({ cause, effect }) => [cause, effect]);
  return {
    turnIndex: turn.turnIndex,
    modeLabel: mode,
    outcomeLabel: turn.resolution ?? undefined,
    pressureLabel: rowPressure,
    timestampLabel: formatTurnTimestamp(turn.createdAt),
    summary: turn.scene || turn.playerInput,
    highlightChips: highlights.slice(0, 2),
  };
}
