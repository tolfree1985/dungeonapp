import { buildTurnResolutionPresentation, type TurnResolutionOutcome } from "@/server/scene/turn-resolution-presentation";
import type { PlayTurn, PlayTurnPresentation } from "./types";

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function deriveOutcome(outcome?: string | null): TurnResolutionOutcome {
  if (!outcome) return "SUCCESS";
  const normalized = outcome.replace(/[^A-Za-z_]/g, "_").toUpperCase();
  if (normalized.includes("FAIL_FORWARD")) return "FAIL_FORWARD";
  if (normalized.includes("FAILURE")) return "FAILURE";
  if (normalized.includes("FAIL")) return "FAILURE";
  if (normalized.includes("SUCCESS_WITH_COMPLICATION")) return "SUCCESS_WITH_COMPLICATION";
  if (normalized.includes("COMPLICATION")) return "SUCCESS_WITH_COMPLICATION";
  if (normalized.includes("SUCCESS_WITH_COST")) return "SUCCESS_WITH_COST";
  if (normalized.includes("COST")) return "SUCCESS_WITH_COST";
  return "SUCCESS";
}

function normalizeResultLabel(turn: PlayTurn, source: Record<string, unknown> | null): string | null {
  if (source?.resultLabel && typeof source.resultLabel === "string") {
    return source.resultLabel;
  }
  if (source?.outcome && typeof source.outcome === "string") {
    return source.outcome;
  }
  if (turn.resolution && typeof turn.resolution === "string") {
    return turn.resolution;
  }
  return null;
}

function deriveRollTotal(source: Record<string, unknown> | null): number | null {
  const total = source?.rollTotal;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

export function buildPlayTurnPresentation(turn: PlayTurn): PlayTurnPresentation {
  const rawResolutionJson = turn.resolutionJson ?? parseJson(turn.resolution);
  const outcomeLabel = typeof rawResolutionJson?.outcome === "string" ? rawResolutionJson.outcome : null;
  const outcome = deriveOutcome(outcomeLabel);
  const rollTotal = deriveRollTotal(rawResolutionJson);
  const resultLabel = normalizeResultLabel(turn, rawResolutionJson);
  return {
    resolution: buildTurnResolutionPresentation({
      outcome,
      rollTotal,
      resultLabel,
    }),
    narration: turn.presentation?.narration ?? null,
    ledgerEntries: turn.presentation?.ledgerEntries ?? [],
  };
}
