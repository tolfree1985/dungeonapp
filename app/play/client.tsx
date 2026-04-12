"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AdventureHistoryRow from "@/components/play/AdventureHistoryRow";
import HistorySlotCard from "@/components/play/HistorySlotCard";
import { formatPlayTimestamp } from "~/components/play/formatTimestamp";
import LatestTurnCard from "@/components/play/LatestTurnCard";
import StatePanel from "@/components/play/StatePanel";
import SceneImagePanel from "@/components/play/SceneImagePanel";
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
import { normalizeStatePanel } from "./normalizeStatePanel";
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
import { parseTurnApiResponse } from "@/lib/turnApi";
import type { TurnApiResponse, TurnInputPayload } from "@/lib/turnApi";
import type { SceneContinuityInfo } from "@/lib/sceneContinuityInfo";
import { useRouter } from "next/navigation";
import type { CanonicalSceneArtState } from "@/lib/scene-art/canonicalSceneArtState";
import type { SceneArtContract, SceneRenderOpportunity } from "@/lib/scene-art/renderOpportunity";
import type { PressureSummary } from "@/lib/presentation/pressureLanguage";


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

function getRenderOpportunityLabel(opportunity: SceneRenderOpportunity): string {
  switch (opportunity.reason) {
    case "VISIBLE_DISRUPTION":
      return "Render Scene — Environmental Shift";
    case "MAJOR_REVEAL":
      return "Render Scene — Major Reveal";
    case "NEW_SCENE":
      return "Render Scene — New Tableau";
    case "MAJOR_ENVIRONMENT_CHANGE":
      return "Render Scene — Major Change";
    case "ANCHOR_MOMENT":
      return "Render Scene — Anchor Moment";
    default:
      return opportunity.label ?? "Render Scene";
  }
}

function RecentTurnsPanel({ rows }: { rows: AdventureHistoryRowViewModel[] }) {
  const [showFullHistory, setShowFullHistory] = useState(false);
  const visibleRows = rows.slice(-3);
  const hiddenRows = rows.slice(0, Math.max(0, rows.length - 3));
  return (
    <section className={`${cardShell} ${cardPadding} space-y-4`}>
      <div className={sectionHeading}>Chronicle</div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {visibleRows.length === 0 ? (
          <div className={emptyState}>No history recorded yet.</div>
        ) : (
          visibleRows.map((row) => (
            <AdventureHistoryRow key={`${row.turnIndex}-${row.timestampLabel}`} model={row} />
          ))
        )}
        {hiddenRows.length > 0 && showFullHistory && hiddenRows.map((row) => (
          <AdventureHistoryRow key={`hidden-${row.turnIndex}-${row.timestampLabel}`} model={row} />
        ))}
      </div>
      {hiddenRows.length > 0 ? (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowFullHistory((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {showFullHistory ? "Hide full chronicle" : "View full chronicle"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type TopBarProps = {
  pressureSummary: PressureSummary;
};

function TopBar({ pressureSummary }: TopBarProps) {
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
          {pressureSummary.title}
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
  console.log("play.client.turns_prop_preview",
    turns.slice(0, 5).map((turn) => ({
      id: turn.id ?? null,
      input: turn.playerInput ?? null,
      turnIndex: turn.turnIndex ?? null,
      finalized: turn.isFinalizedByAffordance ?? false,
      hasMechanicFacts: Boolean(turn.mechanicFacts),
      mechanicFactKeys: turn.mechanicFacts ? Object.keys(turn.mechanicFacts) : [],
    }))
  );
  console.log("play.client.initial_scene_art_prop", {
    sceneImage,
  });
  const normalizeSceneArt = (value: ResolvedSceneImage | null): ResolvedSceneImage | null => {
    if (!value) return null;
    return {
      ...value,
      imageUrl: value.status === "ready" ? value.imageUrl ?? null : null,
    };
  };
  const mergeSceneArt = (
    current: ResolvedSceneImage | null,
    incoming: ResolvedSceneImage | null,
  ): ResolvedSceneImage | null => {
    if (!incoming) return current;
    if (!incoming.sceneKey || !incoming.promptHash) return current;
    const sameIdentity =
      current &&
      incoming.sceneKey === current.sceneKey &&
      incoming.promptHash === current.promptHash;
    if (!sameIdentity) return incoming;
    if (current.status === "ready" && current.imageUrl) {
      const degrading = !incoming.imageUrl || incoming.status === "missing";
      if (degrading) return current;
    }
    return incoming;
  };
  const initialSceneArt = normalizeSceneArt(sceneImage ?? null);
  const [liveSceneArt, setLiveSceneArt] = useState<ResolvedSceneImage | null>(
    () => initialSceneArt,
  );
  const initialHasActiveSceneArt =
    initialSceneArt?.status === "queued" ||
    initialSceneArt?.status === "generating" ||
    initialSceneArt?.status === "ready";
  const initialHasRenderableOpportunity = false;
  const [sceneRenderOpportunity, setSceneRenderOpportunity] = useState<SceneRenderOpportunity | null>(null);
  const [latestSceneIdentity, setLatestSceneIdentity] = useState<{
    sceneKey: string | null;
    promptHash: string | null;
  } | null>(null);
  const [sceneRenderCredits, setSceneRenderCredits] = useState<number | null>(null);
  const [sceneRenderCreditError, setSceneRenderCreditError] = useState<string | null>(null);
  const [isRenderingScene, setIsRenderingScene] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
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
  const [resolvedTurns, setResolvedTurns] = useState<PlayTurn[]>(turns);
  const [rawPlayState, setRawPlayState] = useState<unknown>(null);
  const currentStatePanel = useMemo(() => {
    if (rawPlayState) {
      return normalizeStatePanel(rawPlayState);
    }
    return statePanel;
  }, [rawPlayState, statePanel]);
  useEffect(() => {
    setResolvedTurns(turns);
  }, [turns]);
  useEffect(() => {
    setLiveSceneTransition(sceneTransition ?? null);
  }, [sceneTransition]);
  useEffect(() => {
    const normalized = normalizeSceneArt(sceneImage ?? null);
    setLiveSceneArt((prev) => mergeSceneArt(prev, normalized));
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
  useEffect(() => {
    setHasHydrated(true);
  }, []);
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
    if (!sceneImage) {
      return;
    }
    if (sceneKey !== lastSceneKeyRef.current) {
      lastSceneKeyRef.current = sceneKey;
      lastLoggedStatusRef.current = null;
    }

      if (!sceneKey || !promptHash) {
        return;
      }

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

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const POLL_INTERVAL_MS = 1500;
    const MAX_ATTEMPTS = 20;
    const fallbackImageUrl = liveSceneArt?.imageUrl ?? null;
    const fallbackSource = liveSceneArt?.source === "scene" ? "default" : liveSceneArt?.source ?? "default";

    const stopPolling = () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled) return;
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        timerId = null;
        pollSceneArt();
      }, POLL_INTERVAL_MS);
    };

    const handleFailure = (nextStatus: SceneArtStatus) => {
      logSceneArtStatus(nextStatus);
      setLiveSceneArt((prev) =>
        mergeSceneArt(prev, {
          ...prev,
          imageUrl: fallbackImageUrl,
          source: fallbackSource,
          pending: false,
          sceneKey,
          promptHash: prev?.promptHash ?? null,
          status: nextStatus,
        })
      );
      stopPolling();
    };

    const logAndSetReady = (nextStatus: SceneArtStatus, imageUrl: string | null) => {
      logSceneArtStatus(nextStatus);
      setLiveSceneArt((prev) =>
        mergeSceneArt(prev, {
          ...prev,
          imageUrl,
          source: imageUrl ? "scene" : fallbackSource,
          pending: false,
          sceneKey,
          promptHash: prev?.promptHash ?? null,
          status: nextStatus,
        })
      );
      stopPolling();
    };

    const pollSceneArt = async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        handleFailure("missing");
        return;
      }
      try {
        const response = await fetch(
          `/api/scene-art/by-identity?sceneKey=${sceneKey}&promptHash=${promptHash}`
        );
        if (cancelled) return;
        if (!response.ok) {
          handleFailure("missing");
          return;
        }
        const payload = (await response.json()) as SceneArtStatusResponse;
        if (cancelled) return;
        const sceneArt = payload.sceneArt ?? null;
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
        console.log("scene.art.client.kick.check", {
          sceneKey: normalizedSceneArt.sceneKey ?? null,
          promptHash: normalizedSceneArt.promptHash ?? null,
          status: normalizedSceneArt.status ?? null,
          hasImage: Boolean(normalizedSceneArt.imageUrl),
        });
        const nextStatus =
          normalizedSceneArt.status ?? liveSceneArt?.status ?? "queued";
        const nextPromptHash =
          normalizedSceneArt.promptHash ?? liveSceneArt?.promptHash ?? null;
        const nextSceneKey =
          normalizedSceneArt.sceneKey ?? liveSceneArt?.sceneKey ?? sceneKey;
        const nextSceneArt: ResolvedSceneImage = {
          ...liveSceneArt,
          ...normalizedSceneArt,
          sceneKey: nextSceneKey,
          promptHash: nextPromptHash,
          status: nextStatus,
          imageUrl: normalizedSceneArt.imageUrl ?? liveSceneArt?.imageUrl ?? null,
          source: normalizedSceneArt.imageUrl ? "scene" : liveSceneArt?.source ?? "scene",
          pending:
            nextStatus === "queued" ||
            nextStatus === "retryable" ||
            nextStatus === "generating",
        };
        setLiveSceneArt((prev) => mergeSceneArt(prev, nextSceneArt));
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
  }, [liveSceneArt?.sceneKey, liveSceneArt?.status, sceneImage]);
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

  useEffect(() => {
    console.log("liveSceneArt", liveSceneArt);
  }, [liveSceneArt]);

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

      const payload = await parseTurnApiResponse(response);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && typeof (payload as { error?: string }).error === "string"
            ? (payload as { error?: string }).error
            : "Internal error"
        );
      }

      const result = (payload ?? {}) as TurnApiResponse;
      const turn = result.turn ?? null;
      console.log("CLIENT TURN MECHANIC FACTS", turn?.mechanicFacts ?? null);
      console.log("client.handleSubmitTurn.result", result);
      console.log("client.handleSubmitTurn.sceneArt", result.sceneArt);
      console.log(
        "client.handleSubmitTurn.sceneArt.keys",
        Object.keys(result.sceneArt ?? {})
      );
      handleSceneTransitionUpdate(result.sceneTransition ?? null);

      if (result.sceneArt?.sceneKey && result.sceneArt?.promptHash) {
        const sceneArtImageUrl =
          (result.sceneArt.status ?? "queued") === "ready"
            ? result.sceneArt.imageUrl ?? null
            : null;
          const canonicalSceneArt = {
            sceneKey: result.sceneArt.sceneKey,
            promptHash: result.sceneArt.promptHash,
            status: result.sceneArt.status ?? "queued",
            imageUrl: sceneArtImageUrl,
          } as ResolvedSceneImage;
          console.log("scene.art.client.turn_response.apply", canonicalSceneArt);
          setLiveSceneArt((prev) => mergeSceneArt(prev, canonicalSceneArt));
          if (
            canonicalSceneArt.sceneKey &&
            canonicalSceneArt.promptHash &&
            (canonicalSceneArt.status === "queued" ||
              canonicalSceneArt.status === "retryable" ||
              canonicalSceneArt.status === "generating")
          ) {
            console.log("scene.art.client.kick.immediate", {
              sceneKey: canonicalSceneArt.sceneKey,
              promptHash: canonicalSceneArt.promptHash,
            });
            void kickSceneArtWorker(canonicalSceneArt.sceneKey, canonicalSceneArt.promptHash);
          }
        } else if (result.sceneArt) {
        console.error("scene.art.client.identity_missing_after_turn", {
          sceneArt: result.sceneArt,
          keys: Object.keys(result.sceneArt ?? {}),
          result,
        });
      }
      if (turn) {
        setResolvedTurns((prev) => {
          const next = turn.id ? [turn, ...prev.filter((existing) => existing.id !== turn.id)] : [turn, ...prev];
          console.log("client.turn.inserted", {
            insertedTurnId: turn.id ?? null,
            insertedInput: turn.playerInput ?? null,
            newLength: next.length,
          });
          return next;
        });
      }
      if (result.state) {
        setRawPlayState(result.state);
      }
      setLiveSceneContinuity(result.sceneContinuity ?? null);
      setSceneRenderOpportunity(result.sceneRenderOpportunity ?? null);
      if (typeof result.sceneRenderCredits === "number") {
        setSceneRenderCredits(result.sceneRenderCredits);
        if (result.sceneRenderCredits > 0) {
          setSceneRenderCreditError(null);
        } else {
          setSceneRenderCreditError("No scene renders remaining.");
        }
      } else {
        setSceneRenderCredits(result.sceneRenderCredits ?? null);
        setSceneRenderCreditError(null);
      }
      if (result.sceneRenderOpportunity) {
        setLatestSceneIdentity({
          sceneKey: result.sceneRenderOpportunity.sceneKey ?? null,
          promptHash: result.sceneRenderOpportunity.promptHash ?? null,
        });
      }

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

  const isDisplayEligibleTurn = (turn: PlayTurn | null | undefined) => {
    if (!turn) return false;
    const hasInput = Boolean(turn.playerInput?.trim());
    const hasState = (turn.stateDeltas?.length ?? 0) > 0;
    const hasLedger = (turn.ledgerAdds?.length ?? 0) > 0;
    const finalized = turn.isFinalizedByAffordance === true;
    return hasInput || hasState || hasLedger || finalized;
  };

  const canonicalLatest = [...resolvedTurns]
    .sort((a, b) => {
      const aIndex = typeof a.turnIndex === "number" ? a.turnIndex : -1;
      const bIndex = typeof b.turnIndex === "number" ? b.turnIndex : -1;
      return bIndex - aIndex;
    })
    .find(isDisplayEligibleTurn) ?? null;
  const canonicalResolvedTurns = canonicalLatest ? ([canonicalLatest] as PlayTurn[]) : resolvedTurns;
  const latestTurn = canonicalLatest ?? (resolvedTurns[0] ?? null);
  const previousTurns = canonicalResolvedTurns.slice(1);
  const pressureStage = currentStatePanel.pressureStage ?? "calm";
  const currentEntry = currentId ? history.find((entry) => entry.adventureId === currentId) ?? null : null;
  const pinnedEntries = history.filter((entry) => entry.pinned && entry.adventureId !== currentId);
  const recentEntries = history.filter((entry) => !entry.pinned && entry.adventureId !== currentId);
  const hasTurns = resolvedTurns.length > 0;
  const showPreview = dbOffline && !hasTurns;
  const latestDisplayTurn = hasTurns ? latestTurn : showPreview ? previewLatestTurn : null;
  const recentDisplayTurns = hasTurns ? previousTurns : showPreview ? previewTurns.slice(1) : [];
  const displayPressureStage = (showPreview ? previewLatestTurn.pressureStage : pressureStage) ?? "calm";
  const candidateLog = [...resolvedTurns]
    .sort((a, b) => {
      const aIndex = typeof a.turnIndex === "number" ? a.turnIndex : -1;
      const bIndex = typeof b.turnIndex === "number" ? b.turnIndex : -1;
      return bIndex - aIndex;
    })
    .slice(0, 10)
    .map((turn) => ({
      id: turn.id ?? null,
      input: turn.playerInput ?? null,
      turnIndex: turn.turnIndex ?? null,
      finalized: turn.isFinalizedByAffordance ?? false,
      stateDeltaCount: turn.stateDeltas?.length ?? 0,
      ledgerCount: turn.ledgerAdds?.length ?? 0,
    }));
  console.log("client.latestTurn.selection", {
    resolvedTurnsCount: resolvedTurns.length,
    latestTurnId: latestTurn?.id ?? null,
    latestTurnInput: latestTurn?.playerInput ?? null,
    latestTurnFinalizedByAffordance: latestTurn?.isFinalizedByAffordance ?? false,
    latestTurnCandidatePreview: candidateLog,
  });
  const [highlightLatestTurn, setHighlightLatestTurn] = useState(false);
  const [showTurnDivider, setShowTurnDivider] = useState(false);
  const latestTurnRef = useRef<HTMLDivElement | null>(null);
  const prevLatestTurnIndexRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnDividerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kickedSceneArtRef = useRef<string | null>(null);

  async function kickSceneArtWorker(sceneKey: string, promptHash: string) {
    const key = `${sceneKey}:${promptHash}`;

    if (kickedSceneArtRef.current === key) {
      console.log("scene.art.client.kick.skip_duplicate", { sceneKey, promptHash });
      return;
    }

    kickedSceneArtRef.current = key;

    console.log("scene.art.client.kick", {
      sceneKey,
      promptHash,
      url: `/api/scene-art/worker/run/${sceneKey}/${promptHash}`,
    });

    try {
      const response = await fetch(`/api/scene-art/worker/run/${sceneKey}/${promptHash}`, {
        method: "POST",
        cache: "no-store",
      });

      console.log("scene.art.client.kick.response", {
        sceneKey,
        promptHash,
        ok: response.ok,
        status: response.status,
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      console.log("client.turn.response", {
        turnId: (body as any)?.turn?.id ?? null,
        isFinalizedByAffordance: (body as any)?.turn?.isFinalizedByAffordance ?? false,
        playerInput: (body as any)?.turn?.playerInput ?? null,
        scene: (body as any)?.turn?.scene ?? null,
        mechanicFacts: (body as any)?.turn?.mechanicFacts ?? null,
        stateDeltaKeys: ((body as any)?.turn?.stateDeltas ?? []).map((d: any) => d?.key ?? d?.op),
      });

      console.log(
        "scene.art.client.kick.body.json",
        JSON.stringify(
          {
            sceneKey,
            promptHash,
            body,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error("scene.art.client.kick.failed", {
        sceneKey,
        promptHash,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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

  const latestDisplayTurnRef = useRef<PlayTurn | null>(null);
  if (latestDisplayTurnRef.current === null) {
    latestDisplayTurnRef.current = latestDisplayTurn;
  }
  const effectiveLatestDisplayTurn = hasHydrated ? latestDisplayTurn : latestDisplayTurnRef.current;
  const canonicalMechanicFacts = useMemo(
    () => effectiveLatestDisplayTurn?.mechanicFacts ?? null,
    [effectiveLatestDisplayTurn?.mechanicFacts]
  );
  const latestTurnModel = useMemo(() => {
    if (!effectiveLatestDisplayTurn) return null;
    return buildLatestTurnViewModel(effectiveLatestDisplayTurn, displayPressureStage, {
      mechanicFacts: canonicalMechanicFacts,
    });
  }, [displayPressureStage, effectiveLatestDisplayTurn, canonicalMechanicFacts]);
  console.log("client.latestTurn.model_source", {
    latestHydrated: hasHydrated,
    latestDisplayTurnId: latestDisplayTurn?.id ?? null,
    effectiveDisplayTurnId: effectiveLatestDisplayTurn?.id ?? null,
    latestDisplayTurnInput: latestDisplayTurn?.playerInput ?? null,
    latestDisplayTurnMechanicFacts: latestDisplayTurn?.mechanicFacts ?? null,
  });

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
  const statePanelViewModel = useMemo(
    () =>
      buildStatePanelViewModel(
        currentStatePanel,
        effectiveLatestDisplayTurn?.ledgerAdds ?? [],
        canonicalMechanicFacts,
        {
          latestTurnStateDeltas: effectiveLatestDisplayTurn?.stateDeltas ?? [],
          latestTurnLedgerAdds: effectiveLatestDisplayTurn?.ledgerAdds ?? [],
          worldFlags: currentStatePanel.flags ?? {},
          playerInput: effectiveLatestDisplayTurn?.playerInput ?? null,
        }
      ),
    [currentStatePanel, effectiveLatestDisplayTurn, canonicalMechanicFacts]
  );
  const initialPressureSummaryRef = useRef(statePanelViewModel.pressureSummary);
  const pressureSummary = hasHydrated
    ? statePanelViewModel.pressureSummary
    : initialPressureSummaryRef.current;
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

  const displaySceneArt = liveSceneArt ?? sceneImage ?? null;
  console.log("scene.art.client.render_state", {
    liveStatus,
    sceneKey: displaySceneArt?.sceneKey ?? null,
    promptHash: displaySceneArt?.promptHash ?? null,
    imageUrl: displaySceneArt?.imageUrl ?? null,
    resolvedBackdropUrl,
    hasReadyImage,
  });

  const sceneArtRenderInput = displaySceneArt;
  console.log("client.sceneArt.render_input", {
    liveSceneArt,
    hydratedSceneArt: sceneImage,
    renderedSceneArt: sceneArtRenderInput,
  });

  const creditsRemaining = sceneRenderCredits;
  const creditsExhausted = creditsRemaining === 0;
  const sceneCreditMessage =
    sceneRenderCreditError ?? (creditsExhausted ? "No scene renders remaining." : null);
  const sceneArtAlreadyReadyForOpportunity =
    !!displaySceneArt &&
    displaySceneArt.status === "ready" &&
    displaySceneArt.sceneKey === sceneRenderOpportunity?.sceneKey &&
    displaySceneArt.promptHash === sceneRenderOpportunity?.promptHash;
  const sceneArtAlreadyInflightForOpportunity =
    !!displaySceneArt &&
    (displaySceneArt.status === "queued" || displaySceneArt.status === "generating") &&
    displaySceneArt.sceneKey === sceneRenderOpportunity?.sceneKey &&
    displaySceneArt.promptHash === sceneRenderOpportunity?.promptHash;
  const liveHasRenderableOpportunity =
    !!sceneRenderOpportunity &&
    sceneRenderOpportunity.canGenerate &&
    !sceneRenderOpportunity.autoRender &&
    !!sceneRenderOpportunity.sceneKey &&
    !!sceneRenderOpportunity.promptHash &&
    !sceneArtAlreadyReadyForOpportunity &&
    !sceneArtAlreadyInflightForOpportunity;
  const liveHasActiveSceneArt =
    !!displaySceneArt &&
    (displaySceneArt.status === "queued" ||
      displaySceneArt.status === "generating" ||
      displaySceneArt.status === "ready");
  const hasRenderableOpportunity = hasHydrated ? liveHasRenderableOpportunity : initialHasRenderableOpportunity;
  const hasActiveSceneArt = hasHydrated ? liveHasActiveSceneArt : initialHasActiveSceneArt;
  const disableRenderCta =
    creditsExhausted ||
    isRenderingScene ||
    !sceneRenderOpportunity?.canGenerate;
  const renderOpportunityLabel = sceneRenderOpportunity
    ? getRenderOpportunityLabel(sceneRenderOpportunity)
    : "Render Scene";

  type RenderSceneEndpointResponse =
    | {
        ok: true;
        sceneArt: SceneArtContract;
        queued: boolean;
        reusedExisting: boolean;
      }
    | {
        ok: false;
        error?: string;
      };

  const onRenderScene = async () => {
    console.log("onRenderScene clicked");
    if (!adventureId || !sceneRenderOpportunity?.canGenerate) return;
    const sceneKey = sceneRenderOpportunity.sceneKey;
    const promptHash = sceneRenderOpportunity.promptHash;
    if (!sceneKey || !promptHash) return;
    if (isRenderingScene) return;

    setIsRenderingScene(true);
    try {
      const response = await fetch("/api/scene-art/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adventureId,
          sceneKey,
          promptHash,
        }),
      });
      const payload = (await response.json()) as RenderSceneEndpointResponse;
      console.log("render response", payload);
      if (!payload.ok) {
        if (payload.error === "INSUFFICIENT_RENDER_CREDITS" || response.status === 402) {
          setSceneRenderCreditError("No scene renders remaining.");
          setSceneRenderCredits(0);
        }
        return;
      }
      const { sceneArt, reusedExisting } = payload;
      if (sceneArt) {
        setLiveSceneArt(sceneArt);
      }
      const nextSceneArt: ResolvedSceneImage = {
        sceneKey: sceneArt.sceneKey,
        promptHash: sceneArt.promptHash,
        status: sceneArt.status ?? "queued",
        imageUrl: sceneArt.imageUrl ?? null,
        source: sceneArt.imageUrl ? "scene" : "scene",
        pending:
          sceneArt.status === "queued" ||
          sceneArt.status === "generating",
      };
      setLiveSceneArt((prev) => mergeSceneArt(prev, nextSceneArt));
      if (!reusedExisting) {
        setSceneRenderCredits((prev) => (prev != null ? Math.max(prev - 1, 0) : prev));
      }
      setSceneRenderCreditError(null);
      if (sceneArt.status !== "ready") {
        void kickSceneArtWorker(sceneArt.sceneKey, sceneArt.promptHash);
      }
    } finally {
      setIsRenderingScene(false);
    }
  };

  const pollingSceneKey = liveSceneArt?.sceneKey ?? null;
  const pollingPromptHash = liveSceneArt?.promptHash ?? null;
  const pollingLiveStatus = liveSceneArt?.status ?? null;

  useEffect(() => {
    if (!pollingSceneKey || !pollingPromptHash) return;
    if (pollingLiveStatus !== "queued" && pollingLiveStatus !== "generating") return;

    const interval = setInterval(async () => {
      console.log("CLIENT_SCENE_ART_POLL_IDENTITY", {
        sceneKey: pollingSceneKey,
        promptHash: pollingPromptHash,
        status: pollingLiveStatus,
      });
      const params = new URLSearchParams({
        sceneKey: pollingSceneKey,
        promptHash: pollingPromptHash,
      });

      const response = await fetch(`/api/scene-art/by-identity?${params.toString()}`);
      if (!response.ok) return;

      const data = (await response.json()) as CanonicalSceneArtState;

      if (data.status === "ready") {
        const readySceneArt: ResolvedSceneImage = {
          imageUrl: data.imageUrl,
          source: "scene",
          pending: false,
          sceneKey: data.sceneKey,
          status: data.status,
          promptHash: data.promptHash,
        };
        setLiveSceneArt((prev) => mergeSceneArt(prev, readySceneArt));
        clearInterval(interval);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [pollingSceneKey, pollingPromptHash, pollingLiveStatus]);

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
            <TopBar pressureSummary={pressureSummary} />
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
              <div className="rounded-3xl border border-white/10 bg-black/40 shadow-[0_35px_55px_rgba(0,0,0,0.55)]">
                <div className="p-6 space-y-6">
                  <div ref={latestTurnRef}>
                    <LatestTurnCard
                      key={latestDisplayTurn?.id ?? "latest"}
                      model={latestTurnModel}
                      isHighlighted={highlightLatestTurn}
                    />
                  </div>
                </div>
                <div className="border-t border-white/10 px-6 py-4">
                  {displaySceneArt ? (
                    <SceneImagePanel
                      key={displaySceneArt.sceneKey ?? "scene-art"}
                      sceneArt={sceneArtRenderInput}
                      caption={displayedSceneImageCaption ?? undefined}
                      transition={liveSceneTransition}
                      continuity={continuityState}
                      focusState={sceneFocusState}
                      transitionCue={sceneTransitionCue}
                      isRenderingScene={isRenderingScene}
                    />
                  ) : null}
                </div>
                <div className="border-t border-white/5 px-6 py-4">
                  {adventureId ? (
                    <TurnInput
                      adventureId={adventureId}
                      isSubmitting={isSubmittingTurn}
                      error={turnError}
                      onSubmitTurn={handleSubmitTurn}
                      pressureStage={displayPressureStage}
                    />
                  ) : null}
                </div>
              <div className="border-t border-white/5 px-6 py-4 text-center text-xs uppercase tracking-[0.3em] text-white/50">
                The moment waits on your decision.
              </div>
            </div>
          </section>

            <aside className={ui.rightColumn}>
              <div className="space-y-6">
                <section className="space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Situation</div>
                  <WorldContext
                    location={currentStatePanel.location ?? "Servants’ Wing"}
                    timeOfDay={currentStatePanel.timeOfDay ?? "Late Night"}
                    ambience={currentStatePanel.ambience ?? "Cold / Quiet"}
                    tags={currentStatePanel.contextTags ?? []}
                  />
                  <SceneRenderStatusStrip
                    label={renderOpportunityLabel}
                    onRender={onRenderScene}
                    isRendering={isRenderingScene}
                    remainingCredits={creditsRemaining}
                    creditMessage={sceneCreditMessage}
                  />
                  {(() => {
                    console.log("play.inventory.render", {
                      statePanelInventory: currentStatePanel.inventory,
                    });
                    console.log("play.inventory.items", currentStatePanel.inventory);
                    console.log("play.statePanel", currentStatePanel);
                    console.log("play.statePanel.inventory", currentStatePanel.inventory);
                    console.log("play.statePanel.inventory.items", currentStatePanel.inventory);
                    console.log("play.rawState", rawPlayState);
                    console.log("play.rawState.inventory", (rawPlayState as any)?.inventory);
                    console.log("play.rawState.inventory.items", (rawPlayState as any)?.inventory?.items);
                    return <StatePanel viewModel={statePanelViewModel} />;
                  })()}
                </section>
              </div>
            </aside>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-4 text-[10px] uppercase tracking-[0.3em] text-white/35">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <span>System utilities</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
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

type SceneRenderOpportunityCardProps = {
  label: string;
  onRender: () => void;
  isRendering: boolean;
  remainingCredits?: number | null;
  creditMessage?: string | null;
};

function SceneRenderStatusStrip({
  label,
  onRender,
  isRendering,
  remainingCredits,
  creditMessage,
}: SceneRenderOpportunityCardProps) {
  const isAvailable = typeof remainingCredits === "number" ? remainingCredits > 0 : !creditMessage;
  const statusText = (() => {
    if (isRendering) return "Rendering…";
    if (typeof remainingCredits === "number") {
      return remainingCredits > 0 ? `Available · ${remainingCredits} remaining` : "Unavailable · 0 remaining";
    }
    if (creditMessage) return creditMessage;
    return "Unavailable · 0 remaining";
  })();
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-left text-xs text-slate-300">
      <div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-slate-500">Scene Render</p>
        <p className="text-sm font-semibold text-white">{statusText}</p>
        <p className="text-[11px] text-slate-500">Rendering is optional presentation; continue play uninterrupted.</p>
      </div>
      {isAvailable && (
        <button
          type="button"
          onClick={onRender}
          disabled={isRendering}
          className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-300 transition hover:border-amber-200 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      )}
    </div>
  );
}
