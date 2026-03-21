"use client";

import type { PresentedStateMetric, StateItemViewModel, StatePanelViewModel } from "@/components/play/presenters";
import type { StateTier } from "@/lib/ui/present-state-tier";
import { getPressureClasses } from "@/lib/ui/pressure-style";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";

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

type StateMetricKey = keyof StatePanelViewModel["metrics"];

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

  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>State</div>
      <div className={`rounded-xl border ${pressureStyles.border} ${pressureStyles.glow ?? ""} px-3 py-2`}>
        <div className={`text-sm font-semibold ${pressureStyles.text}`}>Risk — {riskLabel}</div>
      </div>
      {showDetails ? (
        <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.3em] text-white/50">Details</summary>
          <div className="mt-2 space-y-1">
            {detailEntries.map((entry) => {
              const isPrimary = primaryMetricKeys.includes(entry.key);
              const labelClass = isPrimary ? "text-white" : "text-white/50";
              const valueClass = isPrimary ? "font-semibold text-white" : "font-semibold text-white/60";
              return (
                <div key={entry.label} className="flex items-center justify-between text-[11px]">
                  <span className={labelClass}>{entry.label}</span>
                  <span className={valueClass}>{entry.metric?.label ?? "—"}</span>
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
