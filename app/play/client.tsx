"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AdventureHistoryRow from "@/components/play/AdventureHistoryRow";
import HistorySlotCard from "@/components/play/HistorySlotCard";
import { formatPlayTimestamp } from "~/components/play/formatTimestamp";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import PressureMeter from "@/components/play/PressureMeter";
import StatePanel from "@/components/play/StatePanel";
import { SceneImagePanel } from "@/components/play/SceneImagePanel";
import {
  AdventureHistoryRowViewModel,
  buildAdventureHistoryRowViewModel,
  buildLatestTurnViewModel,
  buildStatePanelViewModel,
  formatLedgerDisplay,
} from "@/components/play/presenters";
import WorldContext from "@/components/play/WorldContext";
import LedgerPanel from "@/components/play/LedgerPanel";
import { cardPadding, cardShell, emptyState, sectionHeading } from "@/components/play/cardStyles";
import { ui } from "@/lib/ui/classes";
import type { PlayScenarioMeta, PlayStatePanel, PlayTurn } from "./types";
import type { ResolvedSceneImage } from "@/lib/sceneArt";
import type { SceneVisualState } from "@/lib/resolveSceneVisualState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneContinuityState } from "@/lib/sceneContinuity";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import { resolveSceneContinuityState } from "@/lib/sceneContinuity";
import TurnInput from "@/components/play/TurnInput";

const SCENE_TRANSITION_KEY = "chronicle:sceneTransition";

export function deriveSceneTransitionCue(transition: SceneTransition | null): string | null {
  if (!transition) return null;
  if (transition.type === "advance") {
    if (transition.shouldEscalateCamera) return "Camera Push-In";
    if (!transition.focusHeld) return "Focus Shift";
  }
  return null;
}

function pressureBadgeTone(stage: string | null | undefined) {
  const normalized = typeof stage === "string" ? stage.toLowerCase() : "calm";
  if (normalized === "crisis") return "border-red-300 bg-red-50 text-red-800";
  if (normalized === "danger") return "border-orange-300 bg-orange-50 text-orange-800";
  if (normalized === "tension") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

const pressureStatKeys = ["alert", "heat", "noise", "time"] as const;
type PressureStatKey = (typeof pressureStatKeys)[number];

type PressureSnapshot = {
  stage: string;
  alert: string;
  heat: string;
  noise: string;
  time: string;
};

const formatPressureValue = (value: unknown) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

function findPressureStatValue(stats: PlayStatePanel["stats"], key: PressureStatKey) {
  const normalizedKey = key.toLowerCase();
  const entry = stats.find((stat) => stat.key.toLowerCase() === normalizedKey);
  return formatPressureValue(entry?.value);
}

function buildPressureSnapshot(stage: string, stats: PlayStatePanel["stats"]): PressureSnapshot {
  return {
    stage,
    alert: findPressureStatValue(stats, "alert"),
    heat: findPressureStatValue(stats, "heat"),
    noise: findPressureStatValue(stats, "noise"),
    time: findPressureStatValue(stats, "time"),
  };
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
  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>Resolution Log</div>
      {rows.length === 0 ? (
        <div className={emptyState}>No resolution entries recorded yet.</div>
      ) : (
        <div className="space-y-0">
          {rows.map((row) => (
            <AdventureHistoryRow key={`${row.turnIndex}-${row.timestampLabel}`} model={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function VisualStatePanel({
  sceneVisualState,
  framingState,
  subjectState,
  sceneActorState,
  sceneFocusState,
  sceneTransition,
}: {
  sceneVisualState: SceneVisualState;
  framingState: SceneFramingState;
  subjectState: SceneSubjectState;
  sceneActorState: SceneActorState;
  sceneFocusState: SceneFocusState;
  sceneTransition?: SceneTransition | null;
}) {
  const details = [
    { label: "Lighting", value: sceneVisualState.lightingState },
    { label: "Atmosphere", value: sceneVisualState.atmosphereState },
    { label: "Wear", value: sceneVisualState.environmentWear },
    { label: "Threat", value: sceneVisualState.threatPresence },
  ];
  const framingDetails = [
    { label: "Frame", value: framingState.frameKind.replace(/_/g, " ") },
    { label: "Shot", value: framingState.shotScale },
    { label: "Focus", value: framingState.subjectFocus },
    { label: "Angle", value: framingState.cameraAngle },
  ];
  const subjectLabel = subjectState.primarySubjectLabel ?? subjectState.primarySubjectKind;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Visual State</div>
      <div className="mt-2 space-y-1">
        {details.map((detail) => (
          <div key={detail.label} className="flex justify-between text-xs text-white/60">
            <span>{detail.label}</span>
            <span className="font-semibold text-white">{detail.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.35em] text-white/60">
        <span className="rounded-full border border-white/20 px-2 py-0.5">{sceneVisualState.locationId}</span>
        <span className="rounded-full border border-white/20 px-2 py-0.5">{sceneVisualState.timeValue}</span>
        <span className="rounded-full border border-white/20 px-2 py-0.5">{sceneVisualState.pressureStage}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
        {framingDetails.map((detail) => (
          <div key={detail.label} className="rounded-full border border-white/10 px-2 py-1 text-center text-xs">
            {detail.label}: {detail.value}
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-[0.3em] text-white/60">
        <div className="text-xs text-white/40">Subject kind</div>
        <div className="text-sm font-semibold text-white">{subjectState.primarySubjectKind}</div>
        <div className="text-xs text-white/40">Subject</div>
        <div className="text-sm font-semibold text-white">
          {subjectState.primarySubjectLabel ?? "(unknown)"}
        </div>
        <div className="text-xs text-white/40">Actor role</div>
        <div className="text-sm font-semibold text-white">
          {sceneActorState.primaryActorRole ?? "none"}
        </div>
        <div className="text-xs text-white/40">Actor</div>
        <div className="text-sm font-semibold text-white">
          {sceneActorState.primaryActorLabel ?? "(none visible)"}
        </div>
        <div className="text-xs text-white/40">Visible</div>
        <div className="text-sm font-semibold text-white">
          {sceneActorState.actorVisible ? "yes" : "no"}
        </div>
      </div>
      {sceneTransition ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            <span>Scene transition</span>
            <span className="text-xs uppercase tracking-[0.35em] text-white/40">{sceneTransition.type}</span>
          </div>
          <div className="mt-1 text-[10px] text-white/40">
            framing {sceneTransition.preserveFraming ? "preserved" : "reset"} · subject {sceneTransition.preserveSubject ? "preserved" : "reset"} · actor {sceneTransition.preserveActor ? "preserved" : "reset"} · focus {sceneTransition.preserveFocus ? "held" : "shifted"}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
        <div className="text-xs uppercase tracking-[0.3em] text-white/60">Focus</div>
        <div className="mt-1 text-xs text-white/40">Type: {sceneFocusState.focusType}</div>
        <div className="text-sm font-semibold text-white">{sceneFocusState.focusLabel ?? "(none)"}</div>
      </div>
    </div>
  );
}
function TopBar() {
  return (
    <header className={ui.topBar}>
      <div className="min-w-0 space-y-2">
        <div className={ui.sectionLabel}>Chronicle AI</div>
        <h1 className="text-3xl font-serif font-semibold text-[#f3efe6]">The Ashen Estate</h1>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-[#a59e90]">
          <span>Servants’ Wing</span>
          <span>•</span>
          <span>Late Night</span>
          <span>•</span>
          <span>Turn 14</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-amber-200">
          TENSION
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
  sceneImage,
  sceneImageCaption,
  sceneFocusState,
  sceneVisualState,
  sceneFramingState,
  sceneSubjectState,
  sceneActorState,
  sceneTransition = null,
  sceneRefreshDecision,
}: {
  adventureId: string | null;
  scenarioId: string | null;
  turns: PlayTurn[];
  statePanel: PlayStatePanel;
  currentScenario: PlayScenarioMeta | null;
  dbOffline?: boolean;
  sceneImage?: ResolvedSceneImage | null;
  sceneImageCaption?: string | null;
  sceneVisualState: SceneVisualState;
  sceneFramingState: SceneFramingState;
  sceneSubjectState: SceneSubjectState;
  sceneActorState: SceneActorState;
  sceneFocusState: SceneFocusState;
  sceneTransition?: SceneTransition | null;
  sceneRefreshDecision?: SceneRefreshDecision | null;
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
  const [liveSceneTransition, setLiveSceneTransition] = useState<SceneTransition | null>(sceneTransition ?? null);
  useEffect(() => {
    setLiveSceneTransition(sceneTransition ?? null);
  }, [sceneTransition]);
  const currentId = adventureId;
  const sortHistory = (entries: HistoryEntry[]) =>
    [...entries].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return b.timestamp - a.timestamp;
    });
  const limitHistory = (entries: HistoryEntry[]) => sortHistory(entries).slice(0, MAX_HISTORY);
  const previousSceneImageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(SCENE_TRANSITION_KEY);
    if (!stored) return;
    try {
      setLiveSceneTransition(JSON.parse(stored) as SceneTransition);
    } catch {
      // ignore invalid data
    }
    window.sessionStorage.removeItem(SCENE_TRANSITION_KEY);
  }, []);
  useEffect(() => {
    if (sceneImage?.source === "scene" && sceneImage.imageUrl) {
      previousSceneImageUrlRef.current = sceneImage.imageUrl;
    }
  }, [sceneImage?.source, sceneImage?.imageUrl]);

  const continuityState = useMemo(
    () =>
      resolveSceneContinuityState({
        refreshDecision: sceneRefreshDecision ?? null,
        transition: liveSceneTransition,
        currentImageUrl: sceneImage?.imageUrl ?? null,
        previousImageUrl: previousSceneImageUrlRef.current,
        isPending: Boolean(sceneImage?.pending),
      }),
    [sceneRefreshDecision, liveSceneTransition, sceneImage?.imageUrl, sceneImage?.pending]
  );
  const displayedSceneImageCaption = sceneImageCaption && continuityState.shouldShowCaption ? sceneImageCaption : null;
  const sceneTransitionCue = useMemo(() => deriveSceneTransitionCue(liveSceneTransition), [liveSceneTransition]);
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
    if (adventureId === null && typeof window !== "undefined") {
      window.localStorage.removeItem(HISTORY_KEY);
    }
  }, [adventureId]);

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

  const handleSceneTransitionUpdate = (transition: SceneTransition | null) => {
    setLiveSceneTransition(transition);
    if (typeof window === "undefined") return;
    if (transition) {
      window.sessionStorage.setItem(SCENE_TRANSITION_KEY, JSON.stringify(transition));
    } else {
      window.sessionStorage.removeItem(SCENE_TRANSITION_KEY);
    }
  };

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
  const pressureSnapshot = useMemo(
    () => buildPressureSnapshot(displayPressureStage, statePanel.stats),
    [displayPressureStage, statePanel.stats]
  );
  const [highlightLatestTurn, setHighlightLatestTurn] = useState(false);
  const [showTurnDivider, setShowTurnDivider] = useState(false);
  const [isPressurePulsing, setIsPressurePulsing] = useState(false);
  const latestTurnRef = useRef<HTMLDivElement | null>(null);
  const prevLatestTurnIndexRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnDividerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressurePulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPressureSnapshotRef = useRef<PressureSnapshot | null>(null);
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
  useEffect(() => {
    if (!hasTurns) {
      prevLatestTurnIndexRef.current = null;
      return;
    }
    const currentIndex = latestDisplayTurn?.turnIndex ?? null;
    const prevIndex = prevLatestTurnIndexRef.current;
    if (currentIndex !== null && prevIndex !== null && currentIndex > prevIndex) {
      setHighlightLatestTurn(true);
      setShowTurnDivider(true);
      latestTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightLatestTurn(false);
        highlightTimeoutRef.current = null;
      }, 600);
      if (turnDividerTimeoutRef.current) {
        clearTimeout(turnDividerTimeoutRef.current);
      }
      turnDividerTimeoutRef.current = setTimeout(() => {
        setShowTurnDivider(false);
        turnDividerTimeoutRef.current = null;
      }, 1200);
    }
    prevLatestTurnIndexRef.current = currentIndex;
  }, [latestDisplayTurn?.turnIndex, hasTurns]);

  useEffect(() => {
    const prevSnapshot = prevPressureSnapshotRef.current;
    if (prevSnapshot) {
      const statsChanged = pressureStatKeys.some((key) => prevSnapshot[key] !== pressureSnapshot[key]);
      if (prevSnapshot.stage !== pressureSnapshot.stage || statsChanged) {
        setIsPressurePulsing(true);
        if (pressurePulseTimeoutRef.current) {
          clearTimeout(pressurePulseTimeoutRef.current);
        }
        pressurePulseTimeoutRef.current = setTimeout(() => {
          setIsPressurePulsing(false);
          pressurePulseTimeoutRef.current = null;
        }, 450);
      }
    }
    prevPressureSnapshotRef.current = pressureSnapshot;
  }, [pressureSnapshot]);
  useEffect(() => () => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
  }, []);
  useEffect(() => () => {
    if (pressurePulseTimeoutRef.current) {
      clearTimeout(pressurePulseTimeoutRef.current);
      pressurePulseTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => () => {
    if (turnDividerTimeoutRef.current) {
      clearTimeout(turnDividerTimeoutRef.current);
      turnDividerTimeoutRef.current = null;
    }
  }, []);

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
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-[11px] uppercase tracking-[0.3em] text-white/70">
            <span className="text-emerald-300">{displayPressureStage?.toUpperCase() ?? "CALM"}</span>
            <span className="text-white/40">•</span>
            <span>
              Alert {statePanel.stats.find((stat) => stat.key.toLowerCase() === "alert")?.value ?? "—"}
            </span>
            <span className="text-white/40">•</span>
            <span>
              Heat {statePanel.stats.find((stat) => stat.key.toLowerCase() === "heat")?.value ?? "—"}
            </span>
            <span className="text-white/40">•</span>
            <span>
              Time {statePanel.stats.find((stat) => stat.key.toLowerCase() === "time")?.value ?? "—"}
            </span>
          </div>

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
              {showTurnDivider && latestDisplayTurn ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.5em] text-amber-300">
                  <span className="block rounded-full border border-amber-400/40 bg-black/40 px-4 py-2 text-center text-xs">
                    ─── TURN {latestDisplayTurn.turnIndex} RESOLVED ───
                  </span>
                </div>
              ) : null}
              <div ref={latestTurnRef}>
                <LatestTurnCard
                  key={latestDisplayTurn?.id ?? "latest"}
                  model={latestTurnModel}
                  isHighlighted={highlightLatestTurn}
                />
              </div>
              <div className="mt-4">
                <SceneImagePanel
                  {...
                    sceneImage ?? {
                      imageUrl: "/default-scene.svg",
                      source: "default",
                      pending: false,
                    }
                  }
                  caption={displayedSceneImageCaption ?? undefined}
                  transition={liveSceneTransition}
                  continuity={continuityState}
                  transitionCue={sceneTransitionCue}
                />
              </div>
              {adventureId ? <TurnInput adventureId={adventureId} onSceneTransition={handleSceneTransitionUpdate} /> : null}
          </section>

            <aside className={ui.rightColumn}>
              <div className="space-y-6">
                <section className="space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">World</div>
                  <WorldContext
                    location={statePanel.location ?? "Servants’ Wing"}
                    timeOfDay={statePanel.timeOfDay ?? "Late Night"}
                    ambience={statePanel.ambience ?? "Cold / Quiet"}
                    tags={statePanel.contextTags ?? []}
                  />
                  <VisualStatePanel
                    sceneVisualState={sceneVisualState}
                    framingState={sceneFramingState}
                    subjectState={sceneSubjectState}
                    sceneActorState={sceneActorState}
                    sceneFocusState={sceneFocusState}
                    sceneTransition={liveSceneTransition}
                  />
                  <StatePanel viewModel={statePanelViewModel} />
                </section>
                <section className="space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">System</div>
                  <PressureMeter currentStage={displayPressureStage} isPulsing={isPressurePulsing} />
                  <LedgerPanel entries={latestDisplayTurn ? formatLedgerDisplay(latestDisplayTurn.ledgerAdds ?? []) : []} />
                </section>
                <section className="space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">History</div>
                  <RecentTurnsPanel rows={recentTurnRows} />
                </section>
              </div>
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
