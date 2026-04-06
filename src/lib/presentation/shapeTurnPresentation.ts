import type { LedgerPresentationEntry } from "@/server/scene/ledger-presentation";
import { enhanceConsequenceLine } from "./consequenceLanguage";
import type { ConsequenceKind } from "./consequenceLanguage";
import { buildTurnConsequences } from "./buildTurnConsequences";
import { buildTurnStoryBeat } from "./buildTurnStoryBeat";
import type { EscalationBeat, PressureSnapshot } from "./escalationBeats";

export type ShapeTurnPresentationInput = {
  turnIndex: number | null;
  mode: "DO" | "LOOK" | "SAY" | null;
  playerInput?: string | null;
  sceneSummary: string | null;
  consequenceLines: string[];
  ledgerEntries: LedgerPresentationEntry[];
  sceneKey?: string | null;
  promptHash?: string | null;
  outcomeTier?: string | null;
  pressureSnapshot: PressureSnapshot;
  recentSceneSummaries?: string[];
};

export type ShapeTurnPresentationResult = {
  sceneSummary: string;
  storyBeat: string;
  consequenceLines: string[];
  followUpHook?: string | null;
  escalationBeat: EscalationBeat;
};

const ABSTRACT_SUMMARY_KEYWORDS = [
  "advantage",
  "information",
  "observation",
  "outcome",
  "result",
  "status",
  "partial",
  "success",
  "nothing",
  "neutral",
];

const CHANGE_KINDS: Set<ConsequenceKind> = new Set([
  "partial_clue",
  "scene_disturbed",
  "position_worsened",
]);
const COST_KINDS: Set<ConsequenceKind> = new Set(["time_cost", "pressure_increase"]);
const ATTENTION_KINDS: Set<ConsequenceKind> = new Set(["attention_drawn"]);

type EnhancedLineEntry = {
  line: string;
  enhancement: ReturnType<typeof enhanceConsequenceLine>;
};

function findEnhancedEntry(entries: EnhancedLineEntry[], kinds: Set<ConsequenceKind>): EnhancedLineEntry | null {
  for (const entry of entries) {
    if (entry.enhancement.kind && kinds.has(entry.enhancement.kind)) {
      return entry;
    }
  }
  return null;
}

type FocusDefinition = {
  keywords: string[];
  summary: string;
  followUp: string;
};

const FOCUS_DEFINITIONS: FocusDefinition[] = [
  {
    keywords: ["ledger", "page"],
    summary: "The torn ledger page flutters with one dock number still legible amid scratched entries.",
    followUp: "That ledger page deserves another careful look.",
  },
  {
    keywords: ["door"],
    summary: "The ledger room door sits ajar, revealing a chair toppled against the far wall.",
    followUp: "Push further inside before the dust settles.",
  },
  {
    keywords: ["brazier", "embers"],
    summary: "An overturned brazier spills embers across the stone floor, smoke curling low down the corridor.",
    followUp: "Trace the warm embers back to their source before they fade.",
  },
  {
    keywords: ["tapestry"],
    summary: "A torn tapestry edge flutters in firelight, its threads whispering of recent violence.",
    followUp: "Inspect the tapestry seam for signs of tampering.",
  },
  {
    keywords: ["lantern"],
    summary: "A lantern still glows in the dust-laden hall, casting long, trembling shadows.",
    followUp: "Follow its glow; someone may still be nearby.",
  },
];

function normalizeTextSources(texts: (string | null | undefined)[]): string {
  return texts
    .map((entry) => (entry ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isSummaryAbstract(summary: string | null): boolean {
  if (!summary) return true;
  const trimmed = summary.trim();
  if (trimmed.length < 60) return true;
  const lower = trimmed.toLowerCase();
  return ABSTRACT_SUMMARY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function humanizeLine(line: string): string {
  if (!line) return "";
  const cleaned = line.replace(/^[•\-\s]+/, "").trim();
  if (!cleaned) return "";
  const capitalized = `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
  return cleaned.endsWith(".") ? capitalized : `${capitalized}.`;
}

function detectFocus(input: ShapeTurnPresentationInput): FocusDefinition | null {
  const combined = normalizeTextSources([
    input.sceneSummary,
    input.playerInput,
    ...input.consequenceLines,
  ]);
  if (!combined) return null;
  return FOCUS_DEFINITIONS.find((definition) =>
    definition.keywords.every((keyword) => combined.includes(keyword))
  ) ?? null;
}

function buildFallbackSummary(
  input: ShapeTurnPresentationInput,
  focus: FocusDefinition | null,
  changeLine: string | null,
  summaryFragment?: string | null,
): string {
  let message: string;
  if (focus) {
    message = focus.summary;
  } else if (summaryFragment) {
    message = summaryFragment;
  } else if (changeLine) {
    message = changeLine;
  } else {
    switch (input.mode) {
      case "LOOK":
        message = "Your observation pins down a subtle clue that pulls the scene into sharper relief.";
        break;
      case "DO":
        message = "Your action shoved the scene into motion, stirring dust and revealing new shapes.";
        break;
      case "SAY":
        message = "Your words ripple through the room, leaving a hush and a trail to follow.";
        break;
      default:
        message = "The scene shifts beneath your feet, and something new now demands your attention.";
    }
  }
  if (input.turnIndex === 0) {
    const prefix = "First impression: ";
    const rest = message.charAt(0).toLowerCase() + message.slice(1);
    return `${prefix}${rest}`;
  }
  return message;
}

function buildFollowUpHook(
  focus: FocusDefinition | null,
  changeLine: string | null,
  costLine: string | null,
  attentionLine: string | null,
  changeFollowUp: string | null
): string | null {
  if (focus) return focus.followUp;
  if (changeFollowUp) return changeFollowUp;
  if (changeLine) return `Follow that detail further to see what it unlocks.`;
  if (costLine) return `Stabilize that cost before moving on.`;
  if (attentionLine) return `Keep watch for lingering ${attentionLine.replace(/[.\s]+$/g, "").toLowerCase()}.`;
  return null;
}

export function shapeTurnPresentation(input: ShapeTurnPresentationInput): ShapeTurnPresentationResult {
  const focus = detectFocus(input);
  const hasSummary = Boolean(input.sceneSummary && input.sceneSummary.trim());
  const normalizedConsequenceLines = input.consequenceLines
    .flatMap((value) => (value ?? "").split(/\r?\n/))
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

  const enhancedEntries = normalizedConsequenceLines.map((line) => ({
    line,
    enhancement: enhanceConsequenceLine(line),
  }));

  const uniqueEntries: EnhancedLineEntry[] = [];
  const seen = new Set<string>();
  for (const entry of enhancedEntries) {
    const canonical = (entry.enhancement.text || entry.line).toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    uniqueEntries.push(entry);
  }

  const changeEntry = findEnhancedEntry(uniqueEntries, CHANGE_KINDS);
  const costEntry = findEnhancedEntry(uniqueEntries, COST_KINDS);
  const attentionEntry = findEnhancedEntry(uniqueEntries, ATTENTION_KINDS);
  const changeLine = changeEntry?.enhancement.text ?? changeEntry?.line ?? null;
  const costLine = costEntry?.enhancement.text ?? costEntry?.line ?? null;
  const attentionLine = attentionEntry?.enhancement.text ?? attentionEntry?.line ?? null;

  const finalLines: string[] = [];
  const appendLine = (value?: string | null) => {
    if (!value) return;
    const humanized = humanizeLine(value);
    if (!humanized) return;
    if (finalLines.some((entry) => entry.toLowerCase() === humanized.toLowerCase())) return;
    finalLines.push(humanized);
  };

  appendLine(changeLine);
  appendLine(costLine);
  appendLine(attentionLine);

  for (const entry of uniqueEntries) {
    if (finalLines.length >= 4) break;
    appendLine(entry.enhancement.text || entry.line);
  }

  if (!finalLines.length) {
    const fallbackLedger = input.ledgerEntries
      .map((entry) => entry.text ?? (entry as { ledgerText?: string }).ledgerText ?? "")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => enhanceConsequenceLine(value))
      .map((enhanced) => enhanced.text)
      .map((value) => humanizeLine(value));
    for (const line of fallbackLedger) {
      if (finalLines.length >= 4) break;
      appendLine(line);
    }
  }

  const summarySource = hasSummary ? input.sceneSummary : null;
  const summaryNeedsRewrite = !summarySource || isSummaryAbstract(summarySource);
  const changeSummaryFragment = changeEntry?.enhancement.summary ?? changeLine;
  const summarySourceClean = summarySource
    ? summarySource.trim()
    : null;
  const baseSceneSummary = summaryNeedsRewrite
    ? buildFallbackSummary(input, focus, changeSummaryFragment ?? changeLine)
    : summarySourceClean!;
  const baseFollowUpHook = buildFollowUpHook(
    focus,
    changeLine,
    costLine,
    attentionLine,
    changeEntry?.enhancement.followUp ?? null,
  );
  const normalizedSummary = baseSceneSummary.trim().toLowerCase();
  const recentSummaries = (input.recentSceneSummaries ?? [])
    .map((entry) => entry?.trim().toLowerCase())
    .filter(Boolean);
  const repeatedInvestigations = Math.max(0, recentSummaries.filter((entry) => entry === normalizedSummary).length - 1);
  const pressureSnapshot: PressureSnapshot = input.pressureSnapshot ?? {
    suspicion: 0,
    noise: 0,
    time: 0,
    danger: 0,
  };
  const consequenceResult = buildTurnConsequences({
    mode: input.mode,
    sceneKey: input.sceneKey ?? null,
    promptHash: input.promptHash ?? null,
    turnIndex: input.turnIndex,
    outcomeTier: input.outcomeTier ?? null,
    sceneSummary: baseSceneSummary,
    consequenceLines: finalLines,
    pressure: pressureSnapshot,
    repeatedInvestigations,
  });
  const slots = consequenceResult.slots;
  const escalationBeat = consequenceResult.escalationBeat;
  const clueDetail = focus?.summary ?? changeLine ?? baseSceneSummary;
  const worldDetail =
    changeLine ??
    focus?.summary ??
    escalationBeat.sceneShift ??
    baseSceneSummary;
  const reactionDetail =
    attentionLine ??
    escalationBeat.responseCue ??
    escalationBeat.sceneShift ??
    null;
  const storyBeat = buildTurnStoryBeat({
    mode: input.mode,
    actionText: input.playerInput ?? null,
    outcomeTier: input.outcomeTier ?? null,
    sceneKey: input.sceneKey ?? null,
    promptHash: input.promptHash ?? null,
    turnIndex: input.turnIndex,
    clueDetail,
    worldDetail,
    reactionDetail,
    escalationBeat,
    pressure: pressureSnapshot,
    baseSummary: baseSceneSummary,
  });
  const curatedConsequenceLines = [
    slots.gain,
    slots.shift,
    slots.cost,
  ].filter((line): line is string => Boolean(line));

  return {
    sceneSummary: baseSceneSummary,
    storyBeat,
    consequenceLines: curatedConsequenceLines,
    followUpHook: slots.hook ?? baseFollowUpHook ?? null,
    escalationBeat,
  };
}
