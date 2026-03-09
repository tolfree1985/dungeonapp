"use client";
import { useEffect, useMemo, useState } from "react";
import AdventureHistoryRow from "@/components/play/AdventureHistoryRow";
import { formatPlayTimestamp } from "@/components/play/formatTimestamp";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import StatePanel from "@/components/play/StatePanel";
import TurnInput from "@/components/play/TurnInput";
import type { PlayScenarioMeta, PlayStatePanel, PlayTurn } from "./types";

function pressureBadgeTone(stage: string | null | undefined) {
  const normalized = typeof stage === "string" ? stage.toLowerCase() : "calm";
  if (normalized === "crisis") return "border-red-300 bg-red-50 text-red-800";
  if (normalized === "danger") return "border-orange-300 bg-orange-50 text-orange-800";
  if (normalized === "tension") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export default function PlayClient({
  adventureId,
  scenarioId,
  turns,
  statePanel,
  currentScenario,
}: {
  adventureId: string | null;
  scenarioId: string | null;
  turns: PlayTurn[];
  statePanel: PlayStatePanel;
  currentScenario: PlayScenarioMeta | null;
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
        <div className="mt-2 space-y-2 text-sm text-slate-700">
          <div className="flex flex-wrap gap-3">
            <span>
              ID: <strong>{adventureId}</strong>
            </span>
            <span>
              Scenario source: <strong>{currentScenario?.title ?? "Unknown scenario"}</strong>
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Scenario ID: {currentScenario?.id ?? scenarioId ?? "Unknown scenario"}</span>
            {currentScenario?.summary ? <span>{currentScenario.summary}</span> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`/play?adventureId=${encodeURIComponent(adventureId)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Open adventure
          </a>
          <a
            href={`/api/turn?adventureId=${encodeURIComponent(adventureId)}`}
            className="rounded-full border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
          >
            Inspect turns
          </a>
          <a
            href="/"
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Back to creator
          </a>
          {linkedScenarioId ? (
            <a
              href={`/creator?scenarioId=${encodeURIComponent(linkedScenarioId)}`}
              className="rounded-full border border-amber-500 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              Open scenario in creator
            </a>
          ) : null}
          {currentEntry ? (
            <button
              type="button"
              onClick={() => handleTogglePin(currentEntry.adventureId)}
              className="rounded-full border border-amber-500 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              {currentEntry.pinned ? "Unpin adventure" : "Pin adventure"}
            </button>
          ) : null}
        </div>
      </section>
    );
  }, [adventureId, currentScenario, history, scenarioId]);

  function renderHistoryRow(entry: HistoryEntry) {
    const isActive = entry.adventureId === currentId;
    return (
      <AdventureHistoryRow
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

  return (
    <>
      {hero}
      {adventureId || history.length > 0 ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-xs shadow-sm">
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
      ) : null}
      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div>
          {latestTurn ? (
            <section className="space-y-4">
              <LatestTurnCard turn={latestTurn} pressureStage={pressureStage} />
              {previousTurns.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Turn history</div>
                  {previousTurns.map((turn) => (
                    <div
                      key={turn.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>Turn {turn.turnIndex}</span>
                        <span>{new Date(turn.createdAt).toISOString()}</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-blue-700">{turn.playerInput}</div>
                      <div className="mt-2 text-[11px] text-slate-800">Scene: {turn.scene}</div>
                      <div className="mt-1 text-[11px] text-slate-800">Resolution: {turn.resolution}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-xs text-slate-600">
              <div className="text-sm font-semibold text-slate-800">No turns yet</div>
              <p className="mt-2">Run the first turn to unlock the live scene, resolution, state changes, and ledger history.</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Use the command/input block below, or launch from the creator and return here once the session has moved.
              </p>
            </section>
          )}
        </div>
        <StatePanel state={statePanel} />
      </section>
      {adventureId ? (
        <section className="mt-6">
          <TurnInput adventureId={adventureId} />
        </section>
      ) : null}
      <section className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <div className="text-sm text-slate-600">
          {adventureId
            ? "Adventure ready. Use the form above to run turns in the browser. The cURL below matches the same API contract if you need a debug repro."
            : "Paste ?adventureId=... into the URL bar to resume, click Play from the creator to launch a new adventure, and the grid below will show turn results."}
        </div>
        <div className="mt-4 text-xs text-slate-800">
          <p className="font-semibold">Turn example</p>
          <pre className="mt-2 w-full overflow-x-auto rounded bg-black px-3 py-2 text-[11px] text-gray-100">
{`curl -s -X POST http://localhost:3000/api/turn \
  -H 'Content-Type: application/json' \
  -d '{"adventureId":"adv_123","playerText":"Sneak past the guard","action":"STEALTH","tags":[],"rollTotal":7}' | jq`}
          </pre>
          <p className="mt-3 text-[11px] text-slate-500">
            The browser form sends the same shape: <code>adventureId</code>, <code>playerText</code>, optional <code>action</code>, <code>tags</code>, and optional <code>rollTotal</code>.
          </p>
        </div>
      </section>
    </>
  );
}
