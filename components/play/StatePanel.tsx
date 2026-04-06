"use client";

import type { PresentedStateMetric, StateItemViewModel, StatePanelViewModel } from "@/components/play/presenters";
import type { StateTier } from "@/lib/ui/present-state-tier";
import { getPressureClasses } from "@/lib/ui/pressure-style";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";
import type { PressureAxis } from "@/lib/presentation/pressureLanguage";

type StatePanelProps = {
  viewModel: StatePanelViewModel;
};

const sections: Array<{ label: string; key: keyof StatePanelViewModel; empty: string }> = [
  { label: "World", key: "world", empty: "World conditions are not reported." },
  { label: "Quests", key: "quests", empty: "No active quests yet." },
  { label: "Inventory", key: "inventory", empty: "Your pack is empty." },
  { label: "Relations", key: "relations", empty: "No key relationships yet." },
];

const STATE_METRIC_LABELS = {
  alert: "Detection",
  noise: "Noise",
  heat: "Danger",
  trust: "Trust",
} as const;

const STATE_METRIC_ORDER: Array<keyof typeof STATE_METRIC_LABELS> = ["alert", "noise", "heat", "trust"];

const STATE_TIER_RANK: Record<StateTier, number> = {
  Low: 1,
  Moderate: 2,
  High: 3,
  Extreme: 4,
};

const METRIC_AXIS_MAP: Record<keyof StatePanelViewModel["metrics"], PressureAxis | null> = {
  alert: "suspicion",
  noise: "noise",
  heat: "danger",
  trust: null,
};

type StateMetricKey = keyof StatePanelViewModel["metrics"];
const SIGNAL_SEVERITY_CLASSES: Record<string, string> = {
  high: "text-amber-200",
  medium: "text-amber-300",
  low: "text-white/60",
};

const metricSeverity = (metric: PresentedStateMetric | null): number => {
  if (!metric) return 0;
  const rank = STATE_TIER_RANK[metric.label as StateTier];
  return rank ?? 0;
};

function determinePrimaryMetrics(metrics: StatePanelViewModel["metrics"]): StateMetricKey[] {
  const keys: StateMetricKey[] = ["alert", "noise", "heat", "trust"];
  const severityFor = (key: StateMetricKey) => metricSeverity(metrics[key]);
  const alertSeverity = severityFor("alert");
  const noiseSeverity = severityFor("noise");
  const heatSeverity = severityFor("heat");
  const trustSeverity = severityFor("trust");
  const highestSeverity = Math.max(alertSeverity, noiseSeverity, heatSeverity, trustSeverity);

  const isStealthPriority = (alertSeverity >= 3 || noiseSeverity >= 3) && heatSeverity < 3;
  const isExplorationPriority = heatSeverity >= 3 && !isStealthPriority;
  const isSocialPriority = trustSeverity <= 2 && alertSeverity >= 2 && !isStealthPriority;

  if (isStealthPriority) return ["alert", "noise"];
  if (isSocialPriority) return ["alert", "trust"];
  if (isExplorationPriority) return ["heat"];
  if (highestSeverity === 0) return keys;

  const threshold = Math.max(1, highestSeverity - 1);
  return keys.filter((key) => severityFor(key) >= threshold);
}

export default function StatePanel({ viewModel }: StatePanelProps) {
  const sectionData: Array<{ label: string; items: StateItemViewModel[]; empty: string }> = sections.map((section) => ({
    label: section.label,
    items: viewModel[section.key] as StateItemViewModel[],
    empty: section.empty,
  }));
  const careSignals = viewModel.summary.careNow;
  const worldSummary = viewModel.summary.world;
  const opportunitySummary = viewModel.summary.opportunities;
  const pressureTotals = viewModel.pressureTotals ?? {
    suspicion: 0,
    noise: 0,
    time: 0,
    danger: 0,
  };
  const pressureStyles = getPressureClasses(viewModel.pressureStage);
  type MetricEntry = { key: StateMetricKey; label: string; metric: PresentedStateMetric | null };
  const metricEntries: MetricEntry[] = STATE_METRIC_ORDER.map((key) => ({
    key,
    label: STATE_METRIC_LABELS[key],
    metric: viewModel.metrics[key],
  }));
  const detailEntries = metricEntries.filter((entry) => entry.metric);
  const primaryMetricKeys = determinePrimaryMetrics(viewModel.metrics);
  const showDetails = detailEntries.length > 0 || viewModel.metrics.trust !== null;
  const riskLabel = viewModel.risk ?? "—";
  const pressureSummary = viewModel.pressureSummary;
  const summaryDetail = viewModel.pressureAxisDescriptions[pressureSummary.axis];

  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>State</div>
      {careSignals.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2 text-sm text-amber-200">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300">CARE NOW</div>
          <ul className="space-y-1 text-sm">
            {careSignals.map((signal) => (
              <li key={`${signal.kind}-${signal.label}`} className="flex items-center gap-2">
                <span className="text-amber-300">⚠</span>
                <span className="font-semibold text-white">{signal.label}</span>
                <span className={`ml-auto text-[10px] uppercase tracking-[0.3em] ${SIGNAL_SEVERITY_CLASSES[signal.severity]}`}>
                  {signal.kind}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {worldSummary.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-2 text-sm text-white">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">WORLD</div>
          <ul className="space-y-1 text-sm text-white/70">
            {worldSummary.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <span className="text-xs text-white/60">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {opportunitySummary.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-2 text-sm text-white">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">OPPORTUNITIES</div>
          <ul className="space-y-1 text-sm text-white/70">
            {opportunitySummary.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <span className="text-xs text-white/60">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <div className="text-sm font-semibold text-white">{pressureSummary.title}</div>
        <p className="mt-1 text-xs text-white/60">{summaryDetail}</p>
      </div>
      <div className={`rounded-xl border ${pressureStyles.border} ${pressureStyles.glow ?? ""} px-3 py-2`}>
        <div className={`text-sm font-semibold ${pressureStyles.text}`}>Risk — {riskLabel}</div>
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/70">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Pressure</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <span>Suspicion</span>
          <span className="font-semibold text-white">{pressureTotals.suspicion}</span>
          <span>Noise</span>
          <span className="font-semibold text-white">{pressureTotals.noise}</span>
          <span>Time</span>
          <span className="font-semibold text-white">{pressureTotals.time}</span>
          <span>Danger</span>
          <span className="font-semibold text-white">{pressureTotals.danger}</span>
        </div>
      </div>
      {showDetails ? (
        <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.3em] text-white/50">Details</summary>
          <div className="mt-2 space-y-1">
            {detailEntries.map((entry) => {
              const isPrimary = primaryMetricKeys.includes(entry.key);
              const labelClass = isPrimary ? "text-white" : "text-white/50";
              const valueClass = isPrimary ? "font-semibold text-white" : "font-semibold text-white/60";
              const axis = METRIC_AXIS_MAP[entry.key];
              const axisDetail = axis ? viewModel.pressureAxisDescriptions[axis] : null;
              return (
                <div key={entry.label} className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className={labelClass}>{entry.label}</span>
                    <span className={valueClass}>{entry.metric?.label ?? "—"}</span>
                  </div>
                  {axisDetail ? (
                    <p className="text-[10px] text-white/50">{axisDetail}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
      <div className="space-y-4">
        {sectionData.map((section) => (
          <div key={section.label} className="space-y-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">{section.label}</div>
            {section.items.length === 0 ? (
              <div className={emptyState}>{section.empty}</div>
            ) : (
              <div className="space-y-2">
                {section.items.map((item) => (
                  <article
                    key={`${item.label}-${item.category}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">{item.label}</span>
                      <span className={`font-semibold text-white ${item.emphasis === "high" ? "text-white" : "text-white"}`}>
                        {item.value}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
