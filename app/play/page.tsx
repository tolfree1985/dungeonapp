import PlayClient from "./client";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { PlayScenarioMeta, PlayStatePanel, PlayStateValue, PlayTurn } from "./types";
import AuthRequiredState from "@/components/auth/AuthRequiredState";
import {
  getOrClaimAdventureForUser,
  isAdventureOwnershipError,
} from "@/lib/adventure/ownership";
import { getOptionalUser } from "@/lib/api/identity";
import { prisma } from "@/lib/prisma";
import { getSceneImageUpdateCaption } from "@/lib/sceneImageCaption";
import { buildCanonicalSceneArtPayload } from "@/lib/canonicalSceneArtPayload";
import { resolveSceneFramingState } from "@/lib/resolveSceneFramingState";
import { resolveSceneSubjectState } from "@/lib/resolveSceneSubjectState";
import { resolveSceneActorState } from "@/lib/resolveSceneActorState";
import { resolveSceneFocusState } from "@/lib/resolveSceneFocusState";
import { resolveSceneVisualState, type VisualStateDelta } from "@/lib/resolveSceneVisualState";
import { loadResolvedSceneImage } from "@/lib/loadResolvedSceneImage";
import { resolveSceneRefreshDecision } from "@/lib/resolveSceneRefreshDecision";
import { buildPlayTurnPresentation } from "./normalizeTurnPresentation";
import { randomUUID } from "node:crypto";
import { createAdventureFromScenarioId } from "@/lib/game/createAdventureFromScenario";
import { resolveCanonicalSceneIdentity } from "@/lib/scene-art/resolveCanonicalSceneIdentity";
import { buildSceneArtLookupIdentity } from "@/lib/sceneArtRepo";
import type { SceneArtPayload } from "@/lib/sceneArt";

const PROTECTED_ADVENTURE_IDS = new Set(["canon_ui", "sandbox", "replay_lab", "dev_run"]);
const DEV_DEFAULT_ADVENTURE = "85e17a2c-c8a9-4c48-9186-2ed7e3e9d983";
const DEFAULT_SCENE_FALLBACK_URL = "/default-scene.svg";
const playableAdventureInclude = {
  turns: {
    orderBy: { turnIndex: "asc" as const },
  },
} as const;

export type PlayableAdventureShape = {
  state: unknown;
  turns?: Array<{ scene?: string | null }>;
};

export function choosePlayableAdventure({
  requested,
  latest,
}: {
  requested: PlayableAdventureShape | null;
  latest: PlayableAdventureShape | null;
}): PlayableAdventureShape | null {
  if (requested && isPlayableAdventure(requested)) return requested;
  if (latest && isPlayableAdventure(latest)) return latest;
  return null;
}

export function resolveOpeningSceneText(args: {
  latestTurnScene?: string | null;
  stateCurrentSceneText?: string | null;
  fallbackTurnScene?: string | null;
}): string {
  const normalizedTurn = typeof args.latestTurnScene === "string" ? args.latestTurnScene.trim() : "";
  const normalizedState = typeof args.stateCurrentSceneText === "string" ? args.stateCurrentSceneText.trim() : "";
  const normalizedFallback = typeof args.fallbackTurnScene === "string" ? args.fallbackTurnScene.trim() : "";
  if (normalizedTurn.length > 0) return normalizedTurn;
  if (normalizedState.length > 0) return normalizedState;
  if (normalizedFallback.length > 0) return normalizedFallback;
  return "";
}

function isPlayableAdventure(adventure: { state: unknown; turns?: Array<{ scene: string | null }> }) {
  const state = (adventure.state as Record<string, unknown> | null) ?? null;
  const currentScene = state?.currentScene as Record<string, unknown> | null;
  const hasSceneObject =
    typeof currentScene?.key === "string" &&
    currentScene.key.trim().length > 0 &&
    typeof currentScene?.text === "string" &&
    currentScene.text.trim().length > 0;
  const hasTurn0 =
    Array.isArray(adventure.turns) &&
    typeof adventure.turns[0]?.scene === "string" &&
    adventure.turns[0]?.scene.trim().length > 0;
  return hasSceneObject && hasTurn0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }
  return null;
}

function asDisplayValue(value: unknown): PlayStateValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function describeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildVisualDeltasFromLedger(ledgerAdds: unknown[]): VisualStateDelta[] {
  if (!Array.isArray(ledgerAdds)) return [];
  const deltas: VisualStateDelta[] = [];
  const fallbackMessages: Record<VisualStateDelta["key"], string> = {
    lighting: "Lighting flickers.",
    atmosphere: "Atmosphere grows tense.",
    wear: "The room shows fresh strain.",
    threat: "Threat draws near.",
  };
  for (const entry of ledgerAdds) {
    const record = asRecord(entry);
    if (!record) continue;
    if (record.kind !== "visual_state") continue;
    const cause = typeof record.cause === "string" ? record.cause.toLowerCase() : "";
    let key: VisualStateDelta["key"] | null = null;
    if (cause.includes("threat")) key = "threat";
    else if (cause.includes("lighting")) key = "lighting";
    else if (cause.includes("atmosphere")) key = "atmosphere";
    else if (cause.includes("wear")) key = "wear";
    if (!key) continue;
    const effect = typeof record.effect === "string" ? record.effect.trim() : "";
    deltas.push({
      key,
      from: "",
      to: "",
      message: effect || fallbackMessages[key],
    });
  }
  return deltas;
}

function readSection(state: Record<string, unknown> | null, key: string): unknown {
  if (!state) return null;
  if (state[key] !== undefined) return state[key];
  const player = asRecord(state.player);
  if (player?.[key] !== undefined) return player[key];
  return null;
}

function normalizeStatePanel(state: unknown): PlayStatePanel {
  const root = asRecord(state);
  const statsSource = asRecord(readSection(root, "stats"));
  const inventorySource = readSection(root, "inventory");
  const questsSource = readSection(root, "quests");
  const relationshipsSource = readSection(root, "relationships");

  const statsOrder = [
    "pressureStage",
    "alert",
    "noise",
    "heat",
    "time",
    "trust",
    "turns",
    "location",
    "progress",
  ];
  const statsLabelMap: Record<string, string> = {
    pressureStage: "Pressure stage",
    alert: "Alert",
    noise: "Noise",
    heat: "Heat",
    time: "Time",
    trust: "Trust",
    turns: "Turns",
    location: "Location",
    progress: "Progress",
  };
  const stats = statsSource
    ? Object.entries(statsSource)
        .sort(([keyA], [keyB]) => {
          const indexA = statsOrder.indexOf(keyA);
          const indexB = statsOrder.indexOf(keyB);
          if (indexA === -1 && indexB === -1) return keyA.localeCompare(keyB);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        })
        .map(([key, value]) => ({
          key: statsLabelMap[key] ?? key,
          value: asDisplayValue(value),
        }))
    : [];

  const pressureStage =
    typeof statsSource?.pressureStage === "string" && statsSource.pressureStage.trim()
      ? statsSource.pressureStage.trim()
      : null;

  const inventoryRecord = asRecord(inventorySource);
  const inventory = Array.isArray(inventorySource)
    ? inventorySource.map((item, index) => {
        if (typeof item === "string") return { name: item };
        const record = asRecord(item);
        return {
          name: describeValue(record?.name ?? record?.id ?? item) ?? `Item ${index + 1}`,
          detail: describeValue(record?.detail ?? record?.description ?? record?.qty ?? record?.count),
        };
      })
    : inventoryRecord
      ? Object.entries(inventoryRecord).map(([name, value]) => ({
          name,
          detail: describeValue(value),
        }))
      : [];

  const questsRecord = asRecord(questsSource);
  const quests = Array.isArray(questsSource)
    ? questsSource.map((item, index) => {
        const record = asRecord(item);
        return {
          title: describeValue(record?.title ?? record?.name ?? item) ?? `Quest ${index + 1}`,
          status: describeValue(record?.status ?? record?.state),
          detail: describeValue(record?.detail ?? record?.description),
        };
      })
    : questsRecord
      ? Object.entries(questsRecord).map(([title, value]) => {
          const record = asRecord(value);
          return {
            title,
            status: describeValue(record?.status ?? record?.state ?? value),
            detail: describeValue(record?.detail ?? record?.description),
          };
        })
      : [];

  const relationshipsRecord = asRecord(relationshipsSource);
  const relationships = Array.isArray(relationshipsSource)
    ? relationshipsSource.map((item, index) => {
        const record = asRecord(item);
        return {
          name: describeValue(record?.name ?? record?.id ?? item) ?? `Relationship ${index + 1}`,
          status: describeValue(record?.status ?? record?.standing ?? record?.value),
          detail: describeValue(record?.detail ?? record?.description),
        };
      })
    : relationshipsRecord
      ? Object.entries(relationshipsRecord).map(([name, value]) => {
          const record = asRecord(value);
          return {
            name,
            status: describeValue(record?.status ?? record?.standing ?? value),
            detail: describeValue(record?.detail ?? record?.description),
          };
        })
      : [];

  return { pressureStage, stats, inventory, quests, relationships };
}

function readScenarioMetaFromState(state: unknown): PlayScenarioMeta | null {
  const meta = asRecord(asRecord(state)?._meta);
  const id = typeof meta?.scenarioId === "string" && meta.scenarioId.trim() ? meta.scenarioId.trim() : null;
  if (!id) return null;
  return {
    id,
    title:
      typeof meta?.scenarioTitle === "string" && meta.scenarioTitle.trim()
        ? meta.scenarioTitle.trim()
        : "Unknown scenario",
    summary: typeof meta?.scenarioSummary === "string" ? meta.scenarioSummary : null,
  };
}

type PlayPageProps = {
  searchParams: Promise<{ adventureId?: string; scenarioId?: string }>;
};

export default async function PlayPage({ searchParams }: PlayPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedAdventureId =
    typeof resolvedSearchParams.adventureId === "string" ? resolvedSearchParams.adventureId : undefined;
  const scenarioId = resolvedSearchParams.scenarioId ?? null;
  const preferDevDefaultAdventure =
    process.env.NODE_ENV === "development" && !requestedAdventureId ? DEV_DEFAULT_ADVENTURE : null;
  let adventureId: string | null = requestedAdventureId ?? null;
  const user = getOptionalUser(await headers());

  if (!user) {
    const destination = adventureId ? `/play?adventureId=${encodeURIComponent(adventureId)}` : "/play";
    const actionHref = `/login?next=${encodeURIComponent(destination)}`;
    return (
    <div className="relative z-10">
      <AuthRequiredState
        title="Sign in to play"
        message="Play, resume, and turn execution are private surfaces."
        actionHref={actionHref}
      />
    </div>
  );
  }

  if (adventureId === "adv_123") {
    console.log("PLAY BLOCKING POISONED ADVENTURE", adventureId);
    redirect("/play");
  }

  if (adventureId) {
    const candidate = await prisma.adventure.findFirst({
      where: { id: adventureId, ownerId: user.id },
      include: playableAdventureInclude,
    });
    const isPlayable = isPlayableAdventure(candidate ?? { state: null });
    if (!isPlayable) {
      console.warn("BOOTSTRAP: invalid adventure, falling back", { adventureId });
      adventureId = null;
    }
  }

  if (!adventureId) {
    if (process.env.NODE_ENV === "development") {
      console.log("PLAY SESSION USER", user.id ?? null);
      console.log("PLAY REQUESTED ADVENTURE ID", adventureId ?? null);
    }
    if (preferDevDefaultAdventure) {
      adventureId = preferDevDefaultAdventure;
    } else {
      const resumedAdventure = await prisma.adventure.findFirst({
        where: { ownerId: user.id },
        orderBy: [{ latestTurnIndex: "desc" }, { updatedAt: "desc" }],
        select: { id: true },
      });
      if (resumedAdventure) {
        return redirect(`/play?adventureId=${resumedAdventure.id}`);
      }

      let scenarioToBootstrap: { id: string } | null = null;
      if (scenarioId) {
        scenarioToBootstrap = await prisma.scenario.findFirst({
          where: {
            id: scenarioId,
            OR: [{ visibility: "PUBLIC" }, { ownerId: user.id }],
          },
          select: { id: true },
        });
      }
      if (!scenarioToBootstrap) {
        scenarioToBootstrap = await prisma.scenario.findFirst({
          where: { visibility: "PUBLIC" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
      }

      if (!scenarioToBootstrap) {
        return (
          <div className="relative z-10">
            <AuthRequiredState
              title="No adventures available"
              message="Chronicle could not find any public scenarios to start a new adventure."
              actionHref="/"
              actionLabel="Go home"
            />
          </div>
        );
      }

      const newAdventureId = randomUUID();
      await createAdventureFromScenarioId({
        tx: prisma,
        adventureId: newAdventureId,
        scenarioId: scenarioToBootstrap.id,
        ownerId: user.id,
      });
      return redirect(`/play?adventureId=${newAdventureId}`);
    }
  }

let turns: PlayTurn[] = [];
let currentScenario: PlayScenarioMeta | null = null;
let statePanel: PlayStatePanel = {
  pressureStage: null,
  stats: [],
  inventory: [],
  quests: [],
  relationships: [],
};
let dbOffline = false;
let persistedAdventureOwnerId: string | null = null;
  let rawState: Record<string, unknown> | null = null;
  if (adventureId) {
    try {
      const ownership = await getOrClaimAdventureForUser({
        db: prisma,
        adventureId,
        userId: user.id,
      });
      console.info("PLAY SESSION USER", user?.id ?? null);
      console.info("PLAY ADVENTURE ID", adventureId ?? null);

      const requestedAdventure = ownership.adventure
        ? await prisma.adventure.findFirst({
            where: {
              id: ownership.adventure.id,
              ownerId: user.id,
            },
            include: playableAdventureInclude,
          })
        : null;
      const requestedAdventureState = asRecord(requestedAdventure?.state);
      const playableAdventure =
        requestedAdventure && isPlayableAdventure(requestedAdventure)
          ? requestedAdventure
          : null;

      if (!playableAdventure) {
        console.log("Ownership failed — attempting recovery", {
          requestedAdventureId: requestedAdventure?.id ?? null,
        });
        const latest = await prisma.adventure.findFirst({
          where: {
            ownerId: user.id,
            turns: {
              some: {},
            },
          },
          include: {
            turns: {
              orderBy: { turnIndex: "desc" },
              take: 1,
            },
          },
          orderBy: { latestTurnIndex: "desc" },
        });

        const latestPlayable = latest && isPlayableAdventure(latest) ? latest : null;
        if (latestPlayable) {
          if (process.env.NODE_ENV === "development") {
            console.log("PLAY BOOTSTRAP ACTION", "resume-latest");
            console.log("PLAY BOOTSTRAP ADVENTURE", latestPlayable.id);
          }
          return redirect(`/play?adventureId=${latestPlayable.id}`);
        }

        const scenario = await prisma.scenario.findFirst({
          where: { visibility: "PUBLIC" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

        if (scenario) {
          if (process.env.NODE_ENV === "development") {
            console.log("PLAY BOOTSTRAP ACTION", "create-from-scenario");
            console.log("PLAY BOOTSTRAP SCENARIO", scenario.id);
          }
          const newAdventureId = randomUUID();
          const created = await createAdventureFromScenarioId({
            tx: prisma,
            adventureId: newAdventureId,
            scenarioId: scenario.id,
            ownerId: user.id,
          });
          if (process.env.NODE_ENV === "development") {
            console.log("PLAY BOOTSTRAP CREATED ADVENTURE", created.adventureId);
          }
          return redirect(`/play?adventureId=${created.adventureId}`);
        }

        return (
          <div className="relative z-10">
            <div className="rounded-xl border border-red-500 bg-red-500/10 p-6 text-center text-sm text-red-100">
              <p className="font-semibold">No scenarios available</p>
              <p className="text-xs text-red-200">Chronicle could not find any public scenarios to bootstrap.</p>
            </div>
          </div>
        );
      } else {
        persistedAdventureOwnerId = playableAdventure.ownerId ?? null;
        rawState = requestedAdventureState;
        const resolutionToString = (value: unknown): string => {
          if (typeof value === "string") return value;
          if (value === null || value === undefined) return "";
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        };
        turns = (playableAdventure.turns ?? []).map((row) => {
          const resolutionText = resolutionToString(row.resolution);
          const turn: PlayTurn = {
            id: row.id,
            turnIndex: row.turnIndex,
            playerInput: row.playerInput,
            scene: row.scene,
            resolution: resolutionText,
            resolutionJson: row.resolution,
            stateDeltas: Array.isArray(row.stateDeltas) ? row.stateDeltas : [],
            ledgerAdds: Array.isArray(row.ledgerAdds) ? row.ledgerAdds : [],
            createdAt: row.createdAt.toISOString(),
            presentation: {
              resolution: null,
              narration: null,
              ledgerEntries: [],
            },
          };
          turn.presentation = buildPlayTurnPresentation(turn);
          return turn;
        });
      }
    } catch (error) {
      if (isAdventureOwnershipError(error) && error.code === "ADVENTURE_FORBIDDEN") {
        notFound();
      }
      throw error;
    }
  }
  const latestTurnIndex = turns[0]?.turnIndex;
  const latestTurn = turns[0] ?? null;
  const locationStat = statePanel.stats.find((stat) => stat.key.toLowerCase() === "location");
  const formatStateValue = (value: PlayStateValue | null | undefined) =>
    value === null || value === undefined ? "n/a" : String(value);
  const debugAdventureId = adventureId ?? "n/a";
  const debugOwnerId = persistedAdventureOwnerId ?? "n/a";
  const debugLocation = formatStateValue(locationStat?.value);
  const isProtectedRun = adventureId ? PROTECTED_ADVENTURE_IDS.has(adventureId) : false;
  const debugStripClasses = isProtectedRun
    ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
    : "border-white/10 bg-white/5 text-white/60";

  const getStatValue = (key: string): PlayStateValue | null => {
    const match = statePanel.stats.find((stat) => stat.key.toLowerCase() === key.toLowerCase());
    return match ? match.value : null;
  };
  const state = (rawState ?? {}) as Record<string, unknown>;
  const currentScene = state.currentScene as Record<string, unknown> | null;
  const turn0Scene = turns[0]?.scene ?? null;
  const resolvedSceneText = resolveOpeningSceneText({
    latestTurnScene: latestTurn?.scene ?? null,
    stateCurrentSceneText: typeof currentScene?.text === "string" ? currentScene.text : null,
    fallbackTurnScene: turn0Scene,
  });
  const resolvedSceneKey =
    typeof currentScene?.key === "string" && currentScene.key.trim().length > 0
      ? currentScene.key
      : latestTurn?.sceneKey ?? null;
  const sceneArtKey = resolvedSceneKey;
  const sceneVisualState = resolveSceneVisualState(rawState ?? undefined);
  const sceneFramingState = resolveSceneFramingState({
    turn: latestTurn,
    visual: sceneVisualState,
  });
  const sceneSubjectState = resolveSceneSubjectState({
    state: rawState,
    framing: sceneFramingState,
  });
  const sceneActorState = resolveSceneActorState({
    state: rawState,
    subject: sceneSubjectState,
  });
  const sceneFocusState = resolveSceneFocusState({
    state: rawState,
    framing: sceneFramingState,
    subject: sceneSubjectState,
    actor: sceneActorState,
  });
  const resolvedSceneImage = await loadResolvedSceneImage({
    sceneKey: sceneArtKey,
    locationBackdropUrl: null,
    defaultImageUrl: DEFAULT_SCENE_FALLBACK_URL,
    currentSceneState: currentScene ?? null,
  });
  const shouldReuseResolvedSceneArt =
    resolvedSceneImage.status === "ready" &&
    !!resolvedSceneImage.imageUrl &&
    !!sceneArtKey;
  const sceneArt = shouldReuseResolvedSceneArt
    ? {
        sceneKey: sceneArtKey,
        basePrompt: resolvedSceneText || undefined,
        promptHash: resolvedSceneImage.promptHash ?? null,
      }
    : buildCanonicalSceneArtPayload({
        turn: latestTurn,
        state: rawState,
      });
  const canonicalPayloadIdentity =
    sceneArt && "basePrompt" in sceneArt && sceneArt.basePrompt
      ? buildSceneArtLookupIdentity(sceneArt as SceneArtPayload)
      : null;
  const sceneArtIdentitySource =
    canonicalPayloadIdentity ?? {
      sceneKey: sceneArt?.sceneKey ?? sceneArtKey,
      promptHash: sceneArt?.promptHash ?? resolvedSceneImage.promptHash ?? null,
    };
  const currentSceneIdentity = resolveCanonicalSceneIdentity(sceneArtIdentitySource);
  const resolvedSceneArtRow =
    currentSceneIdentity.sceneKey && currentSceneIdentity.promptHash
      ? await prisma.sceneArt.findUnique({
          where: {
            sceneKey_promptHash: {
              sceneKey: currentSceneIdentity.sceneKey,
              promptHash: currentSceneIdentity.promptHash,
            },
          },
        })
      : null;
  const previousSceneIdentity = resolveCanonicalSceneIdentity(null);
  const sceneRefreshDecision = resolveSceneRefreshDecision({
    transitionType: null,
    current: currentSceneIdentity,
    previous: previousSceneIdentity,
    currentReady: resolvedSceneImage.status === "ready",
    previousReady: false,
  });
  const artRow = resolvedSceneArtRow;
  const artStatus = artRow?.status ?? null;
  const artImageUrl = artRow?.imageUrl ?? null;
  const artReady = artRow?.status === "ready" && Boolean(artImageUrl);
  console.log("scene.art.presentation", {
    currentSceneKey: currentSceneIdentity.sceneKey,
    artStatus,
    promptHash: currentSceneIdentity.promptHash,
    ready: artReady,
  });
  const visualDeltas = buildVisualDeltasFromLedger(latestTurn?.ledgerAdds ?? []);
  const sceneImageCaption =
    artReady &&
    artImageUrl &&
    visualDeltas.length > 0
      ? getSceneImageUpdateCaption(visualDeltas)
      : null;

  const initialSceneArt = artRow
    ? {
        sceneKey: currentSceneIdentity.sceneKey,
        promptHash: currentSceneIdentity.promptHash,
        status: artStatus ?? undefined,
        imageUrl: artReady ? artImageUrl : null,
      }
    : null;

  console.log("play.server.scene_art_prop", {
    initialSceneArt,
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <pre className="text-xs text-white/60">
        {JSON.stringify(
          {
            currentScene: (rawState ?? {})?.currentScene ?? null,
            turn0Scene: turns[0]?.scene ?? null,
            resolvedSceneKey,
            resolvedSceneText,
          },
          null,
          2,
        )}
      </pre>
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5 text-[10px] ${debugStripClasses}`}
      >
        <span>Adventure: {debugAdventureId}</span>
        <span className="ml-2">Turn: {latestTurnIndex !== undefined ? latestTurnIndex : "n/a"}</span>
        <span className="ml-2">Location: {debugLocation}</span>
        <span className="ml-2">Owner: {debugOwnerId}</span>
        <span className={`ml-2 font-semibold ${isProtectedRun ? "text-rose-200" : "text-emerald-200"}`}>
          {isProtectedRun ? "Protected run" : "Sandbox run"}
        </span>
      </div>
      <section className="mb-6 rounded-2xl border border-white/10 bg-black/60 p-4 text-white">
        <div className="mb-2 text-xs uppercase tracking-[0.3em] text-white/60">Scene</div>
        <p className="text-base leading-7 text-white">
          {resolvedSceneText || "The scene will appear once a turn resolves."}
        </p>
      </section>
      <Suspense fallback={<div className="mt-6 text-sm text-gray-500">Loading play controls...</div>}>
        <PlayClient
          adventureId={adventureId}
          scenarioId={scenarioId}
          turns={turns}
          statePanel={statePanel}
          currentScenario={currentScenario}
          dbOffline={dbOffline}
          sceneImage={initialSceneArt}
          sceneImageCaption={sceneImageCaption}
          sceneRefreshDecision={sceneRefreshDecision}
          sceneKey={resolvedSceneKey}
          sceneText={resolvedSceneText ?? null}
          sceneStylePreset={null}
          sceneRenderMode="full"
        />
      </Suspense>
    </main>
  );
}
