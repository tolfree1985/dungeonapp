"use client";

import { useMemo, useState } from "react";
import { WORLD_FLAGS } from "@/lib/engine/worldFlags";
import type { FinalizedEffectSummary } from "@/lib/finalized-effects";
import { parseActionIntent, type IntentMode } from "@/server/turn/actionIntent";
import { evaluateBlockedRule, type BlockedRuleContext, type BlockedTruth } from "@/server/turn/blockedRules";
import { evaluatePressureRules, type PressureTruth, type PressureRuleContext } from "@/server/turn/pressureRules";
import {
  analyzeScenarioRuleBundle,
  applyScenarioDiagnosticFix,
  diffScenarioRuleBundles,
  mergeRuleCatalog,
  normalizeScenarioRuleBundle,
  type DiagnosticFixDescriptor,
  type RuleAnalysis,
  type RuleDiff,
  type ScenarioRuleBundle,
} from "@/lib/scenario/scenarioRules";
import { evaluateOpportunityRules, type OpportunityTruth } from "@/server/turn/opportunityRules";
import { BLOCKED_RULES } from "@/server/turn/blockedRules";
import { PRESSURE_RULES } from "@/server/turn/pressureRules";
import { OPPORTUNITY_RULES } from "@/server/turn/opportunityRules";

type PlaygroundSimulation = {
  mode: IntentMode;
  rawInput: string;
  sceneText: string;
  sceneClock: number;
  prevFlags: Record<string, boolean>;
  nextFlags: Record<string, boolean>;
  prevStats: Record<string, number>;
  nextStats: Record<string, number>;
  prevStage: "calm" | "tension" | "danger" | "crisis";
  nextStage: "calm" | "tension" | "danger" | "crisis";
};

type AnalysisResult = {
  bundle: ScenarioRuleBundle | null;
  analysis: RuleAnalysis | null;
  error: string | null;
};

type FixPreviewState = {
  fixLabel: string;
  diffs: RuleDiff[];
} | null;

type SimulationResult = {
  intent: ReturnType<typeof parseActionIntent>;
  blocked: BlockedTruth | null;
  pressure: PressureTruth | null;
  opportunity: OpportunityTruth | null;
  previewOutcome: string;
};

const SAMPLE_RULES = JSON.stringify(
  {
    blocked: [
      {
        id: "SCENARIO_MOVE_BLOCKED_GENERIC",
        blockedAction: "move",
        intent: { mode: "SAY", verb: "speak" },
        conditions: [{ type: "flag", key: WORLD_FLAGS.guard.alerted, equals: true }],
        cause: "guard.alerted",
        effect: "movement prevented",
        detail: "Generic move block used to demonstrate FIRST_MATCH shadowing.",
        scene: "The route is blocked.",
        resolutionNotes: "Move is prevented.",
        ledgerEntry: {
          id: "playground.move.blocked.generic",
          kind: "action.blocked",
          blockedRuleId: "SCENARIO_MOVE_BLOCKED_GENERIC",
          blockedAction: "move",
          cause: "route.collapsed",
          effect: "movement prevented",
          detail: "Generic move block used to demonstrate FIRST_MATCH shadowing.",
        },
      },
      {
        id: "SCENARIO_MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
        blockedAction: "move",
        intent: { mode: "SAY", verb: "speak" },
        conditions: [{ type: "flag", key: WORLD_FLAGS.guard.alerted, equals: true }],
        cause: "guard.alerted",
        effect: "movement prevented",
        detail: "The passage is physically blocked and cannot be traversed.",
        scene: "The route ahead has collapsed and cannot be crossed.",
        resolutionNotes: "The passage is physically collapsed.",
        ledgerEntry: {
          id: "playground.move.blocked.route_collapsed",
          kind: "action.blocked",
          blockedRuleId: "SCENARIO_MOVE_BLOCKED_BY_COLLAPSED_PASSAGE",
          blockedAction: "move",
          cause: "guard.alerted",
          effect: "movement prevented",
          detail: "The passage is physically blocked and cannot be traversed.",
        },
      },
    ],
    pressure: [
      {
        id: "WAIT_ADVANCES_INVESTIGATION",
        category: "pressure",
        when: [[{ type: "statAtLeast", key: "noise", value: 3 }]],
        effects: [
          {
            type: "flag.set",
            key: WORLD_FLAGS.guard.alerted,
            value: true,
            detail: "Noise makes the guard alert.",
          },
        ],
        ledger: {
          kind: "system.effect",
          cause: "noise threshold crossed",
          effect: "Guard is alerted",
          detail: "Noise makes the guard alert.",
        },
      },
    ],
    opportunity: [
      {
        id: "SHADOW_HIDE_OPPORTUNITY",
        when: [[
          { type: "intentMode", mode: "DO" },
          { type: "inputIncludes", value: "hide" },
          { type: "sceneTextIncludes", value: "shadow" },
        ]],
        effects: [
          {
            type: "window.set",
            windowNarrowed: false,
            opportunityTier: "normal",
            detail: "Deep shadows make concealment easier.",
          },
          {
            type: "ledger",
            cause: "deep shadow",
            effect: "concealment improved",
            detail: "The shadows make concealment easier.",
          },
        ],
      },
    ],
  },
  null,
  2,
);

const SAMPLE_SIMULATION = JSON.stringify(
  {
    mode: "SAY",
    rawInput: "speak softly",
    sceneText: "Deep shadow hangs over the collapsed route.",
    sceneClock: 3,
    prevFlags: {},
    nextFlags: {
      [WORLD_FLAGS.guard.alerted]: true,
    },
    prevStats: { noise: 2, alert: 0, time: 3, danger: 0 },
    nextStats: { noise: 3, alert: 1, time: 3, danger: 0 },
    prevStage: "calm",
    nextStage: "tension",
  },
  null,
  2,
);

function parseJson<T>(input: string): { value: T | null; error: string | null } {
  try {
    return { value: JSON.parse(input) as T, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function RulePlaygroundContent() {
  const [rulesText, setRulesText] = useState(SAMPLE_RULES);
  const [simulationText, setSimulationText] = useState(SAMPLE_SIMULATION);
  const [fixPreview, setFixPreview] = useState<FixPreviewState>(null);

  const analysisState = useMemo<AnalysisResult>(() => {
    const parsed = parseJson<Record<string, unknown>>(rulesText);
    if (parsed.error) {
      return { bundle: null, analysis: null, error: parsed.error };
    }
    const normalized = normalizeScenarioRuleBundle(parsed.value);
    if (!normalized) {
      return { bundle: null, analysis: null, error: null };
    }
    try {
      const analysis = analyzeScenarioRuleBundle(normalized);
      return { bundle: normalized, analysis, error: null };
    } catch (error) {
      return {
        bundle: normalized,
        analysis: null,
        error: error instanceof Error ? error.message : "Failed to analyze rule bundle",
      };
    }
  }, [rulesText]);

  const simulationState = useMemo(() => parseJson<PlaygroundSimulation>(simulationText), [simulationText]);

  const simulation = useMemo<SimulationResult | null>(() => {
    if (!analysisState.bundle || simulationState.error || !simulationState.value) return null;

    const catalog = mergeRuleCatalog(
      {
        blocked: BLOCKED_RULES,
        pressure: PRESSURE_RULES,
        opportunity: OPPORTUNITY_RULES,
      },
      analysisState.bundle,
    );

    const preview = simulationState.value;
    const intent = parseActionIntent(preview.mode, preview.rawInput);

    const blockedContext: BlockedRuleContext = {
      intent,
      stateFlags: preview.nextFlags,
      stateStats: preview.nextStats,
    };
    const blockedMatch = evaluateBlockedRule(blockedContext, catalog.blocked);
    const pressureContext: PressureRuleContext = {
      prevFlags: preview.prevFlags,
      nextFlags: preview.nextFlags,
      prevStats: preview.prevStats,
      nextStats: preview.nextStats,
      prevStage: preview.prevStage,
      nextStage: preview.nextStage,
    };
    const pressureResult = evaluatePressureRules(pressureContext, catalog.pressure);
    const opportunityResult = evaluateOpportunityRules(
      {
        intentMode: intent.mode,
        normalizedInput: intent.normalizedInput,
        sceneText: preview.sceneText.toLowerCase(),
        effectSummaries: [] as FinalizedEffectSummary[],
        sceneClock: preview.sceneClock,
      },
      catalog.opportunity,
    );

    return {
      intent,
      blocked: blockedMatch
        ? {
            ruleId: blockedMatch.id,
            blockedAction: blockedMatch.blockedAction,
            matchedConditions: blockedMatch.matchedConditions,
            cause: blockedMatch.cause,
            effect: blockedMatch.effect,
          }
        : null,
      pressure: pressureResult.pressureTruth,
      opportunity: opportunityResult.opportunityTruth,
      previewOutcome: blockedMatch
        ? "BLOCKED"
        : pressureResult.matchedRules.length
          ? "PRESSURE"
          : opportunityResult.matchedRules.length
            ? "OPPORTUNITY"
            : "NO MATCH",
    };
  }, [analysisState.bundle, simulationText, simulationState.error, simulationState.value]);

  const analysis = analysisState.analysis;
  const error = analysisState.error ?? simulationState.error;
  const warningCount = analysis?.warnings.length ?? 0;
  const errorCount = analysis?.errors.length ?? 0;
  const applyFix = (fix: DiagnosticFixDescriptor) => {
    if (!analysisState.bundle) return;
    const before = analysisState.bundle;
    const updated = applyScenarioDiagnosticFix(analysisState.bundle, fix);
    setFixPreview({
      fixLabel: fix.label,
      diffs: diffScenarioRuleBundles(before, updated),
    });
    setRulesText(JSON.stringify(updated, null, 2));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.18),_transparent_40%),linear-gradient(180deg,#0b1020_0%,#050814_100%)] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Dev Playground</p>
          <h1 className="text-3xl font-semibold tracking-tight">Rule Authoring Playground</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Edit a scenario rule bundle, get diagnostics instantly, and simulate the engine against sample intent and state
            without leaving the browser.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setRulesText(SAMPLE_RULES)}
            className="rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20"
          >
            Load example rules
          </button>
          <button
            type="button"
            onClick={() => setSimulationText(SAMPLE_SIMULATION)}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
          >
            Load example simulation
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20">
            <div>
              <h2 className="text-lg font-semibold">Scenario Rules</h2>
              <p className="text-sm text-white/60">Paste the rule bundle you want to validate and preview.</p>
            </div>
            <textarea
              value={rulesText}
              onChange={(event) => setRulesText(event.target.value)}
              className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-[12px] leading-5 text-slate-100 outline-none ring-0 transition placeholder:text-slate-500 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20"
              spellCheck={false}
            />
          </section>

          <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20">
            <div>
              <h2 className="text-lg font-semibold">Simulation Input</h2>
              <p className="text-sm text-white/60">Change the action, flags, and pressure state to test matches.</p>
            </div>
            <textarea
              value={simulationText}
              onChange={(event) => setSimulationText(event.target.value)}
              className="min-h-[420px] w-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 font-mono text-[12px] leading-5 text-slate-100 outline-none ring-0 transition placeholder:text-slate-500 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20"
              spellCheck={false}
            />
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <section className="rounded-3xl border border-white/10 bg-black/20 p-5 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Diagnostics</h2>
                <p className="text-sm text-white/60">Human-readable validation feedback from the analyzer.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                {analysis ? `${analysis.valid ? "valid" : "invalid"}` : "unparsed"}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-white/70">
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2">
                <div className="text-rose-200">Errors</div>
                <div className="mt-1 text-lg font-semibold text-white">{errorCount}</div>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2">
                <div className="text-amber-200">Warnings</div>
                <div className="mt-1 text-lg font-semibold text-white">{warningCount}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-sky-200">Preview</div>
                <div className="mt-1 text-lg font-semibold text-white">{simulation?.previewOutcome ?? "—"}</div>
              </div>
            </div>

            {error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}

            <div className="mt-4 space-y-3">
              {(analysis?.diagnostics ?? []).length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                  No diagnostics surfaced.
                </div>
              ) : (
                (analysis?.diagnostics ?? []).map((diagnostic) => (
                  <article
                    key={`${diagnostic.type}:${diagnostic.ruleId}:${diagnostic.relatedRuleId ?? "root"}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em]">
                      <span className={diagnostic.severity === "error" ? "text-rose-200" : "text-amber-200"}>
                        {diagnostic.severity}
                      </span>
                      <span className="text-white/50">{diagnostic.type}</span>
                      <span className="text-white/80">{diagnostic.ruleId}</span>
                      {diagnostic.relatedRuleId ? <span className="text-white/50">→ {diagnostic.relatedRuleId}</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-white/90">{diagnostic.message}</p>
                    {diagnostic.suggestedFixes?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {diagnostic.suggestedFixes.map((fix) => (
                          <button
                            key={`${diagnostic.ruleId}:${fix.id}:${fix.relatedRuleId ?? "root"}`}
                            type="button"
                            onClick={() => applyFix(fix)}
                            className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20"
                            title={fix.description}
                          >
                            Apply Fix
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {diagnostic.suggestion ? (
                      <p className="mt-2 text-xs text-white/60">Suggested fix: {diagnostic.suggestion}</p>
                    ) : null}
                  </article>
                ))
              )}

              {fixPreview ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.3em] text-emerald-200">Fix Preview</div>
                  <div className="mt-1 text-sm font-semibold text-white">{fixPreview.fixLabel}</div>
                  <div className="mt-3 space-y-2">
                    {fixPreview.diffs.map((diff) => (
                      <div key={`${diff.type}:${diff.path}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/60">
                          <span className={diff.type === "add" ? "text-emerald-200" : diff.type === "remove" ? "text-rose-200" : "text-amber-200"}>
                            {diff.type}
                          </span>
                          <span className="text-white/80">{diff.path || "root"}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-white/75">
                          {"before" in diff ? (
                            <div className="break-words">
                              <span className="text-white/50">Before:</span> {JSON.stringify(diff.before)}
                            </div>
                          ) : null}
                          {"after" in diff ? (
                            <div className="break-words">
                              <span className="text-white/50">After:</span> {JSON.stringify(diff.after)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-5 shadow-2xl shadow-black/20">
            <div>
              <h2 className="text-lg font-semibold">Simulation Preview</h2>
              <p className="text-sm text-white/60">The real engine preview from the merged catalog.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Intent</div>
              <div className="mt-2 text-sm text-white/80">{simulation?.intent.rawInput ?? "—"}</div>
              <div className="mt-1 text-xs text-white/50">
                mode: {simulation?.intent.mode ?? "—"} · verb: {simulation?.intent.verb ?? "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Blocked</div>
              {simulation?.blocked ? (
                <div className="mt-2 space-y-2">
                  <div className="text-sm font-semibold text-rose-100">{simulation.blocked.ruleId}</div>
                  <div className="text-sm text-white/80">{simulation.blocked.cause} → {simulation.blocked.effect}</div>
                  <pre className="overflow-auto rounded-xl bg-black/30 p-3 text-[11px] text-white/70">
                    {JSON.stringify(simulation.blocked.matchedConditions, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/60">No blocked rule matched.</div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Pressure</div>
              {simulation?.pressure?.rulesTriggered.length ? (
                <div className="mt-2 space-y-2">
                  {simulation.pressure.rulesTriggered.map((rule) => (
                    <div key={rule.ruleId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
                      <div className="font-semibold text-white">{rule.ruleId}</div>
                      <div className="mt-1 text-xs text-white/60">Effects: {rule.effects.map((effect) => effect.type).join(", ")}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/60">No pressure rule matched.</div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Opportunity</div>
              {simulation?.opportunity?.rulesTriggered.length ? (
                <div className="mt-2 space-y-2">
                  {simulation.opportunity.rulesTriggered.map((rule) => (
                    <div key={rule.ruleId} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
                      <div className="font-semibold text-white">{rule.ruleId}</div>
                      <div className="mt-1 text-xs text-white/60">Matched: {rule.matchedConditions.length} condition(s)</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/60">No opportunity rule matched.</div>
              )}
            </div>

            {analysis?.warnings.length ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                <div className="font-semibold text-amber-200">Readable warning</div>
                <div className="mt-1">{analysis.warnings[0].message}</div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function RulePlayground() {
  return <RulePlaygroundContent />;
}
