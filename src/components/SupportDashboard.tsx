"use client";

import { useEffect, useMemo, useState } from "react";
import { categorizeDeltaPath } from "@/lib/support/deltaPathMeaningMap";
import { buildDeterministicReproCliText } from "@/lib/support/buildDeterministicReproCliText";
import { buildSupportShareBlockText } from "@/lib/support/buildSupportShareBlockText";
import { buildSupportTurnReproBlockText } from "@/lib/support/buildSupportTurnReproBlockText";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  buildSupportManifestFromBundle,
  hashSupportManifest,
  serializeSupportManifest,
  type SupportManifestV1,
} from "@/lib/support/supportManifest";

type RunbookLink = {
  label: string;
  path: string;
  exists: boolean;
};

type RunbookSectionCheck = {
  label: string;
  exists: boolean;
};

type RunbookSection = {
  label: string;
  exists: boolean;
  text: string;
};

type FixtureOption = {
  name: string;
  content: string;
};

type SupportDashboardProps = {
  debugEndpointAvailable: boolean;
  runbookLinks: RunbookLink[];
  runbookSectionChecks: RunbookSectionCheck[];
  runbookSections: RunbookSection[];
  fixtureOptions: FixtureOption[];
};

type DiffRow = {
  path: string;
  kind: "added" | "removed" | "changed";
  left: string;
  right: string;
};

type BundleMetadata = {
  engineVersion: string;
  scenarioContentHash: string;
  adventureId: string;
  latestTurnIndex: string;
  buildVersion: string;
};

type TurnRow = {
  turnKey: string;
  turnIndex: string;
  playerInput: string;
  resolution: string;
  narrative: string;
  stateDeltas: unknown[];
  ledgerAdds: unknown[];
  rawTurn: unknown;
};

type MetadataFieldSpec = {
  key: keyof BundleMetadata;
  label: string;
  required: boolean;
  paths: string[][];
};

type SequenceIntegrityStatus = {
  isGreen: boolean;
  label: string;
  cls: string;
  details: string[];
};

type ReplayTelemetryDerived = {
  turnCount: number;
  totalLedgerEntries: number;
  totalStateDeltaCount: number;
  maxDeltaPerTurn: number;
  avgDeltaPerTurn: number;
  maxLedgerPerTurn: number;
  finalStateHash: string;
};

type PerTurnTelemetryRow = {
  turnIndex: number;
  deltaCount: number;
  ledgerCount: number;
  hasResolution: boolean;
};

type ReplayTelemetryReference = {
  turnCount: number | null;
  totalLedgerEntries: number | null;
  totalStateDeltaCount: number | null;
  maxDeltaPerTurn: number | null;
  avgDeltaPerTurn: number | null;
  maxLedgerPerTurn: number | null;
  finalStateHash: string;
};

type DriftLocator = {
  turnIndex: number | null;
  metric: string;
  derived: PerTurnTelemetryRow | null;
  reference: PerTurnTelemetryRow | null;
} | null;

const LARGE_DELTA_THRESHOLD = 8;

const METADATA_FIELD_SPECS: MetadataFieldSpec[] = [
  {
    key: "engineVersion",
    label: "engineVersion",
    required: true,
    paths: [["engineVersion"], ["engine", "version"], ["debug", "engineVersion"]],
  },
  {
    key: "scenarioContentHash",
    label: "scenarioContentHash",
    required: true,
    paths: [["scenarioContentHash"], ["scenario", "contentHash"], ["debug", "scenarioContentHash"]],
  },
  {
    key: "adventureId",
    label: "adventureId",
    required: false,
    paths: [["adventureId"], ["adventure", "id"], ["debug", "adventureId"]],
  },
  {
    key: "latestTurnIndex",
    label: "latestTurnIndex",
    required: false,
    paths: [["latestTurnIndex"], ["adventure", "latestTurnIndex"], ["debug", "latestTurnIndex"]],
  },
  {
    key: "buildVersion",
    label: "buildVersion",
    required: false,
    paths: [["buildVersion"], ["build", "version"], ["debug", "buildVersion"]],
  },
];

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function prettyStableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry) => normalize(entry));
    }
    if (isRecord(input)) {
      const out: Record<string, unknown> = {};
      const keys = Object.keys(input).sort(compareText);
      for (const key of keys) {
        out[key] = normalize(input[key]);
      }
      return out;
    }
    return input;
  };

  return JSON.stringify(normalize(value), null, 2);
}

function redactSensitiveText(input: string): string {
  let out = input;
  out = out.replace(/\b[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, "[REDACTED_JWT]");
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  out = out.replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[REDACTED_TOKEN]");
  return out;
}

function collectLeafPaths(value: unknown, path: string, out: Map<string, string>) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(path || "$", "[]");
      return;
    }
    value.forEach((entry, index) => {
      const childPath = path ? `${path}[${index}]` : `[${index}]`;
      collectLeafPaths(entry, childPath, out);
    });
    return;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    if (keys.length === 0) {
      out.set(path || "$", "{}");
      return;
    }
    keys.forEach((key) => {
      const childPath = path ? `${path}.${key}` : key;
      collectLeafPaths(value[key], childPath, out);
    });
    return;
  }

  out.set(path || "$", stableStringify(value));
}

function buildDiffRows(left: unknown, right: unknown): DiffRow[] {
  const leftLeaves = new Map<string, string>();
  const rightLeaves = new Map<string, string>();
  collectLeafPaths(left, "", leftLeaves);
  collectLeafPaths(right, "", rightLeaves);

  const paths = new Set<string>([...leftLeaves.keys(), ...rightLeaves.keys()]);
  const sortedPaths = [...paths].sort(compareText);

  const rows: DiffRow[] = [];
  for (const path of sortedPaths) {
    const l = leftLeaves.get(path);
    const r = rightLeaves.get(path);

    if (l === undefined && r !== undefined) {
      rows.push({ path, kind: "added", left: "(none)", right: r });
      continue;
    }

    if (l !== undefined && r === undefined) {
      rows.push({ path, kind: "removed", left: l, right: "(none)" });
      continue;
    }

    if (l !== undefined && r !== undefined && l !== r) {
      rows.push({ path, kind: "changed", left: l, right: r });
    }
  }

  return rows;
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

function readPathArray(bundle: unknown, candidates: string[][]): unknown[] {
  for (const candidate of candidates) {
    const value = readPath(bundle, candidate);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readPathNumber(bundle: unknown, candidates: string[][]): number | null {
  for (const candidate of candidates) {
    const value = readPath(bundle, candidate);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const n = Number(value.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readPathPerTurnTelemetry(bundle: unknown, candidates: string[][]): PerTurnTelemetryRow[] {
  for (const candidate of candidates) {
    const value = readPath(bundle, candidate);
    if (!Array.isArray(value)) continue;

    const rows: PerTurnTelemetryRow[] = [];
    for (let index = 0; index < value.length; index++) {
      const row = value[index];
      if (!isRecord(row)) continue;

      const turnIndexRaw = row.turnIndex ?? row.TURN_INDEX ?? index;
      const deltaCountRaw = row.deltaCount ?? row.DELTA_COUNT ?? 0;
      const ledgerCountRaw = row.ledgerCount ?? row.LEDGER_COUNT ?? 0;
      const hasResolutionRaw = row.hasResolution ?? row.HAS_RESOLUTION ?? false;

      const turnIndex =
        typeof turnIndexRaw === "number" && Number.isFinite(turnIndexRaw)
          ? Math.trunc(turnIndexRaw)
          : typeof turnIndexRaw === "string" && turnIndexRaw.trim().length > 0 && Number.isFinite(Number(turnIndexRaw))
            ? Math.trunc(Number(turnIndexRaw))
            : index;

      const deltaCount =
        typeof deltaCountRaw === "number" && Number.isFinite(deltaCountRaw)
          ? Math.max(0, Math.trunc(deltaCountRaw))
          : typeof deltaCountRaw === "string" &&
              deltaCountRaw.trim().length > 0 &&
              Number.isFinite(Number(deltaCountRaw))
            ? Math.max(0, Math.trunc(Number(deltaCountRaw)))
            : 0;

      const ledgerCount =
        typeof ledgerCountRaw === "number" && Number.isFinite(ledgerCountRaw)
          ? Math.max(0, Math.trunc(ledgerCountRaw))
          : typeof ledgerCountRaw === "string" &&
              ledgerCountRaw.trim().length > 0 &&
              Number.isFinite(Number(ledgerCountRaw))
            ? Math.max(0, Math.trunc(Number(ledgerCountRaw)))
            : 0;

      const hasResolution =
        typeof hasResolutionRaw === "boolean"
          ? hasResolutionRaw
          : typeof hasResolutionRaw === "string"
            ? hasResolutionRaw.trim().toLowerCase() === "true"
            : false;

      rows.push({ turnIndex, deltaCount, ledgerCount, hasResolution });
    }

    rows.sort((a, b) => (a.turnIndex === b.turnIndex ? 0 : a.turnIndex < b.turnIndex ? -1 : 1));
    return rows;
  }

  return [];
}

function extractMetadata(bundle: unknown): BundleMetadata {
  const result: BundleMetadata = {
    engineVersion: "",
    scenarioContentHash: "",
    adventureId: "",
    latestTurnIndex: "",
    buildVersion: "",
  };

  for (const spec of METADATA_FIELD_SPECS) {
    result[spec.key] = readPathString(bundle, spec.paths);
  }

  return result;
}

function detectBundleShape(bundle: unknown): string {
  if (!isRecord(bundle)) {
    return "shape:none";
  }

  const keys = Object.keys(bundle).sort(compareText);
  if (keys.length === 0) return "shape:empty-object";
  if (keys.includes("turns") && keys.includes("engineVersion")) return "shape:turn-bundle-v1";
  if (keys.includes("debug")) return "shape:debug";
  return `shape:keys:${keys.slice(0, 3).join("+")}`;
}

function extractTelemetryReference(bundle: unknown): ReplayTelemetryReference {
  return {
    turnCount: readPathNumber(bundle, [
      ["telemetry", "turnCount"],
      ["telemetry", "TURN_COUNT"],
      ["replayTelemetry", "turnCount"],
      ["debug", "telemetry", "turnCount"],
    ]),
    totalLedgerEntries: readPathNumber(bundle, [
      ["telemetry", "totalLedgerEntries"],
      ["telemetry", "TOTAL_LEDGER_ENTRIES"],
      ["replayTelemetry", "totalLedgerEntries"],
      ["debug", "telemetry", "totalLedgerEntries"],
    ]),
    totalStateDeltaCount: readPathNumber(bundle, [
      ["telemetry", "totalStateDeltaCount"],
      ["telemetry", "TOTAL_STATE_DELTAS"],
      ["replayTelemetry", "totalStateDeltaCount"],
      ["debug", "telemetry", "totalStateDeltaCount"],
    ]),
    maxDeltaPerTurn: readPathNumber(bundle, [
      ["telemetry", "maxDeltaPerTurn"],
      ["telemetry", "MAX_DELTA_PER_TURN"],
      ["replayTelemetry", "maxDeltaPerTurn"],
      ["debug", "telemetry", "maxDeltaPerTurn"],
    ]),
    avgDeltaPerTurn: readPathNumber(bundle, [
      ["telemetry", "avgDeltaPerTurn"],
      ["telemetry", "AVG_DELTA_PER_TURN"],
      ["replayTelemetry", "avgDeltaPerTurn"],
      ["debug", "telemetry", "avgDeltaPerTurn"],
    ]),
    maxLedgerPerTurn: readPathNumber(bundle, [
      ["telemetry", "maxLedgerPerTurn"],
      ["telemetry", "MAX_LEDGER_PER_TURN"],
      ["replayTelemetry", "maxLedgerPerTurn"],
      ["debug", "telemetry", "maxLedgerPerTurn"],
    ]),
    finalStateHash:
      readPathString(bundle, [
        ["telemetry", "finalStateHash"],
        ["telemetry", "FINAL_STATE_HASH"],
        ["replayTelemetry", "finalStateHash"],
        ["debug", "telemetry", "finalStateHash"],
      ]) || "",
  };
}

function findFirstDrift(
  derivedRows: PerTurnTelemetryRow[],
  referenceRows: PerTurnTelemetryRow[],
): DriftLocator {
  if (referenceRows.length === 0) return null;

  const maxLen = Math.max(derivedRows.length, referenceRows.length);
  for (let i = 0; i < maxLen; i++) {
    const derived = i < derivedRows.length ? derivedRows[i] : null;
    const reference = i < referenceRows.length ? referenceRows[i] : null;
    const turnIndex = derived?.turnIndex ?? reference?.turnIndex ?? null;

    if (!derived || !reference) {
      return { turnIndex, metric: "missing_turn", derived, reference };
    }
    if (derived.deltaCount !== reference.deltaCount) {
      return { turnIndex, metric: "delta_count", derived, reference };
    }
    if (derived.ledgerCount !== reference.ledgerCount) {
      return { turnIndex, metric: "ledger_count", derived, reference };
    }
    if (derived.hasResolution !== reference.hasResolution) {
      return { turnIndex, metric: "has_resolution", derived, reference };
    }
  }

  return null;
}

function extractTurnRows(bundle: unknown): TurnRow[] {
  const turns = readPathArray(bundle, [["turns"]]);
  const rows: TurnRow[] = [];

  turns.forEach((turn, index) => {
    if (!isRecord(turn)) return;

    const turnIndexRaw = turn.turnIndex;
    const turnIndex =
      typeof turnIndexRaw === "number"
        ? String(turnIndexRaw)
        : typeof turnIndexRaw === "string" && turnIndexRaw.trim().length > 0
          ? turnIndexRaw
          : String(index);

    const playerInput =
      (typeof turn.playerInput === "string" && turn.playerInput) ||
      (typeof turn.input === "string" && turn.input) ||
      (typeof turn.playerText === "string" && turn.playerText) ||
      "(none)";

    const resolution =
      typeof turn.resolution === "string"
        ? turn.resolution
        : turn.resolution !== undefined
          ? stableStringify(turn.resolution)
          : "(none)";

    const narrative =
      (typeof turn.assistantText === "string" && turn.assistantText) ||
      (typeof turn.scene === "string" && turn.scene) ||
      "(none)";

    const stateDeltas = Array.isArray(turn.stateDeltas) ? turn.stateDeltas : [];
    const ledgerAdds = Array.isArray(turn.ledgerAdds) ? turn.ledgerAdds : [];

    rows.push({
      turnKey: `${turnIndex}:${index}`,
      turnIndex,
      playerInput,
      resolution,
      narrative,
      stateDeltas,
      ledgerAdds,
      rawTurn: turn,
    });
  });

  return rows;
}

function extractDeltaPath(delta: unknown): string {
  if (!isRecord(delta)) return "";
  const path = delta.path;
  if (typeof path === "string") return path;
  if (Array.isArray(path)) return path.map((part) => String(part)).join(".");
  return "";
}

function summarizeDeltaKinds(deltas: unknown[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const delta of deltas) {
    const tags = categorizeDeltaPath(extractDeltaPath(delta));
    for (const tag of tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        ordered.push(tag);
      }
    }
  }

  return ordered;
}

function parseTurnIndex(value: string, fallback: number): number {
  const n = Number(value);
  if (Number.isInteger(n)) return n;
  return fallback;
}

function readLedgerTurnReference(entry: unknown): string {
  if (!isRecord(entry)) return "";
  const candidates = [entry.refTurnIndex, entry.turnIndex, entry.turn, entry.refEventId];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate)) return String(candidate);
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return "";
}

function truncateText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}...(truncated)`;
}

function computeLedgerEntryCount(bundle: unknown, turnRows: TurnRow[]): number {
  const fromTurns = turnRows.reduce((sum, row) => sum + row.ledgerAdds.length, 0);
  if (fromTurns > 0) return fromTurns;
  return readPathArray(bundle, [["ledgerAdds"]]).length;
}

function computeMemoryCardCount(bundle: unknown): number {
  const cards = readPathArray(bundle, [["memoryCards"], ["memory", "cards"], ["initialState", "memory", "cards"]]);
  return cards.length;
}

function buildIssueBlock(args: {
  bundleId: string;
  engineVersion: string;
  scenarioContentHash: string;
}): string {
  const bundleId = args.bundleId.trim() || "(none)";
  const engineVersion = args.engineVersion.trim() || "(none)";
  const scenarioContentHash = args.scenarioContentHash.trim() || "(none)";

  return [
    "### Repro Steps",
    "1. Open the Support dashboard.",
    "2. Load the bundle in Debug Bundles.",
    "3. Follow the Reproduction Checklist.",
    "",
    "### Expected",
    "Describe expected deterministic behavior.",
    "",
    "### Actual",
    "Describe actual observed behavior.",
    "",
    "### Determinism Checks",
    `Bundle ID: ${bundleId}`,
    `Engine: ${engineVersion}`,
    `Scenario Hash: ${scenarioContentHash}`,
  ].join("\n");
}

function buildRunbookSectionCopyText(section: RunbookSection): string {
  return [`### Runbook Section: ${section.label}`, section.exists ? section.text : "NOT FOUND"].join("\n\n");
}

function JsonTreeNode({ label, value }: { label: string; value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <details open className="ml-2">
        <summary className="cursor-pointer text-xs">{label}: [{value.length}]</summary>
        <div className="mt-1 space-y-1 border-l pl-2">
          {value.map((entry, index) => (
            <JsonTreeNode key={`${label}-${index}`} label={`[${index}]`} value={entry} />
          ))}
        </div>
      </details>
    );
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort(compareText);
    return (
      <details open className="ml-2">
        <summary className="cursor-pointer text-xs">{label}: {'{'}{keys.length}{'}'}</summary>
        <div className="mt-1 space-y-1 border-l pl-2">
          {keys.map((key) => (
            <JsonTreeNode key={`${label}-${key}`} label={key} value={value[key]} />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="ml-2 text-xs">
      {label}: {String(value)}
    </div>
  );
}

export function SupportDashboard({
  debugEndpointAvailable,
  runbookLinks,
  runbookSectionChecks,
  runbookSections,
  fixtureOptions,
}: SupportDashboardProps) {
  const [bundleId, setBundleId] = useState("");
  const [bundleStatus, setBundleStatus] = useState("No bundle loaded.");
  const [bundleJsonText, setBundleJsonText] = useState("");
  const [bundleJsonStatus, setBundleJsonStatus] = useState("No bundle JSON pasted.");
  const [loadedBundleData, setLoadedBundleData] = useState<unknown | null>(null);
  const [pastedBundleData, setPastedBundleData] = useState<unknown | null>(null);
  const [redactionPreview, setRedactionPreview] = useState(false);
  const [minimalReproMode, setMinimalReproMode] = useState(false);
  const [showMissingDrilldown, setShowMissingDrilldown] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedTurnKey, setSelectedTurnKey] = useState("");
  const [selectedFixtureName, setSelectedFixtureName] = useState(fixtureOptions[0]?.name ?? "");
  const [issueCopyStatus, setIssueCopyStatus] = useState("");
  const [reproCliCopyStatus, setReproCliCopyStatus] = useState("");
  const [shareBlockCopyStatus, setShareBlockCopyStatus] = useState("");
  const [turnReproCopyStatus, setTurnReproCopyStatus] = useState("");
  const [finalStateHash, setFinalStateHash] = useState("");
  const [finalStateHashCopyStatus, setFinalStateHashCopyStatus] = useState("");
  const [supportManifest, setSupportManifest] = useState<SupportManifestV1 | null>(null);
  const [supportManifestJson, setSupportManifestJson] = useState("");
  const [supportManifestHash, setSupportManifestHash] = useState("");
  const [manifestCopyStatus, setManifestCopyStatus] = useState("");
  const [driftReportCopyStatus, setDriftReportCopyStatus] = useState("");
  const [runbookCopyStatus, setRunbookCopyStatus] = useState<Record<string, string>>({});
  const [leftCompareJson, setLeftCompareJson] = useState("");
  const [rightCompareJson, setRightCompareJson] = useState("");

  const fixtureMap = useMemo(() => {
    const map = new Map<string, string>();
    fixtureOptions.forEach((fixture) => {
      map.set(fixture.name, fixture.content);
    });
    return map;
  }, [fixtureOptions]);

  const bundleData = pastedBundleData ?? loadedBundleData;
  const bundleShape = useMemo(() => detectBundleShape(bundleData), [bundleData]);
  const topLevelKeys = useMemo(() => {
    if (!isRecord(bundleData)) return [];
    return Object.keys(bundleData).sort(compareText);
  }, [bundleData]);

  const metadata = useMemo(() => extractMetadata(bundleData), [bundleData]);
  const turnRows = useMemo(() => extractTurnRows(bundleData), [bundleData]);

  const checklistRows = useMemo(
    () =>
      METADATA_FIELD_SPECS.map((spec) => ({
        key: spec.key,
        label: spec.label,
        required: spec.required,
        value: metadata[spec.key],
      })),
    [metadata],
  );

  const missingRequiredFields = useMemo(
    () => checklistRows.filter((row) => row.required && !row.value),
    [checklistRows],
  );
  const missingNonCriticalFields = useMemo(
    () => checklistRows.filter((row) => !row.required && !row.value),
    [checklistRows],
  );

  const integrityBadge = useMemo(() => {
    if (missingRequiredFields.length > 0) {
      return { label: "RED: Missing engineVersion or scenarioContentHash", cls: "text-red-700" };
    }
    if (missingNonCriticalFields.length > 0) {
      return { label: "YELLOW: Missing non-critical fields", cls: "text-amber-700" };
    }
    return { label: "GREEN: Required deterministic invariants present", cls: "text-green-700" };
  }, [missingNonCriticalFields.length, missingRequiredFields.length]);

  const sequenceIntegrity = useMemo<SequenceIntegrityStatus>(() => {
    if (turnRows.length === 0) {
      return {
        isGreen: false,
        label: "RED: Turn sequence integrity missing replay events",
        cls: "text-red-700",
        details: ["No replay events"],
      };
    }

    const parsedIndices = turnRows.map((row, index) => parseTurnIndex(row.turnIndex, index));
    const sorted = [...parsedIndices].sort((a, b) => a - b);
    const unique = new Set<number>(sorted);
    const details: string[] = [];

    if (unique.size !== sorted.length) {
      details.push("Duplicate turnIndex values");
    }

    if (sorted.length > 1) {
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) {
          details.push("Turn indices are not sequential");
          break;
        }
      }
    }

    const knownTurns = new Set<string>(parsedIndices.map((value) => String(value)));
    let invalidLedgerRefs = 0;
    for (const row of turnRows) {
      for (const entry of row.ledgerAdds) {
        const ref = readLedgerTurnReference(entry);
        if (ref && !knownTurns.has(ref)) {
          invalidLedgerRefs += 1;
        }
      }
    }
    if (invalidLedgerRefs > 0) {
      details.push("Ledger references unknown turns");
    }

    if (details.length === 0) {
      return {
        isGreen: true,
        label: "GREEN: Turn sequence integrity valid",
        cls: "text-green-700",
        details: [],
      };
    }

    return {
      isGreen: false,
      label: "RED: Turn sequence integrity failed",
      cls: "text-red-700",
      details,
    };
  }, [turnRows]);

  const issueBlockText = useMemo(
    () =>
      buildIssueBlock({
        bundleId,
        engineVersion: metadata.engineVersion,
        scenarioContentHash: metadata.scenarioContentHash,
      }),
    [bundleId, metadata.engineVersion, metadata.scenarioContentHash],
  );

  const reproCliText = useMemo(
    () =>
      buildDeterministicReproCliText({
        bundleId,
        engineVersion: metadata.engineVersion,
        scenarioContentHash: metadata.scenarioContentHash,
      }),
    [bundleId, metadata.engineVersion, metadata.scenarioContentHash],
  );

  const replayReady = useMemo(() => {
    const determinismIsGreen = missingRequiredFields.length === 0 && missingNonCriticalFields.length === 0;
    const cliReady = reproCliText.trim().length > 0;
    return determinismIsGreen && sequenceIntegrity.isGreen && cliReady;
  }, [missingNonCriticalFields.length, missingRequiredFields.length, reproCliText, sequenceIntegrity.isGreen]);

  const replayTelemetry = useMemo<ReplayTelemetryDerived>(() => {
    if (supportManifest) {
      return {
        turnCount: supportManifest.replay.turnCount,
        totalLedgerEntries: supportManifest.telemetry.totalLedgerEntries,
        totalStateDeltaCount: supportManifest.telemetry.totalStateDeltas,
        maxDeltaPerTurn: supportManifest.telemetry.maxDeltaPerTurn,
        avgDeltaPerTurn: supportManifest.telemetry.avgDeltaPerTurn,
        maxLedgerPerTurn: supportManifest.telemetry.maxLedgerPerTurn,
        finalStateHash: supportManifest.replay.finalStateHash,
      };
    }

    const turnCount = turnRows.length;
    const totalLedgerEntries = turnRows.reduce((sum, row) => sum + row.ledgerAdds.length, 0);
    const totalStateDeltaCount = turnRows.reduce((sum, row) => sum + row.stateDeltas.length, 0);
    const maxDeltaPerTurn = turnRows.reduce((max, row) => (row.stateDeltas.length > max ? row.stateDeltas.length : max), 0);
    const maxLedgerPerTurn = turnRows.reduce((max, row) => (row.ledgerAdds.length > max ? row.ledgerAdds.length : max), 0);
    const avgDeltaPerTurn = Number((totalStateDeltaCount / Math.max(turnCount, 1)).toFixed(6));

    return {
      turnCount,
      totalLedgerEntries,
      totalStateDeltaCount,
      maxDeltaPerTurn,
      avgDeltaPerTurn,
      maxLedgerPerTurn,
      finalStateHash,
    };
  }, [finalStateHash, supportManifest, turnRows]);

  const perTurnTelemetry = useMemo<PerTurnTelemetryRow[]>(() => {
    if (supportManifest) {
      return [...supportManifest.perTurn].sort((a, b) =>
        a.turnIndex === b.turnIndex ? 0 : a.turnIndex < b.turnIndex ? -1 : 1,
      );
    }

    const rows = turnRows.map((row, index) => ({
      turnIndex: parseTurnIndex(row.turnIndex, index),
      deltaCount: row.stateDeltas.length,
      ledgerCount: row.ledgerAdds.length,
      hasResolution: row.resolution !== "(none)",
    }));
    rows.sort((a, b) => (a.turnIndex === b.turnIndex ? 0 : a.turnIndex < b.turnIndex ? -1 : 1));
    return rows;
  }, [supportManifest, turnRows]);

  const telemetryReference = useMemo(() => extractTelemetryReference(bundleData), [bundleData]);
  const telemetryReferencePerTurn = useMemo(
    () =>
      readPathPerTurnTelemetry(bundleData, [
        ["telemetry", "perTurn"],
        ["telemetry", "PER_TURN_TELEMETRY"],
        ["replayTelemetry", "perTurn"],
        ["debug", "telemetry", "perTurn"],
      ]),
    [bundleData],
  );

  const telemetryDrift = useMemo(() => {
    const details: string[] = [];
    const firstPerTurnDrift = findFirstDrift(perTurnTelemetry, telemetryReferencePerTurn);
    const hashDrift =
      telemetryReference.finalStateHash.length > 0 &&
      replayTelemetry.finalStateHash.length > 0 &&
      telemetryReference.finalStateHash !== replayTelemetry.finalStateHash;
    const structuralDrift =
      telemetryReference.turnCount != null &&
      telemetryReference.turnCount !== replayTelemetry.turnCount;
    const perTurnDrift = !!firstPerTurnDrift;

    if (hashDrift) {
      details.push("FINAL_STATE_HASH mismatch");
    }
    if (structuralDrift) {
      details.push("TURN_COUNT mismatch");
    }
    if (
      telemetryReference.totalLedgerEntries != null &&
      telemetryReference.totalLedgerEntries !== replayTelemetry.totalLedgerEntries
    ) {
      details.push("TOTAL_LEDGER_ENTRIES mismatch");
    }
    if (perTurnDrift) {
      details.push(`PER_TURN mismatch (${firstPerTurnDrift.metric})`);
    }

    let firstDrift: DriftLocator = firstPerTurnDrift;
    if (!firstDrift) {
      if (structuralDrift) {
        firstDrift = {
          turnIndex: Math.min(telemetryReference.turnCount, replayTelemetry.turnCount),
          metric: "missing_turn",
          derived: null,
          reference: null,
        };
      } else if (
        telemetryReference.totalLedgerEntries != null &&
        telemetryReference.totalLedgerEntries !== replayTelemetry.totalLedgerEntries
      ) {
        firstDrift = {
          turnIndex: perTurnTelemetry.length > 0 ? perTurnTelemetry[0].turnIndex : null,
          metric: "ledger_count",
          derived: perTurnTelemetry.length > 0 ? perTurnTelemetry[0] : null,
          reference: null,
        };
      } else if (hashDrift) {
        const last = perTurnTelemetry.length > 0 ? perTurnTelemetry[perTurnTelemetry.length - 1] : null;
        firstDrift = {
          turnIndex: last?.turnIndex ?? null,
          metric: "final_state_hash",
          derived: last,
          reference: null,
        };
      }
    }

    const hasReference =
      telemetryReference.finalStateHash.length > 0 ||
      telemetryReference.turnCount != null ||
      telemetryReference.totalLedgerEntries != null ||
      telemetryReferencePerTurn.length > 0;
    const severity = hashDrift
      ? "HASH_DRIFT"
      : structuralDrift
        ? "STRUCTURAL_DRIFT"
        : perTurnDrift
          ? "PER_TURN_DRIFT"
          : "NONE";

    return {
      hasReference,
      isDrift: severity !== "NONE" || details.length > 0,
      details,
      firstDrift,
      severity,
    };
  }, [perTurnTelemetry, replayTelemetry, telemetryReference, telemetryReferencePerTurn]);

  const driftReportText = useMemo(() => {
    const rowFromDerived = telemetryDrift.firstDrift?.derived;
    const rowFromReference = telemetryDrift.firstDrift?.reference;
    const rowForReport = rowFromDerived ?? rowFromReference;
    const firstDriftTurnIndex =
      telemetryDrift.firstDrift?.turnIndex == null ? "(none)" : String(telemetryDrift.firstDrift.turnIndex);
    const firstDriftMetric = telemetryDrift.firstDrift?.metric ?? "(none)";
    const driftSummary = telemetryDrift.isDrift
      ? telemetryDrift.details.join("; ")
      : telemetryDrift.hasReference
        ? "No drift"
        : "No telemetry reference";

    return [
      "DRIFT REPORT",
      `BUNDLE_ID: ${bundleId.trim() || "(none)"}`,
      `ENGINE_VERSION: ${metadata.engineVersion.trim() || "(none)"}`,
      `SCENARIO_HASH: ${metadata.scenarioContentHash.trim() || "(none)"}`,
      `FINAL_STATE_HASH: ${replayTelemetry.finalStateHash || "(none)"}`,
      `DRIFT_SEVERITY: ${telemetryDrift.severity}`,
      `DRIFT_SUMMARY: ${driftSummary}`,
      `FIRST_DRIFT_TURN_INDEX: ${firstDriftTurnIndex}`,
      `FIRST_DRIFT_METRIC: ${firstDriftMetric}`,
      `TURN_INDEX: ${rowForReport ? rowForReport.turnIndex : "(none)"}`,
      `DELTA_COUNT: ${rowForReport ? rowForReport.deltaCount : "(none)"}`,
      `LEDGER_COUNT: ${rowForReport ? rowForReport.ledgerCount : "(none)"}`,
      `HAS_RESOLUTION: ${rowForReport ? String(rowForReport.hasResolution) : "(none)"}`,
    ].join("\n");
  }, [
    bundleId,
    metadata.engineVersion,
    metadata.scenarioContentHash,
    replayTelemetry.finalStateHash,
    telemetryDrift.details,
    telemetryDrift.firstDrift,
    telemetryDrift.hasReference,
    telemetryDrift.isDrift,
    telemetryDrift.severity,
  ]);

  const shareBlockText = useMemo(
    () =>
      buildSupportShareBlockText({
        bundleId,
        engineVersion: metadata.engineVersion,
        scenarioContentHash: metadata.scenarioContentHash,
        turn: metadata.latestTurnIndex,
      }),
    [bundleId, metadata.engineVersion, metadata.latestTurnIndex, metadata.scenarioContentHash],
  );

  const prettyBundleText = useMemo(() => {
    if (bundleData == null) return "";
    const pretty = prettyStableJson(bundleData);
    return redactionPreview ? redactSensitiveText(pretty) : pretty;
  }, [bundleData, redactionPreview]);

  const compareState = useMemo(() => {
    const leftRaw = leftCompareJson.trim();
    const rightRaw = rightCompareJson.trim();

    if (!leftRaw || !rightRaw) {
      return {
        parseError: "Provide both JSON inputs.",
        rows: [] as DiffRow[],
      };
    }

    try {
      const left = JSON.parse(leftRaw);
      const right = JSON.parse(rightRaw);
      return {
        parseError: "",
        rows: buildDiffRows(left, right),
      };
    } catch {
      return {
        parseError: "Compare input JSON is invalid.",
        rows: [] as DiffRow[],
      };
    }
  }, [leftCompareJson, rightCompareJson]);

  const bundleInspector = useMemo(() => {
    if (bundleData == null) {
      return { bytes: 0, turns: 0, ledgerEntries: 0, memoryCards: 0 };
    }

    const bytes = new TextEncoder().encode(stableStringify(bundleData)).length;
    return {
      bytes,
      turns: turnRows.length,
      ledgerEntries: computeLedgerEntryCount(bundleData, turnRows),
      memoryCards: computeMemoryCardCount(bundleData),
    };
  }, [bundleData, turnRows]);

  const searchTerm = searchText.trim().toLowerCase();

  const filteredTurnRows = useMemo(() => {
    if (!searchTerm) return turnRows;

    return turnRows.filter((row) => {
      const haystack = [
        row.turnIndex,
        row.playerInput,
        row.resolution,
        row.narrative,
        stableStringify(row.stateDeltas),
        stableStringify(row.ledgerAdds),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [searchTerm, turnRows]);

  const selectedTurn = useMemo(
    () => turnRows.find((row) => row.turnKey === selectedTurnKey) ?? null,
    [selectedTurnKey, turnRows],
  );

  const selectedTurnReproText = useMemo(() => {
    if (!selectedTurn) return "";
    return buildSupportTurnReproBlockText({
      bundleId: bundleId.trim() || "none",
      turnIndex: selectedTurn.turnIndex,
      engineVersion: metadata.engineVersion,
      scenarioContentHash: metadata.scenarioContentHash,
      adventureId: metadata.adventureId,
      latestTurnIndex: metadata.latestTurnIndex,
      stateDeltas: selectedTurn.stateDeltas,
      ledgerAdds: selectedTurn.ledgerAdds,
    });
  }, [bundleId, metadata, selectedTurn]);

  useEffect(() => {
    let cancelled = false;

    async function computeSupportManifest() {
      if (bundleData == null) {
        if (!cancelled) {
          setSupportManifest(null);
          setSupportManifestJson("");
          setSupportManifestHash("");
          setFinalStateHash("");
        }
        return;
      }

      try {
        const manifest = await buildSupportManifestFromBundle(bundleData);
        const manifestHash = await hashSupportManifest(manifest);
        if (!cancelled) {
          setSupportManifest(manifest);
          setSupportManifestJson(serializeSupportManifest(manifest));
          setSupportManifestHash(manifestHash);
          setFinalStateHash(manifest.replay.finalStateHash);
        }
      } catch {
        if (!cancelled) {
          setSupportManifest(null);
          setSupportManifestJson("");
          setSupportManifestHash("");
          setFinalStateHash("ERROR");
        }
      }
    }

    void computeSupportManifest();
    return () => {
      cancelled = true;
    };
  }, [bundleData]);

  const anomalies = useMemo(() => {
    const rows: string[] = [];
    filteredTurnRows.forEach((row) => {
      const deltaCount = row.stateDeltas.length;
      const ledgerCount = row.ledgerAdds.length;

      if (deltaCount === 0) {
        rows.push(`turn ${row.turnIndex}: zero deltas`);
      }
      if (deltaCount > LARGE_DELTA_THRESHOLD) {
        rows.push(`turn ${row.turnIndex}: unusually large deltas (${deltaCount})`);
      }
      if ((deltaCount > 0 && ledgerCount === 0) || (deltaCount === 0 && ledgerCount > 0)) {
        rows.push(`turn ${row.turnIndex}: delta/ledger mismatch`);
      }
    });
    return rows;
  }, [filteredTurnRows]);

  const missingRunbookSections = useMemo(
    () => runbookSectionChecks.filter((section) => !section.exists).map((section) => section.label),
    [runbookSectionChecks],
  );

  function onBundleJsonChange(value: string) {
    setBundleJsonText(value);

    const raw = value.trim();
    if (!raw) {
      setPastedBundleData(null);
      setBundleJsonStatus("No bundle JSON pasted.");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setPastedBundleData(parsed);
      setBundleJsonStatus("Bundle JSON parsed.");
    } catch {
      setPastedBundleData(null);
      setBundleJsonStatus("Bundle JSON invalid.");
    }
  }

  function onLoadFixture() {
    const content = fixtureMap.get(selectedFixtureName);
    if (!content) {
      setBundleJsonStatus("Fixture not found.");
      return;
    }
    onBundleJsonChange(content);
    setBundleJsonStatus("Fixture loaded.");
  }

  async function onLoadBundle() {
    const id = bundleId.trim();
    if (!id) {
      setLoadedBundleData(null);
      setBundleStatus("bundleId is required.");
      return;
    }

    if (!debugEndpointAvailable) {
      setLoadedBundleData(null);
      setBundleStatus("Debug bundle endpoint not found.");
      return;
    }

    try {
      const res = await fetch(`/api/debug/bundle/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setLoadedBundleData(null);
        setBundleStatus("Bundle not found.");
        return;
      }

      const json = await res.json().catch(() => null);
      if (json == null) {
        setLoadedBundleData(null);
        setBundleStatus("Bundle payload invalid.");
        return;
      }

      setLoadedBundleData(json);
      setBundleStatus("Bundle loaded.");
    } catch {
      setLoadedBundleData(null);
      setBundleStatus("Bundle request failed.");
    }
  }

  async function copyText(text: string, onStatus: (status: string) => void) {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      onStatus("Copy not supported");
      return;
    }

    await navigator.clipboard.writeText(text);
    onStatus("Copied");
  }

  async function onCopyRunbookSection(section: RunbookSection) {
    await copyText(buildRunbookSectionCopyText(section), (status) => {
      setRunbookCopyStatus((prev) => ({ ...prev, [section.label]: status }));
    });
  }

  async function onCopyFinalStateHash() {
    if (!/^[a-f0-9]{64}$/.test(finalStateHash)) {
      setFinalStateHashCopyStatus("Copy not supported");
      return;
    }
    await copyText(finalStateHash, setFinalStateHashCopyStatus);
  }

  async function onCopyManifestJson() {
    if (!supportManifestJson) {
      setManifestCopyStatus("Copy not supported");
      return;
    }
    await copyText(supportManifestJson, setManifestCopyStatus);
  }

  async function onCopyDriftReport() {
    await copyText(driftReportText, setDriftReportCopyStatus);
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Support Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-600">Deterministic debug artifacts and reproducible issue assembly.</p>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Support panels">
        <h2 className="text-base font-semibold">Panels</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          <li>Debug Bundles</li>
          <li>Reproduction Checklist</li>
          <li>Runbook</li>
          <li>Issue Draft Generator</li>
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Debug Bundles">
        <h2 className="text-base font-semibold">Debug Bundles</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label htmlFor="support-bundle-id" className="text-xs">
            bundleId
          </label>
          <input
            id="support-bundle-id"
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="bundle id"
          />
          <button type="button" onClick={onLoadBundle} className="rounded border px-2 py-1 text-xs">
            Load bundle
          </button>
          <span role="status" aria-live="polite">
            {bundleStatus}
          </span>
        </div>

        <div className="mt-2">
          <label htmlFor="support-bundle-json" className="mb-1 block text-xs">
            Paste bundle JSON
          </label>
          <textarea
            id="support-bundle-json"
            value={bundleJsonText}
            onChange={(e) => onBundleJsonChange(e.target.value)}
            className="w-full rounded border p-2 font-mono text-xs"
            rows={6}
            placeholder='{"engineVersion":"...","scenarioContentHash":"..."}'
          />
          <div className="mt-1 text-xs" role="status" aria-live="polite">
            {bundleJsonStatus}
          </div>
        </div>

        <div className="mt-2 rounded border p-2 text-xs" aria-label="Known good fixture viewer">
          <div className="font-semibold">Known Good Example Bundle Fixture Viewer</div>
          {fixtureOptions.length === 0 ? (
            <div className="mt-1">no fixtures found</div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={selectedFixtureName}
                onChange={(e) => setSelectedFixtureName(e.target.value)}
                className="rounded border px-2 py-1"
              >
                {fixtureOptions.map((fixture) => (
                  <option key={fixture.name} value={fixture.name}>
                    {fixture.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={onLoadFixture} className="rounded border px-2 py-1">
                Load fixture
              </button>
            </div>
          )}
        </div>

        <div className="mt-1 text-xs">
          Endpoint availability: {debugEndpointAvailable ? "available" : "not found"}
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Bundle shape detector">
        <h2 className="text-base font-semibold">Bundle Shape</h2>
        <div className="mt-2 rounded border px-2 py-1 text-xs inline-block">{bundleShape}</div>
        <div className="mt-1 text-xs">Top-level keys: {topLevelKeys.length ? topLevelKeys.join(", ") : "(none)"}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Determinism integrity badge">
        <h2 className="text-base font-semibold">Determinism Integrity</h2>
        <div className={`mt-2 font-medium ${integrityBadge.cls}`}>{integrityBadge.label}</div>
        <button
          type="button"
          className="mt-2 rounded border px-2 py-1 text-xs"
          onClick={() => setShowMissingDrilldown((v) => !v)}
        >
          {showMissingDrilldown ? "Hide" : "Show"} missing-field drilldown
        </button>

        {showMissingDrilldown ? (
          <div className="mt-2 rounded border p-2 text-xs">
            <div className="font-semibold">Missing required fields</div>
            <ul className="mt-1 list-disc pl-5">
              {missingRequiredFields.length === 0 ? (
                <li>(none)</li>
              ) : (
                missingRequiredFields.map((field) => {
                  const spec = METADATA_FIELD_SPECS.find((s) => s.key === field.key)!;
                  return (
                    <li key={`required-${field.key}`}>
                      {field.label}: expected at {spec.paths.map((p) => p.join(".")).join(" | ")}
                    </li>
                  );
                })
              )}
            </ul>

            <div className="mt-2 font-semibold">Missing non-critical fields</div>
            <ul className="mt-1 list-disc pl-5">
              {missingNonCriticalFields.length === 0 ? (
                <li>(none)</li>
              ) : (
                missingNonCriticalFields.map((field) => {
                  const spec = METADATA_FIELD_SPECS.find((s) => s.key === field.key)!;
                  return (
                    <li key={`optional-${field.key}`}>
                      {field.label}: expected at {spec.paths.map((p) => p.join(".")).join(" | ")}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Replay readiness">
        <h2 className="text-base font-semibold">Replay Readiness</h2>
        <div className={`mt-2 font-medium ${replayReady ? "text-green-700" : "text-red-700"}`}>
          Replay-Ready: {replayReady ? "YES" : "NO"}
        </div>
        <div className={`mt-1 ${sequenceIntegrity.cls}`}>Turn sequence integrity: {sequenceIntegrity.label}</div>
        {sequenceIntegrity.details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-xs">
            {sequenceIntegrity.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 text-xs">
          FINAL_STATE_HASH:{" "}
          {finalStateHash.length > 16 ? `${finalStateHash.slice(0, 16)}...` : finalStateHash || "(none)"}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopyFinalStateHash}
            disabled={!/^[a-f0-9]{64}$/.test(finalStateHash)}
          >
            Copy final state hash
          </button>
          <span role="status" aria-live="polite">
            {finalStateHashCopyStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Replay Telemetry (Derived)">
        <h2 className="text-base font-semibold">Replay Telemetry (Derived)</h2>
        {telemetryDrift.isDrift ? (
          <div className="mt-2 font-medium text-red-700">TELEMETRY DRIFT DETECTED</div>
        ) : telemetryDrift.hasReference ? (
          <div className="mt-2 font-medium text-green-700">Telemetry parity: no drift</div>
        ) : (
          <div className="mt-2 font-medium text-amber-700">Telemetry reference: not available</div>
        )}
        <div className="mt-1 text-xs">
          FIRST_DRIFT_TURN_INDEX:{" "}
          {telemetryDrift.firstDrift?.turnIndex == null ? "(none)" : telemetryDrift.firstDrift.turnIndex}
        </div>
        <div className="text-xs">
          FIRST_DRIFT_METRIC: {telemetryDrift.firstDrift?.metric ?? "(none)"}
        </div>
        <div className="text-xs">DRIFT_SEVERITY: {telemetryDrift.severity}</div>
        {telemetryDrift.details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-xs">
            {telemetryDrift.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={onCopyDriftReport}>
            Copy Drift Report
          </button>
          <span role="status" aria-live="polite">
            {driftReportCopyStatus}
          </span>
        </div>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">
          {[
            `TELEMETRY_VERSION ${TELEMETRY_VERSION}`,
            "TELEMETRY",
            `TURN_COUNT: ${replayTelemetry.turnCount}`,
            `TOTAL_LEDGER_ENTRIES: ${replayTelemetry.totalLedgerEntries}`,
            `TOTAL_STATE_DELTAS: ${replayTelemetry.totalStateDeltaCount}`,
            `MAX_DELTA_PER_TURN: ${replayTelemetry.maxDeltaPerTurn}`,
            `AVG_DELTA_PER_TURN: ${replayTelemetry.avgDeltaPerTurn}`,
            `MAX_LEDGER_PER_TURN: ${replayTelemetry.maxLedgerPerTurn}`,
            `FINAL_STATE_HASH: ${replayTelemetry.finalStateHash || "(none)"}`,
            "PER_TURN_TELEMETRY",
          ].join("\n")}
        </pre>
        <div className="mt-2 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border p-2 text-left">TURN_INDEX</th>
                <th className="border p-2 text-left">DELTA_COUNT</th>
                <th className="border p-2 text-left">LEDGER_COUNT</th>
                <th className="border p-2 text-left">HAS_RESOLUTION</th>
              </tr>
            </thead>
            <tbody>
              {perTurnTelemetry.length === 0 ? (
                <tr>
                  <td className="border p-2" colSpan={4}>
                    (none)
                  </td>
                </tr>
              ) : (
                perTurnTelemetry.map((row) => (
                  <tr key={`per-turn-${row.turnIndex}`}>
                    <td className="border p-2">{row.turnIndex}</td>
                    <td className="border p-2">{row.deltaCount}</td>
                    <td className="border p-2">{row.ledgerCount}</td>
                    <td className="border p-2">{String(row.hasResolution)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Canonical Manifest (V1)">
        <h2 className="text-base font-semibold">Canonical Manifest (V1)</h2>
        <div className="mt-2 text-xs">
          Manifest version: {supportManifest?.manifestVersion ?? SUPPORT_MANIFEST_VERSION}
        </div>
        <div className="text-xs">Replay turnCount: {supportManifest?.replay.turnCount ?? 0}</div>
        <div className="text-xs">
          Replay telemetryVersion: {supportManifest?.replay.telemetryVersion ?? TELEMETRY_VERSION}
        </div>
        <div className="text-xs">
          Replay finalStateHash: {supportManifest?.replay.finalStateHash || "(none)"}
        </div>
        <div className="text-xs">
          Manifest hash: {supportManifestHash ? `${supportManifestHash.slice(0, 16)}...` : "(none)"}
        </div>
        <div className="mt-1 text-xs">
          Telemetry: deltas={supportManifest?.telemetry.totalStateDeltas ?? 0} ledger=
          {supportManifest?.telemetry.totalLedgerEntries ?? 0} maxDelta=
          {supportManifest?.telemetry.maxDeltaPerTurn ?? 0} avgDelta=
          {supportManifest?.telemetry.avgDeltaPerTurn ?? 0} maxLedger=
          {supportManifest?.telemetry.maxLedgerPerTurn ?? 0}
        </div>
        <div className="text-xs">Per-turn rows: {supportManifest?.perTurn.length ?? 0}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopyManifestJson}
            disabled={!supportManifestJson}
          >
            Copy Manifest JSON
          </button>
          <span role="status" aria-live="polite">
            {manifestCopyStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Reproduction Checklist">
        <h2 className="text-base font-semibold">Reproduction Checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {checklistRows.map((row) => {
            const hasValue = row.value.length > 0;
            return (
              <li key={row.key} className={hasValue ? "text-green-700" : "text-red-700"}>
                {row.label}: {hasValue ? row.value : "missing"}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Issue Draft Generator">
        <h2 className="text-base font-semibold">Issue Draft Generator</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => copyText(issueBlockText, setIssueCopyStatus)} className="rounded border px-2 py-1 text-xs">
            Copy issue block
          </button>
          <button
            type="button"
            onClick={() => copyText(reproCliText, setReproCliCopyStatus)}
            className="rounded border px-2 py-1 text-xs"
          >
            Copy deterministic repro CLI block
          </button>
          <button
            type="button"
            onClick={() => copyText(shareBlockText, setShareBlockCopyStatus)}
            className="rounded border px-2 py-1 text-xs"
          >
            Copy stable share block v2
          </button>
          <span role="status" aria-live="polite">
            {issueCopyStatus || reproCliCopyStatus || shareBlockCopyStatus}
          </span>
        </div>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap">{issueBlockText}</pre>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap">{reproCliText}</pre>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap">{shareBlockText}</pre>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Structured Timeline Viewer">
        <h2 className="text-base font-semibold">Structured Timeline Viewer</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={minimalReproMode}
              onChange={(e) => setMinimalReproMode(e.target.checked)}
            />
            Minimal Repro Mode
          </label>
          <label className="inline-flex items-center gap-2 text-xs">
            Search within bundle
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded border px-2 py-1"
              placeholder="substring"
            />
          </label>
        </div>
        <div className="mt-1 text-xs">Show only inputs, resolution, state deltas, and ledger entries.</div>

        {filteredTurnRows.length === 0 ? (
          <div className="mt-2">No replay events</div>
        ) : (
          <div className="mt-2 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border p-2 text-left">turnIndex</th>
                  <th className="border p-2 text-left">playerInput</th>
                  <th className="border p-2 text-left">resolution</th>
                  <th className="border p-2 text-left">stateDelta count</th>
                  <th className="border p-2 text-left">ledger entries count</th>
                  <th className="border p-2 text-left">delta highlights</th>
                  {!minimalReproMode ? <th className="border p-2 text-left">narrative</th> : null}
                  <th className="border p-2 text-left">details</th>
                </tr>
              </thead>
              <tbody>
                {filteredTurnRows.map((row) => {
                  const tags = summarizeDeltaKinds(row.stateDeltas);
                  return (
                    <tr key={row.turnKey}>
                      <td className="border p-2">{row.turnIndex}</td>
                      <td className="border p-2">{truncateText(row.playerInput, 80)}</td>
                      <td className="border p-2">{truncateText(row.resolution, 80)}</td>
                      <td className="border p-2">{row.stateDeltas.length}</td>
                      <td className="border p-2">{row.ledgerAdds.length}</td>
                      <td className="border p-2">
                        {tags.length === 0
                          ? "(none)"
                          : tags.map((tag) => (
                              <span key={`${row.turnKey}-${tag}`} className="mr-1 rounded border px-1 py-0.5">
                                {tag}
                              </span>
                            ))}
                      </td>
                      {!minimalReproMode ? <td className="border p-2">{truncateText(row.narrative, 80)}</td> : null}
                      <td className="border p-2">
                        <button
                          type="button"
                          className="rounded border px-2 py-1"
                          onClick={() => setSelectedTurnKey(row.turnKey)}
                        >
                          Open turn
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedTurn ? (
          <div className="mt-3 rounded border p-3" aria-label="Turn Deep View Drawer">
            <div className="font-semibold">Turn Deep View Drawer</div>
            <div className="mt-2 text-xs">turnIndex: {selectedTurn.turnIndex}</div>
            <div className="mt-2 text-xs">input (full)</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{selectedTurn.playerInput}</pre>
            <div className="mt-2 text-xs">resolution (full)</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{selectedTurn.resolution}</pre>
            <div className="mt-2 text-xs">state deltas (full paths)</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{prettyStableJson(selectedTurn.stateDeltas)}</pre>
            <div className="mt-2 text-xs">ledger entries (full text)</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{prettyStableJson(selectedTurn.ledgerAdds)}</pre>
            <div className="mt-2 text-xs">raw turn JSON</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{prettyStableJson(selectedTurn.rawTurn)}</pre>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => copyText(selectedTurnReproText, setTurnReproCopyStatus)}
              >
                Copy Turn Repro Block
              </button>
              <span role="status" aria-live="polite">
                {turnReproCopyStatus}
              </span>
            </div>
            <pre className="mt-2 rounded border p-2 whitespace-pre-wrap">{selectedTurnReproText}</pre>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Error/Anomaly Spotlight">
        <h2 className="text-base font-semibold">Error/Anomaly Spotlight</h2>
        {anomalies.length === 0 ? (
          <div className="mt-2">No anomaly flags.</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            {anomalies.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Redaction Preview">
        <h2 className="text-base font-semibold">Redaction Preview</h2>
        <label className="mt-2 inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={redactionPreview}
            onChange={(e) => setRedactionPreview(e.target.checked)}
          />
          Enable redaction preview
        </label>
        <div className="mt-1 text-xs">Masks emails, long tokens, and JWT-like strings in display only.</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Bundle Size Inspector">
        <h2 className="text-base font-semibold">Bundle Size + Field Count Inspector</h2>
        <div className="mt-2">JSON size (bytes): {bundleInspector.bytes}</div>
        <div>turn count: {bundleInspector.turns}</div>
        <div>ledger entry count: {bundleInspector.ledgerEntries}</div>
        <div>memory card count: {bundleInspector.memoryCards}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Bundle JSON Pretty Viewer">
        <h2 className="text-base font-semibold">Bundle JSON Pretty Viewer</h2>
        {bundleData == null ? (
          <div className="mt-2">No bundle loaded.</div>
        ) : (
          <div className="mt-2 space-y-2">
            <details open>
              <summary className="cursor-pointer">Tree view</summary>
              <div className="mt-2 rounded border p-2">
                <JsonTreeNode label="bundle" value={bundleData} />
              </div>
            </details>
            <details>
              <summary className="cursor-pointer">Raw JSON</summary>
              <pre className="mt-2 overflow-auto rounded border p-2 whitespace-pre-wrap">{prettyBundleText}</pre>
            </details>
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Bundle Compare View">
        <h2 className="text-base font-semibold">Bundle Compare View</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="compare-left" className="mb-1 block text-xs">
              Left JSON
            </label>
            <textarea
              id="compare-left"
              value={leftCompareJson}
              onChange={(e) => setLeftCompareJson(e.target.value)}
              className="w-full rounded border p-2 font-mono text-xs"
              rows={8}
            />
          </div>
          <div>
            <label htmlFor="compare-right" className="mb-1 block text-xs">
              Right JSON
            </label>
            <textarea
              id="compare-right"
              value={rightCompareJson}
              onChange={(e) => setRightCompareJson(e.target.value)}
              className="w-full rounded border p-2 font-mono text-xs"
              rows={8}
            />
          </div>
        </div>

        {compareState.parseError ? (
          <div className="mt-2">{compareState.parseError}</div>
        ) : compareState.rows.length === 0 ? (
          <div className="mt-2">No diff rows.</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-2 pl-6">
            {compareState.rows.map((row) => (
              <li key={`${row.kind}:${row.path}`}>
                <div>
                  {row.kind}: <code>{row.path}</code>
                </div>
                <div className="text-xs">left: {row.left}</div>
                <div className="text-xs">right: {row.right}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Runbook">
        <h2 className="text-base font-semibold">Runbook</h2>
        <ul className="mt-2 space-y-1">
          {runbookLinks.map((link) => (
            <li key={`${link.label}:${link.path}`}>
              <span className="font-medium">{link.label}</span>: <code>{link.path}</code>{" "}
              <span className="text-xs">[{link.exists ? "FOUND" : "NOT FOUND"}]</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded border p-2" aria-label="Runbook Cross-Check">
          <div className="text-xs font-semibold">Runbook Cross-Check Widget</div>
          <ul className="mt-1 space-y-1 text-xs">
            {runbookSectionChecks.map((section) => (
              <li key={section.label}>
                {section.label}: {section.exists ? "FOUND" : "MISSING"}
              </li>
            ))}
          </ul>
          {missingRunbookSections.length > 0 ? (
            <div className="mt-1 text-xs">Missing sections warning: {missingRunbookSections.join(", ")}</div>
          ) : (
            <div className="mt-1 text-xs">Missing sections warning: none</div>
          )}

          <div className="mt-2 space-y-2">
            {runbookSections.map((section) => (
              <div key={section.label} className="rounded border p-2">
                <div className="text-xs font-medium">{section.label}</div>
                <button
                  type="button"
                  className="mt-1 rounded border px-2 py-1 text-xs"
                  onClick={() => onCopyRunbookSection(section)}
                >
                  Copy section {section.label}
                </button>
                <span className="ml-2 text-xs">{runbookCopyStatus[section.label] ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
