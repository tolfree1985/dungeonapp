"use client";

import { ui } from "@/lib/ui/classes";
import type { StatePanelViewModel } from "@/components/play/presenters";

const rowClass = "flex items-center justify-between text-sm";
const labelClass = "text-[#a59e90]";
const valueClass = "font-medium text-[#f3efe6]";
const categoryLabels: Record<StatePanelViewModel["status"][number]["category"], string> = {
  world: "World",
  quest: "Quest",
  inventory: "Inventory",
  status: "Status",
  relation: "Relation",
};

type SectionProps = {
  title: string;
  items: StatePanelViewModel["status"];
  emptyMessage: string;
  toneClass: string;
};

function SectionPanel({ title, items, emptyMessage, toneClass }: SectionProps) {
  return (
    <div className={`${ui.panel} p-5${toneClass}`}>
      <div className={ui.sectionLabel}>{title}</div>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={`${item.label}-${item.category}`} className="rounded-[18px] border border-white/10 bg-black/10 p-3 space-y-1 text-sm">
              <div className={rowClass}>
                <span className={labelClass}>{item.label}</span>
                <span className={`${valueClass} ${item.emphasis === "high" ? "text-white" : ""}`}>{item.value}</span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                {categoryLabels[item.category]}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs text-slate-400">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

type StatePanelProps = {
  viewModel: StatePanelViewModel;
  panelTone?: string;
};

export default function StatePanel({ viewModel, panelTone }: StatePanelProps) {
  const toneClass = panelTone ? ` ${panelTone}` : "";

  return (
    <aside className="space-y-4">
      <SectionPanel
        title="Status"
        items={viewModel.status}
        emptyMessage="Status data is not available yet."
        toneClass={toneClass}
      />
      <SectionPanel
        title="World"
        items={viewModel.world}
        emptyMessage="World conditions are not reported."
        toneClass={toneClass}
      />
      <SectionPanel
        title="Quests"
        items={viewModel.quests}
        emptyMessage="No active quests yet."
        toneClass={toneClass}
      />
      <SectionPanel
        title="Inventory"
        items={viewModel.inventory}
        emptyMessage="Your pack is empty."
        toneClass={toneClass}
      />
      <SectionPanel
        title="Relations"
        items={viewModel.relations}
        emptyMessage="No key relationships yet."
        toneClass={toneClass}
      />
    </aside>
  );
}
