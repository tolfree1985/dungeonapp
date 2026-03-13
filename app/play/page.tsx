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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
      ? requestedAdventureId ?? "sandbox"
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
        turns = rows.map((row) => ({
          id: row.id,
          turnIndex: row.turnIndex,
          playerInput: row.playerInput,
          scene: row.scene,
          resolution:
            typeof row.resolution === "string"
              ? row.resolution
              : JSON.stringify(row.resolution, null, 2),
          stateDeltas: Array.isArray(row.stateDeltas) ? row.stateDeltas : [],
          ledgerAdds: Array.isArray(row.ledgerAdds) ? row.ledgerAdds : [],
          createdAt: row.createdAt.toISOString(),
        }));
      }
    } catch (error) {
      console.error("Play route DB fallback:", error);
      dbOffline = true;
      persistedAdventureOwnerId = null;
      turns = [];
    }
  }
  const latestTurnIndex = turns[0]?.turnIndex;
  const pressureValue = statePanel.pressureStage ?? null;
  const locationStat = statePanel.stats.find((stat) => stat.key.toLowerCase() === "location");
  const formatStateValue = (value: PlayStateValue | null | undefined) =>
    value === null || value === undefined ? "n/a" : String(value);
  const debugAdventureId = adventureId ?? "n/a";
  const debugOwnerId = persistedAdventureOwnerId ?? "n/a";
  const debugPressure = formatStateValue(pressureValue);
  const debugLocation = formatStateValue(locationStat?.value);
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
        <span>Adventure: {debugAdventureId}</span>
        <span className="ml-2">Turn: {latestTurnIndex !== undefined ? latestTurnIndex : "n/a"}</span>
        <span className="ml-2">Pressure: {debugPressure}</span>
        <span className="ml-2">Location: {debugLocation}</span>
        <span className="ml-2">Owner: {debugOwnerId}</span>
      </div>
      <Suspense fallback={<div className="mt-6 text-sm text-gray-500">Loading play controls...</div>}>
        <PlayClient
          adventureId={adventureId}
          scenarioId={scenarioId}
          turns={turns}
          statePanel={statePanel}
          currentScenario={currentScenario}
          dbOffline={dbOffline}
        />
      </Suspense>
    </main>
  );
}
