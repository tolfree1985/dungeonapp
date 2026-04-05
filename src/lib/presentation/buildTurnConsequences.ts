import { createHash } from "crypto";
import { buildEscalationBeat, type PressureSnapshot } from "./escalationBeats";

export type TurnMode = "DO" | "LOOK" | "SAY";

export type TurnConsequenceSlots = {
  gain: string | null;
  shift: string | null;
  cost: string | null;
  hook: string | null;
};

type BuildTurnConsequencesInput = {
  mode: TurnMode | null;
  sceneKey: string | null;
  promptHash: string | null;
  turnIndex: number | null;
  outcomeTier: string | null;
  sceneSummary: string;
  consequenceLines: string[];
  pressure: PressureSnapshot;
  repeatedInvestigations?: number;
};

const FILTER_PATTERNS = [
  /complication/i,
  /noise/i,
  /extra cost/i,
  /pressure/i,
  /risk/i,
  /constraint/i,
];

const LOOK_CLUE_POOL = [
  "A torn ledger edge catches against a nail in the shelf.",
  "A scrape in the wood shows the frame was forced recently.",
  "Dust breaks around one stone where the wall should be solid.",
  "Wax drippings run beneath the shelf where no candle should have stood.",
  "A boot smear cuts across the settled ash near the threshold.",
];

function pickDeterministic<T>(values: readonly T[], seed: string, turnIndex: number | null): T {
  const hash = createHash("sha256").update(seed).digest("hex");
  const index = Number.parseInt(hash.slice(0, 8), 16) % values.length;
  if (values.length <= 1) {
    return values[0]!;
  }
  const prevIndex = turnIndex == null ? -1 : ((turnIndex - 1 + values.length) % values.length);
  if (index === prevIndex) {
    return values[(index + 1) % values.length]!;
  }
  return values[index]!;
}

function isFiltered(line: string): boolean {
  return FILTER_PATTERNS.some((pattern) => pattern.test(line));
}

function uniq(lines: Array<string | null | undefined>): string[] {
  return [...new Set(lines.filter((line): line is string => Boolean(line?.trim())))];
}

function inferCost(mode: TurnMode | null, outcomeTier: string | null, lines: string[]): string | null {
  const haystack = lines.join(" ").toLowerCase();

  if (haystack.includes("time")) {
    return "The extra effort costs you precious time.";
  }

  if (haystack.includes("noise") || haystack.includes("attention")) {
    return mode === "SAY"
      ? "Your voice carries farther than you intended."
      : "Your movement risks drawing attention.";
  }

  if (haystack.includes("exposed") || haystack.includes("position")) {
    return "You are more exposed than you were a moment ago.";
  }

  if (outcomeTier?.toLowerCase().includes("cost")) {
    return mode === "LOOK"
      ? "The longer read gives the pressure room to build."
      : mode === "DO"
        ? "Progress comes at the cost of concealment."
        : "You provoke a response, but reveal your presence.";
  }

  return null;
}

function buildLookSlots(input: BuildTurnConsequencesInput): TurnConsequenceSlots {
  const seed = `${input.sceneKey ?? input.sceneSummary ?? "none"}:${input.promptHash ?? "none"}`;
  const clue = pickDeterministic(LOOK_CLUE_POOL, seed, input.turnIndex);

  return {
    gain: "You identify one usable clue in the room.",
    shift: clue,
    cost: inferCost(input.mode, input.outcomeTier, input.consequenceLines),
    hook: "Inspect the disturbance before the trail goes cold.",
  };
}

function buildDoSlots(input: BuildTurnConsequencesInput): TurnConsequenceSlots {
  return {
    gain: "You force the situation into motion.",
    shift: "The room is no longer undisturbed; your action changes what is possible next.",
    cost:
      inferCost(input.mode, input.outcomeTier, input.consequenceLines) ??
      "Your progress comes with fresh exposure.",
    hook: "Press the opening you just created before the scene settles.",
  };
}

function buildSaySlots(input: BuildTurnConsequencesInput): TurnConsequenceSlots {
  return {
    gain: "You test whether anything nearby is ready to answer back.",
    shift: "The silence reacts differently now that your presence is known.",
    cost:
      inferCost(input.mode, input.outcomeTier, input.consequenceLines) ??
      "Whatever is listening can place you more easily now.",
    hook: "Listen for the response you just pulled out of the dark.",
  };
}

export function buildTurnConsequences(
  input: BuildTurnConsequencesInput,
): TurnConsequenceSlots {
  const cleanedLines = uniq(input.consequenceLines).filter((line) => !isFiltered(line));

  const beat = buildEscalationBeat({
    sceneKey: input.sceneKey,
    turnIndex: input.turnIndex ?? 0,
    mode: input.mode ?? "LOOK",
    pressure: input.pressure,
    repeatedInvestigations: input.repeatedInvestigations ?? 0,
  });

  const base =
    input.mode === "LOOK"
      ? buildLookSlots(input)
      : input.mode === "DO"
        ? buildDoSlots(input)
        : buildSaySlots(input);

  const preferred = cleanedLines.slice(0, 3);

  return {
    gain: preferred[0] ?? base.gain,
    shift: preferred[1] ?? beat.sceneShift ?? base.shift,
    cost: preferred[2] ?? beat.threat ?? base.cost,
    hook: beat.exhaustion ?? beat.responseCue ?? base.hook,
  };
}
