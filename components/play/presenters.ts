"use client";

import type { PlayTurn } from "@/app/play/types";
import { formatTurnTimestamp } from "@/lib/ui/formatters";

export type LatestTurnDisplay = {
  turnLabel: string;
  actionLabel?: string;
  outcomeLabel?: string;
  timestampLabel: string;
  sceneTitle: string;
  subtitle: string;
  leadText: string;
  bodyText: string;
  consequenceChips: string[];
  pressureLabel: string;
  pressureStage: string;
  ledgerEntries: LedgerDisplayEntry[];
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

export type LedgerDisplayEntry = {
  cause: string;
  effects: string[];
};

function parseModeLabel(input: string) {
  const match = input.match(/^([A-Za-z]+):\s*/);
  return match ? match[1].toUpperCase() : undefined;
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

export function formatLatestTurnDisplay(
  turn: PlayTurn,
  pressureStage: string,
  options?: { location?: string; timeOfDay?: string }
): LatestTurnDisplay {
  const mode = parseModeLabel(turn.playerInput);
  const ledgerEntries = formatLedgerDisplay(turn.ledgerAdds ?? []);
  const consequenceChips = ledgerEntries.flatMap(({ cause, effects }) => [cause, ...effects]).filter(Boolean);
  return {
    turnLabel: `Turn ${turn.turnIndex}`,
    actionLabel: mode,
    outcomeLabel: turn.resolution ?? undefined,
    timestampLabel: formatTurnTimestamp(turn.createdAt),
    sceneTitle: turn.scene.split(/\n+/)[0] || "The scene",
    subtitle: `${options?.location ?? "Unknown location"} • ${options?.timeOfDay ?? "Unknown time"} • ${pressureStage}`,
    leadText: (() => {
      if (!turn.scene) return "";
      const normalized = turn.scene.trim();
      const sentences = normalized.split(/(?<=[.!?])\s+/);
      return sentences[0] || normalized;
    })(),
    bodyText: (() => {
      if (!turn.scene) return "";
      const normalized = turn.scene.trim();
      const sentences = normalized.split(/(?<=[.!?])\s+/);
      if (sentences.length <= 1) return normalized;
      return sentences.slice(1).join(" ").trim();
    })(),
    consequenceChips,
    pressureLabel: pressureStage ?? "calm",
    pressureStage,
    ledgerEntries,
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
