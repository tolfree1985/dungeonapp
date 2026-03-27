"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AdventureHistoryRow from "@/components/play/AdventureHistoryRow";
import HistorySlotCard from "@/components/play/HistorySlotCard";
import { formatPlayTimestamp } from "~/components/play/formatTimestamp";
import LatestTurnCard from "@/components/play/LatestTurnCard";
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
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import type { SceneContinuityState } from "@/lib/sceneContinuity";
import type { SceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import { resolveSceneContinuityState } from "@/lib/sceneContinuity";
import TurnInput from "@/components/play/TurnInput";
import type { SceneArtStatus, SceneArtStatusResponse } from "@/lib/sceneArtStatus";
import type { TurnApiResponse, TurnInputPayload } from "@/lib/turnApi";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import { useRouter } from "next/navigation";
import { resolveCanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";

const SCENE_TRANSITION_KEY = "chronicle:sceneTransition";

export function deriveSceneTransitionCue(transition: SceneTransition | null): string | null {
  if (!transition) return null;
  if (transition.type === "advance") {
    if (transition.shouldEscalateCamera) return "Camera Push-In";
    if (!transition.focusHeld) return "Focus Shift";
  }
  return null;
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
        <div className="space-y-4">
          {rows.map((row) => (
            <AdventureHistoryRow key={`${row.turnIndex}-${row.timestampLabel}`} model={row} />
          ))}
        </div>
      )}
    </section>
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

export type PlayClientProps = {
  adventureId: string | null;
  scenarioId: string | null;
  turns: PlayTurn[];
  statePanel: PlayStatePanel;
  currentScenario: PlayScenarioMeta | null;
  dbOffline?: boolean;
  sceneImage?: ResolvedSceneImage | null;
  sceneImageCaption?: string | null;
  sceneFramingState: SceneFramingState;
  sceneSubjectState: SceneSubjectState;
  sceneActorState: SceneActorState;
  sceneFocusState: SceneFocusState;
  sceneTransition?: SceneTransition | null;
  sceneRefreshDecision?: SceneRefreshDecision | null;
  sceneContinuity?: SceneContinuityInfo | null;
  sceneKey: string | null;
  sceneText: string | null;
  sceneStylePreset?: string | null;
  sceneRenderMode?: "full" | "preview";
};

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
  sceneFramingState,
  sceneSubjectState,
  sceneActorState,
  sceneTransition = null,
  sceneRefreshDecision,
  sceneContinuity = null,
  sceneKey,
  sceneText,
  sceneStylePreset,
  sceneRenderMode = "full",
}: PlayClientProps) {
  const [liveSceneArt, setLiveSceneArt] = useState<ResolvedSceneImage | null>(sceneImage ?? null);
  const router = useRouter();
  const [liveSceneTransition, setLiveSceneTransition] = useState<SceneTransition | null>(sceneTransition ?? null);
  const [liveSceneContinuity, setLiveSceneContinuity] = useState<SceneContinuityInfo | null>(sceneContinuity ?? null);
  const formatSceneKey = (value: string | null | undefined) =>
    value ? `${value.slice(0, 8)}…` : "—";
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const HISTORY_KEY = "creator:recentAdventures";
  type HistoryEntry = {
    adventureId: string;
    scenarioId?: string | null;
    timestamp: number;
    pinned?: boolean;
  };
  const MAX_HISTORY = 6;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    setLiveSceneTransition(sceneTransition ?? null);
  }, [sceneTransition]);
  useEffect(() => {
    setLiveSceneArt(sceneImage ?? null);
  }, [sceneImage]);
  useEffect(() => {
    if (liveSceneArt?.sceneArtStatus !== "generating") return;
    const timer = setTimeout(() => {
      router.refresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [liveSceneArt?.sceneArtStatus, router]);
  useEffect(() => {
    setLiveSceneContinuity(sceneContinuity ?? null);
  }, [sceneContinuity]);
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
    if (liveSceneArt?.source === "scene" && liveSceneArt.imageUrl) {
      previousSceneImageUrlRef.current = liveSceneArt.imageUrl;
    }
  }, [liveSceneArt?.source, liveSceneArt?.imageUrl]);

  const continuityState = useMemo(
    () =>
      resolveSceneContinuityState({
        refreshDecision: sceneRefreshDecision ?? null,
        transition: liveSceneTransition,
        currentImageUrl: liveSceneArt?.imageUrl ?? null,
        previousImageUrl: previousSceneImageUrlRef.current,
        isPending: Boolean(liveSceneArt?.pending),
      }),
    [sceneRefreshDecision, liveSceneTransition, liveSceneArt?.imageUrl, liveSceneArt?.pending]
  );
  const displayedSceneImageCaption = sceneImageCaption && continuityState.shouldShowCaption ? sceneImageCaption : null;
  const sceneTransitionCue = useMemo(() => deriveSceneTransitionCue(liveSceneTransition), [liveSceneTransition]);
  const lastLoggedStatusRef = useRef<SceneArtStatus | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const sceneKey = liveSceneArt?.sceneKey;
    const promptHash = liveSceneArt?.promptHash ?? null;
    const currentStatus = liveSceneArt?.status ?? "missing";
    if (sceneKey !== lastSceneKeyRef.current) {
      lastSceneKeyRef.current = sceneKey;
      lastLoggedStatusRef.current = null;
    }

    if (!sceneKey || !promptHash) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const pollingStartedAt = Date.now();
    const getPollingInterval = (elapsed: number) => {
      if (elapsed < 5000) return 1000;
      if (elapsed < 15000) return 2000;
      if (elapsed < 30000) return 4000;
      return null;
    };
    const fallbackImageUrl = liveSceneArt?.imageUrl ?? null;
    const fallbackSource = liveSceneArt?.source === "scene" ? "default" : liveSceneArt?.source ?? "default";
    const logSceneArtStatus = (nextStatus: SceneArtStatus) => {
      if (lastLoggedStatusRef.current === nextStatus) return;
      const payload: { sceneKey: string; status: SceneArtStatus; transition?: string } = {
        sceneKey,
        status: nextStatus,
      };
      if (lastLoggedStatusRef.current === "queued" && nextStatus !== "queued") {
        payload.transition = `queued->${nextStatus}`;
        console.info("[scene-art] transition", payload);
      } else {
        console.info("[scene-art] status", payload);
      }
      lastLoggedStatusRef.current = nextStatus;
    };

    if (currentStatus !== "queued") {
      logSceneArtStatus(currentStatus);
      return;
    }

    logSceneArtStatus("queued");

    const stopPolling = () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled) return;
      const elapsed = Date.now() - pollingStartedAt;
      const interval = getPollingInterval(elapsed);
      if (interval === null) {
        stopPolling();
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        pollSceneArt();
      }, interval);
    };

    const handleFailure = (nextStatus: SceneArtStatus) => {
      logSceneArtStatus(nextStatus);
      setLiveSceneArt({
        imageUrl: fallbackImageUrl,
        source: fallbackSource,
        pending: false,
        sceneKey,
        status: nextStatus,
      });
      stopPolling();
    };

    const logAndSetReady = (nextStatus: SceneArtStatus, imageUrl: string | null) => {
      logSceneArtStatus(nextStatus);
      setLiveSceneArt({
        imageUrl,
        source: imageUrl ? "scene" : fallbackSource,
        pending: false,
        sceneKey,
        status: nextStatus,
      });
      stopPolling();
    };

    const pollSceneArt = async () => {
      const elapsed = Date.now() - pollingStartedAt;
      if (elapsed > 30000) {
        stopPolling();
        return;
      }
      try {
        const params = new URLSearchParams({
          sceneKey,
          promptHash,
        });
        const response = await fetch(`/api/scene-art?${params.toString()}`);
        if (cancelled) return;
        if (!response.ok) {
          handleFailure("missing");
          return;
        }
        const payload = (await response.json()) as SceneArtStatusResponse;
        if (cancelled) return;
        const identity = resolveCanonicalSceneIdentity(payload.sceneArt);
        const sceneArt = payload.sceneArt
          ? {
              ...payload.sceneArt,
              sceneKey: identity.sceneKey ?? payload.sceneArt.sceneKey,
              promptHash: identity.promptHash ?? payload.sceneArt.promptHash ?? null,
            }
          : null;
        console.log("scene.art.client.poll_result", {
          sceneKey: sceneArt?.sceneKey ?? null,
          promptHash: sceneArt?.promptHash ?? null,
          status: sceneArt?.status ?? null,
          imageUrl: sceneArt?.imageUrl ?? null,
        });
        if (!sceneArt) {
          handleFailure("missing");
          return;
        }
        if (sceneArt.sceneKey !== sceneKey) {
          stopPolling();
          return;
        }

        const resolvedImageUrl = sceneArt.imageUrl ?? null;
        const sceneArtStatus = sceneArt.status ?? "missing";
        const isSceneArtRendering = sceneArtStatus === "queued" || sceneArtStatus === "generating";
        const isSceneArtReady =
          sceneArtStatus === "ready" &&
          !!resolvedImageUrl &&
          !resolvedImageUrl.includes("generated-placeholder");
        const isSceneArtFailed = sceneArtStatus === "failed";
        const resolvedBackdropUrl = isSceneArtReady ? resolvedImageUrl : null;

        if (isSceneArtReady && resolvedBackdropUrl) {
          logAndSetReady("ready", resolvedBackdropUrl);
          return;
        }
        if (isSceneArtFailed) {
          handleFailure(sceneArtStatus);
          return;
        }

        const normalizedSceneArt = {
          ...sceneArt,
        };
        setLiveSceneArt((prev) => {
          if (cancelled) return prev;
          if (
            prev?.imageUrl === (sceneArt.imageUrl ?? fallbackImageUrl) &&
            prev?.pending &&
            prev?.status === "queued" &&
            prev?.sceneKey === sceneKey
          ) {
            return prev;
          }
          return {
            ...normalizedSceneArt,
            imageUrl: sceneArt.imageUrl ?? fallbackImageUrl,
            source: "scene",
            pending: true,
            sceneKey,
            status: "queued",
            promptHash: normalizedSceneArt.promptHash ?? null,
          };
        });
        logSceneArtStatus("queued");
        scheduleNextPoll();
      } catch {
        if (!cancelled) {
          handleFailure("missing");
        }
      }
    };

    logSceneArtStatus("queued");
    pollSceneArt();
    return () => stopPolling();
  }, [liveSceneArt?.sceneKey, liveSceneArt?.status]);
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

  const handleSubmitTurn = async (input: TurnInputPayload): Promise<boolean> => {
    if (!adventureId) {
      setTurnError("Adventure not selected.");
      return false;
    }

    if (isSubmittingTurn) {
      return false;
    }

    setIsSubmittingTurn(true);
    setTurnError(null);

    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adventureId, mode: input.mode, playerText: input.playerText }),
      });

      const payload = (await response.json().catch(() => null)) as TurnApiResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && typeof payload.error === "string"
            ? payload.error
            : "Internal error"
        );
      }

      const result = (payload ?? {}) as TurnApiResponse;
      handleSceneTransitionUpdate(result.sceneTransition ?? null);

      if (result.sceneArt) {
        if (!result.sceneArt.sceneKey || !result.sceneArt.promptHash) {
          console.error("scene.art.client.identity_missing_after_turn", result.sceneArt);
        } else {
          setLiveSceneArt({
            imageUrl: result.sceneArt.imageUrl,
            source: "scene",
            pending: !result.sceneArt.hasReadyImage,
            sceneKey: result.sceneArt.sceneKey,
            status: result.sceneArt.status,
            promptHash: result.sceneArt.promptHash,
            hasReadyImage: result.sceneArt.hasReadyImage,
          });
        }
      }
      setLiveSceneContinuity(result.sceneContinuity ?? null);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error submitting turn.";
      setTurnError(message);
      return false;
    } finally {
      setIsSubmittingTurn(false);
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
  const [highlightLatestTurn, setHighlightLatestTurn] = useState(false);
  const [showTurnDivider, setShowTurnDivider] = useState(false);
  const latestTurnRef = useRef<HTMLDivElement | null>(null);
  const prevLatestTurnIndexRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnDividerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const liveStatus = liveSceneArt?.status ?? "missing";
  const hasReadyImage =
    liveStatus === "ready" &&
    !!liveSceneArt?.imageUrl &&
    !liveSceneArt.imageUrl.includes("generated-placeholder");
  const resolvedBackdropUrl = hasReadyImage ? liveSceneArt?.imageUrl ?? null : null;

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

  useEffect(() => () => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
  }, []);
  useEffect(() => () => {
    if (turnDividerTimeoutRef.current) {
      clearTimeout(turnDividerTimeoutRef.current);
      turnDividerTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => () => {
    if (turnDividerTimeoutRef.current) {
      clearTimeout(turnDividerTimeoutRef.current);
      turnDividerTimeoutRef.current = null;
    }
  }, []);

  console.log("scene.art.client.render_state", {
    liveStatus,
    sceneKey: liveSceneArt?.sceneKey ?? null,
    promptHash: liveSceneArt?.promptHash ?? null,
    imageUrl: liveSceneArt?.imageUrl ?? null,
    resolvedBackdropUrl,
    hasReadyImage,
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
          {liveSceneContinuity ? (
            <div className="mt-2 space-y-1 text-[9px] text-slate-500">
              <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                Scene continuity
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Shot key</span>
                <span className="font-semibold text-slate-100">{formatSceneKey(liveSceneContinuity.shotKey)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Shot duration</span>
                <span className="font-semibold text-slate-100">{liveSceneContinuity.shotDuration ?? 0} turns</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Scene key</span>
                <span className="font-semibold text-slate-100">{formatSceneKey(liveSceneContinuity.sceneKey)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Previous key</span>
                <span className="font-semibold text-slate-100">
                  {formatSceneKey(liveSceneContinuity.previousSceneKey)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Delta kind</span>
                <span className="font-semibold text-slate-100">{liveSceneContinuity.deltaKind ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Render plan</span>
                <span className="font-semibold text-slate-100">{liveSceneContinuity.renderPlan}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Continuity</span>
                <span className="font-semibold text-slate-100">{liveSceneContinuity.continuityReason}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Bucket</span>
                <span className="font-semibold text-slate-100">{liveSceneContinuity.continuityBucket}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-200">
                <span>Reuse rate</span>
                <span className="font-semibold text-slate-100">
                  {`${Math.round((liveSceneContinuity.reuseRate ?? 0) * 100)}%`}
                </span>
              </div>
              {liveSceneContinuity.previousSceneArtKeyMismatch ? (
                <div className="flex items-center justify-between text-[11px] text-rose-200">
                  <span>Key mismatch</span>
                  <span className="font-semibold text-rose-100">Yes</span>
                </div>
              ) : null}
            </div>
          ) : null}
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
                    liveSceneArt ?? {
                      imageUrl: "/default-scene.svg",
                      source: "default",
                      pending: false,
                      sceneKey: null,
                      status: "missing",
                    }
                  }
                  caption={displayedSceneImageCaption ?? undefined}
                  transition={liveSceneTransition}
                  continuity={continuityState}
                  transitionCue={sceneTransitionCue}
                  retrySceneKey={sceneKey}
                  retrySceneText={sceneText ?? ""}
                  retryStylePreset={sceneStylePreset ?? null}
                  retryRenderMode={sceneRenderMode}
                />
              </div>
          {adventureId ? (
            <TurnInput
              adventureId={adventureId}
              isSubmitting={isSubmittingTurn}
              error={turnError}
              onSubmitTurn={handleSubmitTurn}
              pressureStage={displayPressureStage}
            />
          ) : null}
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
                  <StatePanel viewModel={statePanelViewModel} />
                </section>
                <section className="space-y-4">
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
