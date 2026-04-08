import type { FailForwardComplication } from "@/lib/fail-forward-complication";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import type { OpportunityWindowState } from "@/lib/opportunity-window";
import type { OpportunityResolutionModifier } from "@/lib/opportunity-resolution-modifier";
import type { WatchfulnessActionFlags } from "@/lib/watchfulness-action-flags";
import type { PositionActionFlags } from "@/lib/position-action-flags";
import type { NoiseActionFlags } from "@/lib/noise-action-flags";
import type { ActionConstraints } from "@/lib/action-constraints";
import type { OutcomeSeverity } from "@/server/scene/outcome-severity";
import type { ConsequenceEntry } from "@/server/scene/consequence-bundle";
import type { FinalizedConsequenceNarration } from "@/server/scene/finalized-consequence-narration";
import type { LedgerPresentationEntry } from "@/server/scene/ledger-presentation";
import type { TurnResolutionPresentation } from "@/server/scene/turn-resolution-presentation";
import type { ParsedInventoryIntent } from "@/lib/engine/inventory/parseInventoryIntent";
import type { MechanicFacts } from "@/lib/engine/presentation/mechanicFacts";

export type PressureStage = "calm" | "tension" | "danger" | "crisis";

export type PlayTurn = {
  id: string;
  turnIndex: number;
  playerInput: string;
  scene: string;
  resolution: string;
  stateDeltas: unknown[];
  stateFlags?: Record<string, unknown>;
  ledgerAdds: unknown[];
  createdAt: string;
  resolutionJson?: unknown;
  failForwardComplication?: FailForwardComplication | null;
  effectSummaries?: FinalizedEffectSummary[];
  opportunityWindow?: OpportunityWindowState;
  opportunityResolutionModifier?: OpportunityResolutionModifier | null;
  opportunityCost?: string | null;
  finalizedComplications?: string[];
  complicationApplied?: boolean;
  finalizedComplicationDeltas?: Record<string, number>;
  complicationDeltaApplied?: boolean;
  npcStance?: string | null;
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
  complicationPolicyApplied?: boolean | null;
  outcomeSeverity?: OutcomeSeverity | null;
  consequenceBudgetExtraCostCount?: number | null;
  consequenceComplicationEntries?: ConsequenceEntry[];
  consequenceExtraCostEntries?: ConsequenceEntry[];
  consequenceNarration?: {
    headline: string;
    lines: string[];
  };
  presentation: PlayTurnPresentation;
  isInventoryTurn?: boolean;
  inventoryActionKind?: ParsedInventoryIntent["kind"] | null;
  inventoryActionTarget?: string | null;
  pressureStage?: PressureStage | null;
};

export type PlayTurnPresentation = {
  resolution: TurnResolutionPresentation | null;
  narration: FinalizedConsequenceNarration | null;
  ledgerEntries: LedgerPresentationEntry[];
};

export type PlayStateValue = string | number | boolean | null;

export type PlayScenarioMeta = {
  id: string;
  title: string;
  summary?: string | null;
};

export type PlayStatePanel = {
  pressureStage?: string | null;
  pressure?: {
    suspicion?: number | null;
    noise?: number | null;
    time?: number | null;
    danger?: number | null;
  } | null;
  stats: Array<{ key: string; value: PlayStateValue }>;
  inventory: Array<{ name: string; detail?: string }>;
  quests: Array<{ title: string; status?: string; detail?: string }>;
  relationships: Array<{ name: string; status?: string; detail?: string }>;
  location?: string;
  timeOfDay?: string;
  ambience?: string;
  contextTags?: string[];
  flags?: Record<string, unknown> | null;
  summary: MechanicFacts;
};
