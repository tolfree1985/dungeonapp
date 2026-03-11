"use client";

import { ui } from "@/lib/ui/classes";
import type { PlayStatePanel } from "@/app/play/types";

function formatStateValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const rowClass = "flex items-center justify-between text-sm";
const labelClass = "text-[#a59e90]";
const valueClass = "font-medium text-[#f3efe6]";

type StatePanelProps = {
  state: PlayStatePanel;
  panelTone?: string;
};

export default function StatePanel({ state, panelTone }: StatePanelProps) {
  const { stats, quests, inventory, relationships } = state;
  const highlightStats = new Set(["Alert", "Noise", "Heat", "Time"]);
  const toneClass = panelTone ? ` ${panelTone}` : "";

  return (
    <aside className="space-y-4">
      <div className={`${ui.panel} p-5${toneClass}`}>
        <div className={ui.sectionLabel}>State</div>
        <div className="mt-4 space-y-3">
          {stats.length > 0 ? (
            stats.map((stat) => (
              <div key={stat.key} className={rowClass}>
                <span className={labelClass}>{stat.key}</span>
                <span className={`${valueClass} ${highlightStats.has(stat.key) ? "text-white" : ""}`}>
                  {formatStateValue(stat.value)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
              State data is not available yet.
            </div>
          )}
        </div>
      </div>

      <div className={`${ui.panel} p-5${toneClass}`}>
        <div className={ui.sectionLabel}>Quests</div>
        <div className="mt-4 space-y-2">
          {quests.length > 0 ? (
            quests.map((quest) => (
              <div key={`${quest.title}-${quest.status ?? ""}`} className="rounded-[18px] border border-white/10 bg-black/10 p-3 space-y-1 text-sm text-[#d8d2c3]">
                <div className={rowClass}>
                  <span className={labelClass}>{quest.title}</span>
                  {quest.status ? (
                    <span className="hud-chip text-amber-200 border-amber-200/40 bg-amber-500/10">
                      {quest.status}
                    </span>
                  ) : null}
                </div>
                {quest.detail ? <p className="text-[12px] text-[#a59e90]">{quest.detail}</p> : null}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs text-slate-400">
              No active quests yet. Keep exploring to uncover new threads.
            </div>
          )}
        </div>
      </div>

      <div className={`${ui.panel} p-5${toneClass}`}>
        <div className={ui.sectionLabel}>Inventory</div>
        {inventory.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {inventory.map((item) => (
              <li key={item.name} className="hud-chip text-[#d8d2c3] bg-black/15 border-white/10">
                {item.name}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs text-slate-400">
            Your pack is empty. Useful tools appear as you explore Chronicle AI.
          </div>
        )}
      </div>

      <div className={`${ui.panel} p-5${toneClass}`}>
        <div className={ui.sectionLabel}>Relationships</div>
        <div className="mt-4 space-y-2 text-sm text-[#d8d2c3]">
          {relationships.length > 0 ? (
            relationships.map((relationship) => (
              <div key={`${relationship.name}-${relationship.status ?? ""}`} className={rowClass}>
                <span className="text-[#d8d2c3]">{relationship.name}</span>
                <span className="font-medium text-[#f3efe6]">{relationship.status ?? "Neutral"}</span>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs text-slate-400">
              No key relationships yet. Trust and suspicion will form through play.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
