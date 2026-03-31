"use client";

import { useMemo, useState } from "react";
import type { FailForwardComplication } from "@/lib/fail-forward-complication";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import type { LatestTurnViewModel, PressureStage } from "./presenters";
import { cardPadding, cardShell, cardSpacing, emptyState, metadataTag, sectionHeading } from "./cardStyles";
import { ConsequenceLedgerList } from "./ConsequenceLedgerList";
import { NarrationBlock } from "./NarrationBlock";
import { ResolutionStrip } from "./ResolutionStrip";
import { pressureBorderClass } from "@/lib/ui/pressure-style";

function cardBorderClass(stage: PressureStage) {
  switch (stage) {
    case "calm":
      return "border-white/10";
    case "tension":
      return "border-white/20";
    case "danger":
      return "border-amber-500/30";
    case "crisis":
      return "border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]";
  }
}

const consequenceLabel: Record<string, string> = {
  pressure: "State",
  world: "World",
  quest: "Quest",
  inventory: "Inventory",
  npc: "NPC",
  time: "Time",
};

const COMPLICATION_LABELS: Record<FailForwardComplication, string> = {
  "time-lost": "Time lost",
  "position-worsened": "Position worsened",
  "noise-increased": "Noise increased",
  "npc-suspicious": "NPC suspicion increased",
};

const EFFECT_LABELS: Record<FinalizedEffectSummary, string> = {
  "noise.escalation": "Noise increased",
  "npc.suspicion": "NPC suspicion increased",
  "position.penalty": "Position worsened",
  "time.scene-prolonged": "Scene timing advanced",
  "time.deadline-pressure": "Deadline pressure",
  "scene.stalled": "Scene stalled",
  "objective.window-narrowed": "Opportunity narrowed",
  "opportunity.reduced": "Opportunity reduced",
  "resolution.cost": "Resolution cost increased",
  "higher-complication-risk": "Higher complication risk",
  "complication-likely": "Complication likely",
  "complication.outcome": "Complication guaranteed",
  "complication-applied": "Complication applied",
  "reduced-margin": "Reduced margin",
  "watchfulness.elevated": "Watchfulness elevated",
  "watchfulness.high": "Watchfulness high",
  "watchfulness.hostile": "Watchfulness hostile",
  "attention.drawn": "Attention drawn",
  "search.pressure": "Search pressure",
  "constraint.pressure": "Constraint pressure",
  "action-risk.elevated": "Elevated action risk",
  "action-risk.high": "High action risk",
  "complication-tier.light": "Complication tier: light",
  "complication-tier.heavy": "Complication tier: heavy",
  "complication-policy.light": "Complication policy: light",
  "complication-policy.heavy": "Complication policy: heavy",
  "consequence-budget.extraCost-1": "Extra consequence cost",
  "consequence-budget.extraCost-2": "Extra consequence cost x2",
};
const THRESHOLD_EVENT_LABELS: Record<string, string> = {
  guard_alerted: "Guard alerted",
  area_compromised: "Area compromised",
  window_narrowed: "Window narrowed",
  situation_critical: "Situation critical",
};
const PRESSURE_DOMAIN_LABELS: Record<string, string> = {
  suspicion: "Suspicion",
  noise: "Noise",
  time: "Time",
  danger: "Danger",
};
const OPPORTUNITY_WINDOW_LABELS = {
  normal: "Opportunity steady",
  reduced: "Opportunity reduced",
};

type Props = {
  model: LatestTurnViewModel | null;
  isHighlighted?: boolean;
};

export default function LatestTurnCard({ model, isHighlighted }: Props) {
  const hasResolvedTurn = Boolean(model && model.turnIndex && model.turnIndex > 0);
  const highlightClass = isHighlighted
    ? "ring-1 ring-amber-400/60 shadow-[0_0_35px_rgba(250,204,61,0.45)]"
    : "";
  if (!model || !hasResolvedTurn) {
    return (
      <section className={`${cardShell} ${cardPadding} ${cardSpacing} ${highlightClass}`}>
        <div className={sectionHeading}>Latest Turn</div>
        <h2 className="text-2xl font-semibold text-white">No resolved turn yet.</h2>
        <p className="text-sm text-white/60">
          Submit a command to record the next turn. The scene, outcome, and consequences appear once the action resolves.
        </p>
        <div className={emptyState}>Awaiting resolved turn.</div>
      </section>
    );
  }

  const ledgerEntries = model?.ledgerEntries ?? [];
  const stateDeltas = model?.stateDeltas ?? [];
  const pressureChanges = model?.pressureChanges ?? [];
  const thresholdEvents = model?.thresholdEvents ?? [];
  const [showAllConsequences, setShowAllConsequences] = useState(false);
  const consequences = useMemo(() => {
    const entries = ledgerEntries.map((entry) => ({
      id: entry.id,
      text: `${consequenceLabel[entry.category] ?? "World"} — ${entry.cause}${entry.effect ? ` → ${entry.effect}` : ""}`,
    }));
    const deltas = stateDeltas.map((delta, index) => ({
      id: `${delta.key}-${delta.value}-${index}`,
      text: `${delta.key}: ${delta.value}`,
    }));
    return [...entries, ...deltas];
  }, [ledgerEntries, stateDeltas]);
  const hasConsequences = consequences.length > 0;
  const visibleConsequences = showAllConsequences ? consequences : consequences.slice(0, 2);
  const complicationLabel =
    model?.failForwardComplication != null ? COMPLICATION_LABELS[model.failForwardComplication] : null;
  const effectLabels = (model?.effectSummaries ?? [])
    .map((summary) => EFFECT_LABELS[summary])
    .filter(Boolean);
  const opportunityWindow = model?.opportunityWindow;
  const opportunityLabel = opportunityWindow?.windowNarrowed
    ? OPPORTUNITY_WINDOW_LABELS[opportunityWindow.opportunityTier]
    : null;
  const watchfulnessActionLabel = model?.watchfulnessActionFlags?.stealthDisadvantage
    ? "Stealth disadvantage"
    : model?.watchfulnessActionFlags?.deceptionDisadvantage
    ? "Deception disadvantage"
    : null;
  const positionActionLabel = model?.positionActionFlags?.coverLost
    ? "Cover lost"
    : model?.positionActionFlags?.mobilityDisadvantage
    ? "Mobility disadvantage"
    : null;
  const severityLabel = model.outcomeSeverity ? `Severity: ${model.outcomeSeverity.toUpperCase()}` : null;
  const policyLabel = typeof model.forcedComplicationCount === "number"
    ? `Forced complications: ${model.forcedComplicationCount}`
    : null;
  const presentation = model.presentation;
  const resolution = presentation.resolution;
  const ledgerPresentationEntries = presentation.ledgerEntries;
  const consequenceComplicationLabels = (model?.consequenceComplicationEntries ?? [])
    .map((entry) => entry.narrationText ?? entry.ledgerText)
    .map((entryText) => {
      const normalizedKey = entryText.toLowerCase().replace(/[^a-z]+/g, "-");
      return EFFECT_LABELS[normalizedKey as FinalizedEffectSummary] ?? entryText;
    })
    .filter(Boolean);
  const consequenceExtraCostLabels = (model?.consequenceExtraCostEntries ?? []).map((entry) =>
    entry.narrationText ?? entry.ledgerText
  );

  return (
    <section
      className={`${cardShell} ${cardPadding} ${cardBorderClass(model.pressureStage)} ${highlightClass}`}
    >
      <header className="space-y-2">
        <div className={sectionHeading}>Latest Turn</div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-3xl font-semibold text-white">Turn {model?.turnIndex ?? "—"}</p>
          {model?.mode ? (
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
              {model.mode}
            </span>
          ) : null}
        </div>
      </header>

        <div className="space-y-4">
          <div className="space-y-3 border-b border-white/5 pb-4">
            <div className={sectionHeading}>Command</div>
            <p className="text-lg font-semibold text-white">{model?.playerInput ?? "Command missing"}</p>
          </div>
          <div className="space-y-2 border-b border-white/5 pb-3">
            <div className={sectionHeading}>Scene</div>
            <p className="text-sm text-slate-300">{model?.sceneText ?? "Scene text unavailable"}</p>
          </div>
          <ResolutionStrip resolution={resolution} pressureStage={model.pressureStage} />
          {model.pressureChanges.length > 0 && (
            <div className="space-y-1 border-b border-white/5 pb-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Pressure changes</div>
              <ul className="text-sm text-white/80">
                {model.pressureChanges.map((change) => (
                  <li key={`${change.domain}-${change.amount}`}>
                    {PRESSURE_DOMAIN_LABELS[change.domain] ?? change.domain} +{change.amount}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {model.thresholdEvents.length > 0 && (
            <div className="space-y-1 border-b border-white/5 pb-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Threshold events</div>
              <ul className="text-sm font-semibold text-amber-200">
                {model.thresholdEvents.map((event) => (
                  <li key={event}>{event}</li>
                ))}
              </ul>
            </div>
          )}
          {model?.notesLabel ? (
            <div className="space-y-2 border-b border-white/5 pb-3">
              <div className={sectionHeading}>Notes</div>
              <p className="text-sm text-white/60">{model.notesLabel}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border-t border-white/5 pt-4">
        <div className={sectionHeading}>Consequences</div>
        {complicationLabel ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">
            {complicationLabel}
          </div>
        ) : null}
        {effectLabels.length ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">
            {effectLabels.join(" • ")}
          </div>
        ) : null}
        {severityLabel ? (
          <div
            data-testid="severity-label"
            className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200"
          >
            {severityLabel}
          </div>
        ) : null}
        {policyLabel ? (
          <div
            data-testid="policy-label"
            className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70"
          >
            {policyLabel}
          </div>
        ) : null}
        {consequenceComplicationLabels.length ? (
          <div
            data-testid="consequence-complications"
            className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70"
          >
            {consequenceComplicationLabels.join(" • ")}
          </div>
        ) : null}
        {consequenceExtraCostLabels.length ? (
          <div
            data-testid="consequence-extra-costs"
            className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70"
          >
            {consequenceExtraCostLabels.join(" • ")}
          </div>
        ) : null}
        <NarrationBlock narration={presentation.narration} pressureStage={model.pressureStage} />
        <ConsequenceLedgerList
          entries={ledgerPresentationEntries}
          resolutionRollLabel={resolution.rollLabel}
          rollDetail={model.rollDetail ?? null}
        />
        {opportunityLabel ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            {opportunityLabel}
          </div>
        ) : null}
        {watchfulnessActionLabel ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            {watchfulnessActionLabel}
          </div>
        ) : null}
        {positionActionLabel ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            {positionActionLabel}
          </div>
        ) : null}
        {model?.constraintPressure && model.constraintPressure > 0 ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Constraint pressure: {model.constraintPressure}
          </div>
        ) : null}
        {model?.actionRiskTier && model.actionRiskTier !== "none" ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Action risk: {model.actionRiskTier.toUpperCase()} (Δ{model.actionRiskDelta})
          </div>
        ) : null}
        {model?.complicationTier && model.complicationTier !== "none" ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Complication tier: {model.complicationTier.toUpperCase()}
          </div>
        ) : null}
        {model?.forcedComplicationCount && model.forcedComplicationCount > 0 ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Forced complications: {model.forcedComplicationCount}
          </div>
        ) : null}
        {model?.complicationPolicyApplied ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Complication policy enforced
          </div>
        ) : null}
        {model?.consequenceBudgetExtraCostCount ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            Extra consequence cost: {model.consequenceBudgetExtraCostCount}
          </div>
        ) : null}
        {model?.npcStance ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
            NPC stance: {model.npcStance.toUpperCase()}
          </div>
        ) : null}
        {model?.opportunityCost ? (
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-200">
            Reduced margin applied
          </div>
        ) : null}
        <ul className="mt-3 space-y-2">
          {visibleConsequences.map((entry) => (
            <li key={entry.id} className="text-sm text-slate-200">
              {entry.text}
            </li>
          ))}
          {!hasConsequences && (
            <li className={emptyState}>No consequences were recorded for this turn.</li>
          )}
        </ul>
        {consequences.length > 2 ? (
          <button
            type="button"
            onClick={() => setShowAllConsequences((prev) => !prev)}
            className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300"
          >
            {showAllConsequences
              ? "Show fewer consequences"
              : `+${consequences.length - 2} more consequences`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
