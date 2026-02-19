import { replayStateFromTurnJson } from "../game/replay";

type ReplayEvent = { seq: number; turnJson: any };

export const SUPPORT_MANIFEST_VERSION = 1 as const;
export const TELEMETRY_VERSION = 1 as const;

export interface SupportManifestV1 {
  manifestVersion: typeof SUPPORT_MANIFEST_VERSION;
  bundleId?: string;
  engineVersion?: string;
  scenarioContentHash?: string;
  adventureId?: string;
  buildVersion?: string;
  replay: {
    finalStateHash: string;
    turnCount: number;
    telemetryVersion: typeof TELEMETRY_VERSION;
  };
  telemetry: {
    totalLedgerEntries: number;
    totalStateDeltas: number;
    maxDeltaPerTurn: number;
    avgDeltaPerTurn: number;
    maxLedgerPerTurn: number;
  };
  perTurn: Array<{
    turnIndex: number;
    deltaCount: number;
    ledgerCount: number;
    hasResolution: boolean;
  }>;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readPath(bundle: unknown, path: string[]): unknown {
  let current: unknown = bundle;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function readPathString(bundle: unknown, candidates: string[][]): string {
  for (const candidate of candidates) {
    const value = readPath(bundle, candidate);
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function asSeq(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

function toTurnJson(source: any): any {
  const direct = source?.turnJson;
  if (direct && typeof direct === "object") {
    const deltas = Array.isArray(direct.deltas)
      ? direct.deltas
      : Array.isArray(source?.deltas)
        ? source.deltas
        : Array.isArray(source?.stateDeltas)
          ? source.stateDeltas
          : [];
    return { ...direct, deltas, resolution: direct?.resolution ?? source?.resolution };
  }

  const deltas = Array.isArray(source?.deltas)
    ? source.deltas
    : Array.isArray(source?.stateDeltas)
      ? source.stateDeltas
      : [];

  return {
    deltas,
    ledgerAdds: Array.isArray(source?.ledgerAdds) ? source.ledgerAdds : [],
    resolution: source?.resolution,
  };
}

function extractEvents(bundle: unknown, turnLimit?: number): ReplayEvent[] {
  const root = isRecord(bundle) ? bundle : {};
  const rawEvents = Array.isArray(root.events) ? root.events : Array.isArray(root.turns) ? root.turns : [];
  const mapped = rawEvents.map((raw: any, index: number) => ({
    seq: asSeq(raw?.seq ?? raw?.turnIndex, index),
    turnJson: toTurnJson(raw),
  }));
  mapped.sort((a, b) => a.seq - b.seq);
  if (typeof turnLimit === "number" && Number.isInteger(turnLimit)) {
    return mapped.filter((event) => event.seq <= turnLimit);
  }
  return mapped;
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry));
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      out[key] = stableNormalize(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function buildOrderedManifest(manifest: SupportManifestV1): Record<string, unknown> {
  return {
    manifestVersion: manifest.manifestVersion,
    ...(manifest.bundleId !== undefined ? { bundleId: manifest.bundleId } : {}),
    ...(manifest.engineVersion !== undefined ? { engineVersion: manifest.engineVersion } : {}),
    ...(manifest.scenarioContentHash !== undefined ? { scenarioContentHash: manifest.scenarioContentHash } : {}),
    ...(manifest.adventureId !== undefined ? { adventureId: manifest.adventureId } : {}),
    ...(manifest.buildVersion !== undefined ? { buildVersion: manifest.buildVersion } : {}),
    replay: {
      finalStateHash: manifest.replay.finalStateHash,
      turnCount: manifest.replay.turnCount,
      telemetryVersion: manifest.replay.telemetryVersion,
    },
    telemetry: {
      totalLedgerEntries: manifest.telemetry.totalLedgerEntries,
      totalStateDeltas: manifest.telemetry.totalStateDeltas,
      maxDeltaPerTurn: manifest.telemetry.maxDeltaPerTurn,
      avgDeltaPerTurn: manifest.telemetry.avgDeltaPerTurn,
      maxLedgerPerTurn: manifest.telemetry.maxLedgerPerTurn,
    },
    perTurn: manifest.perTurn.map((row) => ({
      turnIndex: row.turnIndex,
      deltaCount: row.deltaCount,
      ledgerCount: row.ledgerCount,
      hasResolution: row.hasResolution,
    })),
  };
}

export function serializeSupportManifest(manifest: SupportManifestV1): string {
  return JSON.stringify(buildOrderedManifest(manifest));
}

export async function sha256HexFromText(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("crypto.subtle unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashSupportManifest(manifest: SupportManifestV1): Promise<string> {
  return sha256HexFromText(serializeSupportManifest(manifest));
}

export function assertSupportManifestConsistency(manifest: SupportManifestV1): void {
  if (manifest.perTurn.length !== manifest.replay.turnCount) {
    throw new Error("SUPPORT_MANIFEST_INTEGRITY_ERROR: perTurn length mismatch");
  }

  const totalLedger = manifest.perTurn.reduce((sum, row) => sum + row.ledgerCount, 0);
  if (totalLedger !== manifest.telemetry.totalLedgerEntries) {
    throw new Error("SUPPORT_MANIFEST_INTEGRITY_ERROR: telemetry totalLedgerEntries mismatch");
  }

  const totalDeltas = manifest.perTurn.reduce((sum, row) => sum + row.deltaCount, 0);
  if (totalDeltas !== manifest.telemetry.totalStateDeltas) {
    throw new Error("SUPPORT_MANIFEST_INTEGRITY_ERROR: telemetry totalStateDeltas mismatch");
  }
}

export async function buildSupportManifestFromBundle(
  bundleJson: unknown,
  options?: { turnLimit?: number },
): Promise<SupportManifestV1> {
  const events = extractEvents(bundleJson, options?.turnLimit);

  const perTurn = events
    .map((event) => {
      const deltaCount = Array.isArray(event?.turnJson?.deltas) ? event.turnJson.deltas.length : 0;
      const ledgerCount = Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0;
      const hasResolution = event?.turnJson?.resolution !== undefined && event?.turnJson?.resolution !== null;
      return { turnIndex: event.seq, deltaCount, ledgerCount, hasResolution };
    })
    .sort((a, b) => a.turnIndex - b.turnIndex);

  const turnCount = perTurn.length;
  const totalLedgerEntries = perTurn.reduce((sum, row) => sum + row.ledgerCount, 0);
  const totalStateDeltas = perTurn.reduce((sum, row) => sum + row.deltaCount, 0);
  const maxDeltaPerTurn = perTurn.reduce((max, row) => (row.deltaCount > max ? row.deltaCount : max), 0);
  const maxLedgerPerTurn = perTurn.reduce((max, row) => (row.ledgerCount > max ? row.ledgerCount : max), 0);
  const avgDeltaPerTurn = Number((totalStateDeltas / Math.max(turnCount, 1)).toFixed(6));

  let finalStateHash = "";
  if (events.length > 0) {
    const state = replayStateFromTurnJson(events);
    finalStateHash = await sha256HexFromText(stableStringify(state));
  }

  const bundleId = readPathString(bundleJson, [["bundleId"], ["debug", "bundleId"]]);
  const engineVersion = readPathString(bundleJson, [["engineVersion"], ["engine", "version"], ["debug", "engineVersion"]]);
  const scenarioContentHash = readPathString(bundleJson, [
    ["scenarioContentHash"],
    ["scenario", "contentHash"],
    ["debug", "scenarioContentHash"],
  ]);
  const adventureId = readPathString(bundleJson, [["adventureId"], ["adventure", "id"], ["debug", "adventureId"]]);
  const buildVersion = readPathString(bundleJson, [["buildVersion"], ["build", "version"], ["debug", "buildVersion"]]);

  const manifest: SupportManifestV1 = {
    manifestVersion: SUPPORT_MANIFEST_VERSION,
    bundleId: bundleId || undefined,
    engineVersion: engineVersion || undefined,
    scenarioContentHash: scenarioContentHash || undefined,
    adventureId: adventureId || undefined,
    buildVersion: buildVersion || undefined,
    replay: {
      finalStateHash,
      turnCount,
      telemetryVersion: TELEMETRY_VERSION,
    },
    telemetry: {
      totalLedgerEntries,
      totalStateDeltas,
      maxDeltaPerTurn,
      avgDeltaPerTurn,
      maxLedgerPerTurn,
    },
    perTurn,
  };

  assertSupportManifestConsistency(manifest);
  return manifest;
}
