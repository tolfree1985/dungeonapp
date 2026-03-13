"use client";

import type { PlayTurn } from "@/app/play/types";
import { formatTurnTimestamp } from "@/lib/ui/formatters";

export type LedgerDisplayEntry = {
  cause: string;
  effects: string[];
};

export type LatestTurnViewModel = {
  turnIndex: number | null;
  mode: "DO" | "SAY" | "LOOK" | null;
  playerInput: string | null;
  sceneText: string | null;
  outcomeLabel: string | null;
  pressureLabel: string;
  ledgerEntries: string[];
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

export function formatLedgerDisplay(entries: unknown[]): LedgerDisplayEntry[] {
  return entries
    .map((entry) => normalizeLedger(entry))
    .filter((entry): entry is { cause: string; effects: string[] } => Boolean(entry));
}

function summarizeLedgerEntries(entries: unknown[]): string[] {
  return formatLedgerDisplay(entries).map(({ cause, effects }) =>
    effects.length > 0 ? `${cause} → ${effects.join(", ")}` : cause
  );
}

export function buildLatestTurnViewModel(
  turn: PlayTurn,
  pressureStage: string | null | undefined
): LatestTurnViewModel {
  const pressureLabel = (pressureStage ?? "calm").toUpperCase();
  const ledgers = summarizeLedgerEntries(turn.ledgerAdds ?? []);
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
    ledgerEntries: ledgers,
    stateDeltas: deltas,
  };
}

export function formatRecentTurnDisplay(turn: PlayTurn, fallbackPressure: string): RecentTurnDisplay {
  const mode = parseModeLabel(turn.playerInput);
  const rowPressure = typeof (turn as any).pressureStage === "string" ? (turn as any).pressureStage : fallbackPressure;
  const highlights = formatLedgerDisplay(turn.ledgerAdds ?? []).flatMap(({ cause, effects }) => [cause, ...effects]);
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
