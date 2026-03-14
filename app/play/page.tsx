import PlayClient from "./client";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { PlayScenarioMeta, PlayStatePanel, PlayStateValue, PlayTurn } from "./types";
import AuthRequiredState from "@/components/auth/AuthRequiredState";
import {
  getOrClaimAdventureForUser,
  isAdventureOwnershipError,
} from "@/lib/adventure/ownership";
import { getOptionalUser } from "@/lib/api/identity";
import { prisma } from "@/lib/prisma";
import { SceneArtPayload } from "@/lib/sceneArt";
import {
  presentMajorSceneTags,
  presentNpcCuesForPrompt,
  presentNpcStateForSceneKey,
  presentSceneArt,
} from "@/lib/presenters/presentSceneArt";
import { ResolvedSceneImage } from "@/lib/sceneArt";
import { loadResolvedSceneImage } from "@/lib/loadResolvedSceneImage";

const PROTECTED_ADVENTURE_IDS = new Set(["canon_ui", "sandbox", "replay_lab", "dev_run"]);
const DEV_DEFAULT_ADVENTURE = "85e17a2c-c8a9-4c48-9186-2ed7e3e9d983";
const DEFAULT_SCENE_FALLBACK_URL = "/default-scene.svg";

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

export default async function PlayPage({
  searchParams,
}: {
  searchParams?: Promise<{ adventureId?: string; scenarioId?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedAdventureId =
    typeof resolvedSearchParams.adventureId === "string" ? resolvedSearchParams.adventureId : undefined;
  const adventureId =
    process.env.NODE_ENV === "development"
      ? requestedAdventureId ?? DEV_DEFAULT_ADVENTURE
      : requestedAdventureId ?? null;
  const scenarioId = resolvedSearchParams.scenarioId ?? null;
  const user = getOptionalUser(await headers());

  if (!user) {
    const nextPath = adventureId ? `/play?adventureId=${encodeURIComponent(adventureId)}` : "/play";
    return (
      <AuthRequiredState
        title="Sign in to play"
        message="Play, resume, and turn execution are private surfaces."
        nextPath={nextPath}
      />
    );
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
      try {
        const ownership = await getOrClaimAdventureForUser({
          db: prisma,
          adventureId,
          userId: user.id,
        });
        if (!ownership.adventure) {
          return (
            <PlayClient
              adventure={null}
              turns={[]}
              statePanel={statePanel}
              currentScenario={currentScenario}
              dbOffline={false}
              adventureId={adventureId ?? null}
              scenarioId={scenarioId}
            />
          );
        }
      } catch (error) {
        if (isAdventureOwnershipError(error) && error.code === "ADVENTURE_FORBIDDEN") {
          notFound();
        }
        throw error;
      }

      const adventure = await prisma.adventure.findUnique({
        where: { id: adventureId },
        select: { state: true, ownerId: true },
      });
      persistedAdventureOwnerId = adventure?.ownerId ?? null;

      if (!adventure) {
        turns = [];
        rawState = null;
      } else {
        const rows = await prisma.turn.findMany({
          where: { adventureId },
          orderBy: { turnIndex: "desc" },
          take: 3,
          select: {
            id: true,
            turnIndex: true,
            playerInput: true,
            scene: true,
            resolution: true,
            stateDeltas: true,
            ledgerAdds: true,
            createdAt: true,
          },
        });
        statePanel = normalizeStatePanel(adventure?.state);
        rawState = adventure?.state ?? null;
        const stateScenarioMeta = readScenarioMetaFromState(adventure?.state);
        const resolvedScenarioId = stateScenarioMeta?.id ?? scenarioId;
        if (typeof resolvedScenarioId === "string" && resolvedScenarioId.trim()) {
          const scenario = await prisma.scenario.findUnique({
            where: { id: resolvedScenarioId },
            select: { id: true, title: true, summary: true },
          });
          currentScenario = scenario
            ? {
                id: scenario.id,
                title: scenario.title,
                summary: scenario.summary,
              }
            : (stateScenarioMeta ?? {
                id: resolvedScenarioId,
                title: "Unknown scenario",
                summary: null,
              });
        }
        turns = rows.map((row) => {
          const resolutionRaw = row.resolution;
          const resolutionText =
            typeof resolutionRaw === "string"
              ? resolutionRaw
              : JSON.stringify(resolutionRaw, null, 2);
          return {
            id: row.id,
            turnIndex: row.turnIndex,
            playerInput: row.playerInput,
            scene: row.scene,
            resolution: resolutionText,
            resolutionJson: resolutionRaw,
            stateDeltas: Array.isArray(row.stateDeltas) ? row.stateDeltas : [],
            ledgerAdds: Array.isArray(row.ledgerAdds) ? row.ledgerAdds : [],
            createdAt: row.createdAt.toISOString(),
          };
        });
      }
    } catch (error) {
      console.error("Play route DB fallback:", error);
      dbOffline = true;
      persistedAdventureOwnerId = null;
      turns = [];
    }
  }
  const latestTurnIndex = turns[0]?.turnIndex;
  const latestTurn = turns[0] ?? null;
  const pressureValue = statePanel.pressureStage ?? null;
  const locationStat = statePanel.stats.find((stat) => stat.key.toLowerCase() === "location");
  const formatStateValue = (value: PlayStateValue | null | undefined) =>
    value === null || value === undefined ? "n/a" : String(value);
  const debugAdventureId = adventureId ?? "n/a";
  const debugOwnerId = persistedAdventureOwnerId ?? "n/a";
  const debugPressure = formatStateValue(pressureValue);
  const debugLocation = formatStateValue(locationStat?.value);
  const isProtectedRun = adventureId ? PROTECTED_ADVENTURE_IDS.has(adventureId) : false;
  const debugStripClasses = isProtectedRun
    ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
    : "border-white/10 bg-white/5 text-white/60";

  const getStatValue = (key: string): PlayStateValue | null => {
    const match = statePanel.stats.find((stat) => stat.key.toLowerCase() === key.toLowerCase());
    return match ? match.value : null;
  };
  const locationValue = getStatValue("location");
  const timeValue = getStatValue("time");
  const locationId = typeof locationValue === "string" ? locationValue : "unknown-location";
  const locationText = typeof locationValue === "string" ? locationValue : "Unknown location";
  const timeBucket = typeof timeValue === "string" ? timeValue : "unknown-time";
  const timeText = typeof timeValue === "string" ? timeValue : "Unknown time";
  const pressureStageValue = (statePanel.pressureStage ?? "calm").toLowerCase();
  const pressureTextValue = getStatValue("pressure stage") ?? pressureStageValue;

  const sceneArtPayload: SceneArtPayload | null = latestTurn
    ? presentSceneArt({
        title: latestTurn.scene,
        locationId,
        locationText,
        timeBucket,
        timeText,
        pressureStage: pressureStageValue,
        pressureText: typeof pressureTextValue === "string" ? pressureTextValue : String(pressureTextValue ?? pressureStageValue),
        npcState: presentNpcStateForSceneKey(rawState),
        npcCues: presentNpcCuesForPrompt(rawState),
        majorTags: presentMajorSceneTags(latestTurn, rawState),
        appearanceCues: [],
      })
    : null;
  const resolvedSceneImage = await loadResolvedSceneImage({
    sceneKey: sceneArtPayload?.sceneKey ?? null,
    previousSceneKey: null,
    locationBackdropUrl: null,
    defaultImageUrl: DEFAULT_SCENE_FALLBACK_URL,
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5 text-[10px] ${debugStripClasses}`}
      >
        <span>Adventure: {debugAdventureId}</span>
        <span className="ml-2">Turn: {latestTurnIndex !== undefined ? latestTurnIndex : "n/a"}</span>
        <span className="ml-2">Pressure: {debugPressure}</span>
        <span className="ml-2">Location: {debugLocation}</span>
        <span className="ml-2">Owner: {debugOwnerId}</span>
        <span className={`ml-2 font-semibold ${isProtectedRun ? "text-rose-200" : "text-emerald-200"}`}>
          {isProtectedRun ? "Protected run" : "Sandbox run"}
        </span>
      </div>
      <Suspense fallback={<div className="mt-6 text-sm text-gray-500">Loading play controls...</div>}>
        <PlayClient
          adventureId={adventureId}
          scenarioId={scenarioId}
          turns={turns}
          statePanel={statePanel}
          currentScenario={currentScenario}
          dbOffline={dbOffline}
          sceneImage={resolvedSceneImage}
        />
      </Suspense>
    </main>
  );
}
