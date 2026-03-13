"use client";

import type { StateItemViewModel, StatePanelViewModel } from "@/components/play/presenters";
import { cardPadding, cardShell, emptyState, sectionHeading } from "./cardStyles";

type StatePanelProps = {
  viewModel: StatePanelViewModel;
};

const sections: Array<{ label: string; key: keyof StatePanelViewModel; empty: string }> = [
  { label: "Status", key: "status", empty: "Status data is not available yet." },
  { label: "World", key: "world", empty: "World conditions are not reported." },
  { label: "Quests", key: "quests", empty: "No active quests yet." },
  { label: "Inventory", key: "inventory", empty: "Your pack is empty." },
  { label: "Relations", key: "relations", empty: "No key relationships yet." },
];

export default function StatePanel({ viewModel }: StatePanelProps) {
  const sectionData: Array<{ label: string; items: StateItemViewModel[]; empty: string }> = sections.map((section) => ({
    label: section.label,
    items: viewModel[section.key] as StateItemViewModel[],
    empty: section.empty,
  }));

  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>State</div>
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
