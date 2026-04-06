import { createHash } from "crypto";
import type { EscalationBeat, PressureSnapshot } from "./escalationBeats";
import type { TurnMode } from "./buildTurnConsequences";
import {
  STORY_CLUE_DETAILS,
  STORY_OPENERS,
  STORY_REACTIONS,
  STORY_THREATS,
  type StoryBeatOutcome,
} from "./storyBeatPools";

export type BuildTurnStoryBeatInput = {
  mode: TurnMode | null;
  actionText?: string | null;
  outcomeTier?: string | null;
  sceneKey: string | null;
  promptHash: string | null;
  turnIndex: number | null;
  clueDetail?: string | null;
  worldDetail?: string | null;
  reactionDetail?: string | null;
  escalationBeat: EscalationBeat;
  pressure: PressureSnapshot;
  baseSummary: string;
};

function pickDeterministicLine<T>(values: readonly T[], seed: string): T {
  const hash = createHash("sha256").update(seed).digest("hex");
  const index = Number.parseInt(hash.slice(0, 8), 16) % values.length;
  return values[index]!;
}

function ensureSentence(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const capitalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return trimmed.endsWith(".") ? capitalized : `${capitalized}.`;
}

function containsSystemKeywords(text: string) {
  const banned = ["pressure", "danger", "risk", "time", "cost", "exposure", "suspicion", "noise"];
  const lower = text.toLowerCase();
  return banned.some((keyword) => lower.includes(keyword));
}

function normalizeActionText(text?: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const withoutPronoun = trimmed.replace(/^[iI]\s+/, "");
  if (!withoutPronoun) return null;
  return `You ${withoutPronoun}`;
}

function firstAvailable(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value) {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function describePressureTone(pressure: PressureSnapshot): string | null {
  if (pressure.danger >= 40) {
    return "Danger breathes close enough to chill the air.";
  }
  if (pressure.noise >= 40) {
    return "Noise refuses to fade and now clings to the walls.";
  }
  if (pressure.suspicion >= 6) {
    return "Someone somewhere is listening harder now.";
  }
  if (pressure.time >= 15) {
    return "Time stretches thin; hesitation will cost you.";
  }
  return null;
}

function normalizeOutcome(tier?: string | null): StoryBeatOutcome {
  if (!tier) return "SUCCESS";
  const normalized = tier.replace(/[-_\s]+/g, "_").toUpperCase();
  if (normalized.includes("FAIL_FORWARD") || normalized.includes("FAIL-FORWARD")) {
    return "FAIL_FORWARD";
  }
  if (normalized.includes("FAIL") || normalized.includes("MISS")) {
    return "MISS";
  }
  if (normalized.includes("COST") || normalized.includes("PRICE")) {
    return "SUCCESS_WITH_COST";
  }
  return "SUCCESS";
}

export function buildTurnStoryBeat(input: BuildTurnStoryBeatInput): string {
  const mode: TurnMode = input.mode ?? "LOOK";
  const outcome = normalizeOutcome(input.outcomeTier);
  const seed = `${mode}:${input.turnIndex ?? 0}:${input.sceneKey ?? "none"}:${input.promptHash ?? "none"}`;
  const used = new Set<string>();

  const openerLine = pickDeterministicLine(STORY_OPENERS[mode], `${seed}:opener`);
  const actionCandidate = firstAvailable(
    normalizeActionText(input.actionText),
    openerLine,
  );
  const actionSentence = trackText(ensureSentence(actionCandidate), used);

  const revealCandidate = firstAvailable(
    input.clueDetail,
    input.worldDetail,
    pickDeterministicLine(STORY_CLUE_DETAILS[mode], `${seed}:clue`),
    input.baseSummary,
  );
  const revealSentence = trackText(ensureSentence(revealCandidate), used);

  const reactionCandidate = firstAvailable(
    input.reactionDetail,
    input.escalationBeat.sceneShift,
    pickDeterministicLine(STORY_REACTIONS[mode], `${seed}:reaction`),
  );
  const reactionSentence = trackText(ensureSentence(reactionCandidate), used);

  const threatPool = STORY_THREATS[outcome] ?? STORY_THREATS.default;
  const threatCandidate = firstAvailable(
    input.escalationBeat.threat,
    pickDeterministicLine(threatPool, `${seed}:threat`),
    describePressureTone(input.pressure),
  );
  const threatSentence = trackText(ensureSentence(threatCandidate), used);

  const segments = [actionSentence, revealSentence, reactionSentence, threatSentence].filter(Boolean);
  const story = segments.join(" ");
  return story || ensureSentence(input.baseSummary) || ensureSentence(openerLine) || "The scene waits, still demanding your attention.";
}

function trackText(value: string | null | undefined, used: Set<string>): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (containsSystemKeywords(trimmed)) return null;
  const normalized = trimmed.toLowerCase();
  if (used.has(normalized)) return null;
  used.add(normalized);
  return trimmed;
}
