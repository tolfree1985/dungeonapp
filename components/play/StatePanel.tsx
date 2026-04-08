"use client";

import type { MechanicFacts, StateItemViewModel, StatePanelViewModel } from "@/components/play/presenters";
import { cardPadding, cardShell, sectionHeading } from "./cardStyles";

type StatePanelProps = {
  viewModel: StatePanelViewModel;
};

const sections: Array<{ label: string; key: keyof StatePanelViewModel; empty: string }> = [
  { label: "Inventory", key: "inventory", empty: "Your pack is empty." },
  { label: "Relations", key: "relations", empty: "No key relationships yet." },
];

const emptyMechanicFacts: MechanicFacts = {
  achieved: [],
  costs: [],
  turnChanges: [],
  persistent: [],
  careNow: [],
  world: [],
  opportunities: [],
};

const SIGNAL_SEVERITY_CLASSES: Record<string, string> = {
  high: "text-amber-200",
  medium: "text-amber-300",
  low: "text-white/60",
};

export default function StatePanel({ viewModel }: StatePanelProps) {
  const sectionData: Array<{ label: string; items: StateItemViewModel[]; empty: string }> = sections.map((section) => ({
    label: section.label,
    items: viewModel[section.key] as StateItemViewModel[],
    empty: section.empty,
  }));
  const summary = viewModel.summary ?? emptyMechanicFacts;
  const careSignals = summary.careNow.map((line) => ({
    id: line.id,
    label: line.text,
    kind: line.kind ?? "hazard",
    severity: line.severity ?? "medium",
  }));
  const worldSummary = summary.world;
  const opportunitySummary = summary.opportunities;
  const pressureTotals = viewModel.pressureTotals ?? {
    suspicion: 0,
    noise: 0,
    time: 0,
    danger: 0,
  };

  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>State</div>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2 text-sm text-amber-200">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300">CARE NOW</div>
        {careSignals.length === 0 ? (
          <p className="text-sm text-amber-100">No urgent signals surfaced.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {careSignals.map((signal) => (
              <li key={signal.id} className="flex items-center gap-2">
                <span className="text-amber-300">⚠</span>
                <span className="font-semibold text-white">{signal.label}</span>
                <span className={`ml-auto text-[10px] uppercase tracking-[0.3em] ${SIGNAL_SEVERITY_CLASSES[signal.severity]}`}>
                  {signal.kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-2 text-sm text-white">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">WORLD</div>
        {worldSummary.length === 0 ? (
          <p className="text-sm text-white/50">No world truths surfaced.</p>
        ) : (
          <ul className="space-y-1 text-sm text-white/70">
            {worldSummary.map((line) => (
              <li key={line.id} className="flex items-center gap-2">
                <span className="text-xs text-white/60">•</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 space-y-2 text-sm text-white">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">OPPORTUNITIES</div>
        {opportunitySummary.length === 0 ? (
          <p className="text-sm text-white/50">No opportunities surfaced.</p>
        ) : (
          <ul className="space-y-1 text-sm text-white/70">
            {opportunitySummary.map((line) => (
              <li key={line.id} className="flex items-center gap-2">
                <span className="text-xs text-white/60">•</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">PRESSURE</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <span>Danger</span>
          <span className="font-semibold text-white">{pressureTotals.danger}</span>
          <span>Noise</span>
          <span className="font-semibold text-white">{pressureTotals.noise}</span>
          <span>Suspicion</span>
          <span className="font-semibold text-white">{pressureTotals.suspicion}</span>
        </div>
      </div>
      <div className="space-y-4">
        {sectionData.map((section) => (
          <div key={section.label} className="space-y-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">{section.label}</div>
            {section.items.length === 0 ? (
              <p className="text-sm text-white/50">{section.empty}</p>
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
      <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-[10px] text-white/60">
        <div className="font-semibold text-xs uppercase tracking-[0.3em] text-white/70">Dev Inspection</div>
        <pre
          data-testid="dev-inspection-json"
          className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-white/70"
        >
          {JSON.stringify(viewModel.devInspection, null, 2)}
        </pre>
      </div>
    </section>
  );
}
