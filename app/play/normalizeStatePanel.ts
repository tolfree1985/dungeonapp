import type { PlayStatePanel, PlayStateValue } from "./types";
import { deriveMechanicFacts } from "@/lib/engine/presentation/mechanicFacts";

export function asRecord(value: unknown): Record<string, unknown> | null {
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

export function normalizeStatePanel(state: unknown): PlayStatePanel {
  const root = asRecord(state);
  const statsSource = asRecord(readSection(root, "stats"));
  const inventorySource = readSection(root, "inventory");
  const questsSource = readSection(root, "quests");
  const relationshipsSource = readSection(root, "relationships");
  const flagsSource =
    asRecord(readSection(root, "flags")) ??
    asRecord(root?.flags) ??
    asRecord(readSection(root, "stateFlags")) ??
    asRecord(root?.state?.flags) ??
    null;

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

  const rawInventoryItems = (() => {
    if (Array.isArray(inventorySource)) return inventorySource;
    const inventoryRecord = asRecord(inventorySource);
    if (inventoryRecord && Array.isArray(inventoryRecord.items)) return inventoryRecord.items;
    return [];
  })();
  const mapInventoryItem = (item: unknown, index: number) => {
    if (typeof item === "string") return { name: item };
    const record = asRecord(item);
    return {
      name: describeValue(record?.name ?? record?.id ?? item) ?? `Item ${index + 1}`,
      detail: describeValue(record?.detail ?? record?.description ?? record?.qty ?? record?.count),
    };
  };
  const inventory = rawInventoryItems.map(mapInventoryItem);

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

  const statsMap: Record<string, unknown> = {};
  if (statsSource) {
    for (const [key, value] of Object.entries(statsSource)) {
      statsMap[key.toLowerCase()] = value;
    }
  }

  const mechanicFacts = deriveMechanicFacts({
    stateFlags: flagsSource,
    stateDeltas: [],
    stats: statsMap,
  });

  return {
    pressureStage,
    stats,
    inventory,
    quests,
    relationships,
    flags: flagsSource,
    summary: mechanicFacts,
  };
}
