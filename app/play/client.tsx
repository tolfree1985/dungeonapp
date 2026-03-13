"use client";
import { useEffect, useMemo, useState } from "react";
import AdventureHistoryRow from "@/components/play/AdventureHistoryRow";
import HistorySlotCard from "@/components/play/HistorySlotCard";
import { formatPlayTimestamp } from "@/components/play/formatTimestamp";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import PressureMeter from "@/components/play/PressureMeter";
import StatePanel from "@/components/play/StatePanel";
import TurnInput from "@/components/play/TurnInput";
import {
  AdventureHistoryRowViewModel,
  buildAdventureHistoryRowViewModel,
  buildLatestTurnViewModel,
  buildStatePanelViewModel,
  formatLedgerDisplay,
} from "@/components/play/presenters";
import { ui } from "@/lib/ui/classes";
import WorldContext from "@/components/play/WorldContext";
import LedgerPanel from "@/components/play/LedgerPanel";
import type { PlayScenarioMeta, PlayStatePanel, PlayTurn } from "./types";

function pressureBadgeTone(stage: string | null | undefined) {
  const normalized = typeof stage === "string" ? stage.toLowerCase() : "calm";
  if (normalized === "crisis") return "border-red-300 bg-red-50 text-red-800";
  if (normalized === "danger") return "border-orange-300 bg-orange-50 text-orange-800";
  if (normalized === "tension") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

const previewLatestTurn: PlayTurn & { rollTotal: number; pressureStage: string } = {
  id: "chronicle-preview-latest",
  turnIndex: 1,
  playerInput: "Do: Inspect the observatory door for signs of forced entry.",
  scene:
    "Rain taps against the cracked dome as your lantern catches fresh splinters around the lock.",
  resolution: "Partial success",
  stateDeltas: [],
  ledgerAdds: [
    "Inspected the observatory door → Revealed fresh tool marks",
    "Spent time at the entrance → Time advanced",
  ],
  createdAt: new Date().toISOString(),
  rollTotal: 7,
  pressureStage: "tension",
};

const previewTurns: Array<PlayTurn & { rollTotal?: number; pressureStage?: string }> = [
  previewLatestTurn,
  {
    id: "chronicle-preview-previous",
    turnIndex: 0,
    playerInput: "Say: Approach the observatory quietly.",
    scene: "",
    resolution: "Success",
    stateDeltas: [],
    ledgerAdds: ["Reached the observatory grounds → New location discovered"],
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    pressureStage: "calm",
  },
];

function RecentTurnsPanel({ rows }: { rows: AdventureHistoryRowViewModel[] }) {
  if (rows.length === 0) return null;

  return (
    <div className={`${ui.panel} p-5 space-y-3`}>
      <div className={ui.sectionLabel}>Recent turns</div>
      <div className="space-y-3">
        {rows.map((row) => (
          <AdventureHistoryRow key={`${row.turnIndex}-${row.timestampLabel}`} model={row} />
        ))}
      </div>
    </div>
  );
}
function TopBar() {
  return (
    <header className={ui.topBar}>
      <div className="min-w-0">
        <div className={ui.sectionLabel}>Chronicle AI</div>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-[#f3efe6]">The Ashen Estate</h1>
        <p className="mt-1 text-sm text-[#a59e90]">Servants’ Wing • Turn 14</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
          Tension
        </span>
        <button className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[#d8d2c3] hover:bg-white/10">
          Settings
        </button>
      </div>
    </header>
  );
}

export default function PlayClient({
  adventureId,
  scenarioId,
  turns,
  statePanel,
  currentScenario,
  dbOffline = false,
}: {
  adventureId: string | null;
  scenarioId: string | null;
  turns: PlayTurn[];
  statePanel: PlayStatePanel;
  currentScenario: PlayScenarioMeta | null;
  dbOffline?: boolean;
}) {
  const HISTORY_KEY = "creator:recentAdventures";
  type HistoryEntry = {
    adventureId: string;
    scenarioId?: string | null;
    timestamp: number;
    pinned?: boolean;
  };
  const MAX_HISTORY = 6;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const currentId = adventureId;
  const sortHistory = (entries: HistoryEntry[]) =>
    [...entries].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return b.timestamp - a.timestamp;
    });
  const limitHistory = (entries: HistoryEntry[]) => sortHistory(entries).slice(0, MAX_HISTORY);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(HISTORY_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as HistoryEntry[];
      if (Array.isArray(parsed)) {
        setHistory(limitHistory(parsed));
      }
    } catch {
      window.localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  useEffect(() => {
    if (!adventureId || typeof window === "undefined") return;
    setHistory((prev) => {
      const pinned = prev.find((entry) => entry.adventureId === adventureId)?.pinned ?? false;
      const nextEntry: HistoryEntry = {
        adventureId,
        scenarioId: scenarioId ?? null,
        timestamp: Date.now(),
        pinned,
      };
      const filtered = prev.filter((entry) => entry.adventureId !== adventureId);
      return limitHistory([nextEntry, ...filtered]);
    });
  }, [adventureId, scenarioId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (history.length === 0) {
      window.localStorage.removeItem(HISTORY_KEY);
      return;
    }
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const copyToClipboard = (value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(value);
  };

  const latestTurn = turns[0] ?? null;
  const previousTurns = turns.slice(1);
  const pressureStage = statePanel.pressureStage ?? "calm";
  const currentEntry = currentId ? history.find((entry) => entry.adventureId === currentId) ?? null : null;
  const pinnedEntries = history.filter((entry) => entry.pinned && entry.adventureId !== currentId);
  const recentEntries = history.filter((entry) => !entry.pinned && entry.adventureId !== currentId);
  const hasTurns = turns.length > 0;
  const showPreview = dbOffline && !hasTurns;
  const latestDisplayTurn = hasTurns ? latestTurn : showPreview ? previewLatestTurn : null;
  const recentDisplayTurns = hasTurns ? previousTurns : showPreview ? previewTurns.slice(1) : [];
  const displayPressureStage = (showPreview ? previewLatestTurn.pressureStage : pressureStage) ?? "calm";
  const ambienceByPressure: Record<string, string> = {
    calm: "ambience-calm",
    tension: "ambience-tension",
    danger: "ambience-danger",
    crisis: "ambience-crisis",
  };
  const ambienceClass = ambienceByPressure[displayPressureStage] ?? "ambience-calm";
  const pressureEdge =
    displayPressureStage === "crisis"
      ? "pressure-edge-crisis"
      : displayPressureStage === "danger"
      ? "pressure-edge-danger"
      : "";

  const handleClearHistory = () => setHistory([]);
  const handleRemoveEntry = (entryId: string) =>
    setHistory((prev) => {
      const next = prev.filter((entry) => entry.adventureId !== entryId);
      return limitHistory(next);
    });
  const handleTogglePin = (entryId: string) =>
    setHistory((prev) => {
      const next = prev.map((entry) =>
        entry.adventureId === entryId ? { ...entry, pinned: !entry.pinned } : entry
      );
      return limitHistory(next);
    });

  const latestTurnModel = useMemo(() => {
    if (!latestDisplayTurn) return null;
    return buildLatestTurnViewModel(latestDisplayTurn, displayPressureStage);
  }, [displayPressureStage, latestDisplayTurn]);

  const recentTurnRows = useMemo(
    () => recentDisplayTurns.map((turn) => buildAdventureHistoryRowViewModel(turn, displayPressureStage)),
    [displayPressureStage, recentDisplayTurns]
  );
  const statePanelViewModel = useMemo(() => buildStatePanelViewModel(statePanel), [statePanel]);

  const hero = useMemo(() => {
    if (!adventureId) return null;
    const linkedScenarioId = currentScenario?.id ?? scenarioId ?? undefined;
    return (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-600">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
            live
          </span>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">
            adventure-ready
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-600">Turn index: -</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">Status: ready</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">Tier: creator</span>
          <span className={`rounded-full border px-2.5 py-1 font-semibold ${pressureBadgeTone(pressureStage)}`}>
            Pressure: {pressureStage.toUpperCase()}
          </span>
        </div>
        <div className="text-lg font-semibold text-slate-900">Current adventure</div>
        <p className="mt-2 text-sm text-slate-600">{currentScenario?.summary ?? "Live adventure streaming"}</p>
      <div className="mt-4 space-y-2 text-[11px] text-slate-500">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/play?adventureId=${encodeURIComponent(adventureId)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200"
          >
            Resume
          </a>
          <button
            type="button"
            onClick={() => handleTogglePin(adventureId)}
            className="inline-flex items-center rounded-md bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200"
          >
            {currentEntry?.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(adventureId)}
            className="inline-flex items-center rounded-md bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200"
          >
            Copy ID
          </button>
          <button
            type="button"
            onClick={() => handleRemoveEntry(adventureId)}
            className="inline-flex items-center rounded-md bg-rose-900/70 px-3 py-1 text-xs font-semibold text-slate-100"
          >
            Remove
          </button>
        </div>
        <details className="text-[10px] text-slate-400">
          <summary className="cursor-pointer">Developer tools</summary>
          <div className="mt-1 space-y-1 text-[9px] text-slate-500">
            <div>Scenario ID: {currentScenario?.id ?? scenarioId ?? "Unknown"}</div>
            <div>Scenario: {currentScenario?.title ?? "Untitled"}</div>
          </div>
        </details>
      </div>
      </section>
    );
  }, [adventureId, currentScenario, history, scenarioId]);

  function renderHistoryRow(entry: HistoryEntry) {
    const isActive = entry.adventureId === currentId;
    return (
      <HistorySlotCard
        key={entry.adventureId}
        adventureId={entry.adventureId}
        resumeHref={`/play?adventureId=${encodeURIComponent(entry.adventureId)}`}
        scenarioTitle={isActive ? currentScenario?.title : entry.scenarioId}
        scenarioSummary={isActive ? currentScenario?.summary : null}
        scenarioId={entry.scenarioId}
        updatedAtLabel={formatPlayTimestamp(entry.timestamp)}
        isActive={isActive}
        isPinned={Boolean(entry.pinned)}
        onPinToggle={() => handleTogglePin(entry.adventureId)}
        onRemove={() => handleRemoveEntry(entry.adventureId)}
        onCopyId={() => copyToClipboard(entry.adventureId)}
      />
    );
  }

  const slotsPanel = (adventureId || history.length > 0) ? (
    <section className="rounded-xl border border-slate-200 bg-white p-5 text-xs shadow-sm">
      <div className="mb-4 flex items-center justify-between text-sm">
        <div>
          <span className="font-semibold text-slate-900">Adventure slots</span>
          <p className="mt-1 text-[11px] text-slate-500">Keep the active session visible and park important runs in pinned slots.</p>
        </div>
        <button
          type="button"
          onClick={handleClearHistory}
          disabled={history.length === 0}
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear history
        </button>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current adventure
          </div>
          {currentEntry ? (
            renderHistoryRow(currentEntry)
          ) : adventureId ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800">
              <div className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 inline-flex">
                Current
              </div>
              <div className="mt-1">Scenario: {currentScenario?.title ?? "Unknown scenario"}</div>
              <div className="mt-1">ID: {adventureId}</div>
              <div className="mt-1">Scenario ID: {currentScenario?.id ?? scenarioId ?? "Unknown scenario"}</div>
              {currentScenario?.summary ? <div className="mt-1 text-blue-700">{currentScenario.summary}</div> : null}
              <div className="mt-2 text-blue-700">Opened directly from a shared or external play link.</div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
              No active adventure yet. Launch one from the creator or resume a recent run.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Pinned adventures</div>
          {pinnedEntries.length > 0 ? (
            pinnedEntries.map((entry) => renderHistoryRow(entry))
          ) : (
            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-3 text-[11px] text-slate-500">
              No pinned adventures yet. Pin a run to keep it at the top.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recent adventures</div>
          {recentEntries.length > 0 ? (
            recentEntries.map((entry) => renderHistoryRow(entry))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
              No recent adventures yet. Open or launch a session to start building a history.
            </div>
          )}
        </div>
      </div>
    </section>
  ) : null;

  return (
    <main className={`${ui.shell} ${ambienceClass} ${pressureEdge} relative overflow-hidden`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,163,90,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(92,63,31,0.1),transparent_28%)]" />
      <div className={ui.pageWrap}>
        <div className={ui.playSurface}>
          <TopBar />

          {dbOffline ? (
            <div className="chronicle-card mt-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-inner">
              <p className="font-semibold text-amber-100">Database connection unavailable</p>
              <p className="mt-1 text-sm text-amber-100/80">
                Chronicle AI could not reach the database, so the play screen is showing cached UI state only.
              </p>
            </div>
          ) : null}

          <div className={ui.pageGrid}>
          <section className={ui.leftColumn}>
            {adventureId ? <TurnInput adventureId={adventureId} /> : null}

            <LatestTurnCard key={latestDisplayTurn?.id ?? "latest"} model={latestTurnModel} />
            {recentTurnRows.length > 0 ? <RecentTurnsPanel rows={recentTurnRows} /> : null}
          </section>

            <aside className={ui.rightColumn}>
              <PressureMeter currentStage={displayPressureStage} />
              <WorldContext
                location={statePanel.location ?? "Servants’ Wing"}
                timeOfDay={statePanel.timeOfDay ?? "Late Night"}
                ambience={statePanel.ambience ?? "Cold / Quiet"}
                tags={statePanel.contextTags ?? []}
              />
              <LedgerPanel entries={latestDisplayTurn ? formatLedgerDisplay(latestDisplayTurn.ledgerAdds ?? []) : []} />
              <StatePanel viewModel={statePanelViewModel} />
            </aside>
          </div>
        </div>

        <details className="mt-8 rounded-2xl border border-slate-200 bg-slate-950/60 p-4 text-xs text-slate-300">
          <summary className="font-semibold uppercase tracking-[0.3em] text-slate-400">Adventure tools</summary>
          <div className="mt-4 space-y-4">
            {hero}
            {slotsPanel}
          </div>
        </details>

        <details className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/5 p-4 text-sm text-slate-400">
          <summary className="cursor-pointer font-semibold">Developer tools</summary>
          <div className="mt-3 text-sm text-slate-600">
            {adventureId
              ? "Adventure ready. Use the form above to run turns in the browser."
              : "Paste ?adventureId=... into the URL bar to resume, click Play from the creator to launch a new adventure, and the grid below will show turn results."}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            <p className="font-semibold">Turn example</p>
            <pre className="mt-2 w-full overflow-x-auto rounded bg-black px-3 py-2 text-[11px] text-gray-100">
{`curl -s -X POST http://localhost:3000/api/turn   -H 'Content-Type: application/json'   -d '{"adventureId":"adv_123","playerText":"Sneak past the guard","action":"STEALTH","tags":[],"rollTotal":7}' | jq`}
            </pre>
            <p className="mt-3 text-[11px] text-slate-500">
              The browser form sends the same shape: <code>adventureId</code>, <code>playerText</code>, optional <code>action</code>, <code>tags</code>, and optional <code>rollTotal</code>.
            </p>
          </div>
        </details>
      </div>
    </main>
  );

}
