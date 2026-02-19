"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildDeltaLedgerExplanationRows,
  classifyConsequence,
  classifyFailForwardSignal,
  deriveStyleStabilityFromEvents,
  explainConsequence,
} from "@/lib/game/replay";
import { categorizeDeltaPath } from "@/lib/support/deltaPathMeaningMap";
import { buildDeterministicReproCliText } from "@/lib/support/buildDeterministicReproCliText";
import { buildSupportShareBlockText } from "@/lib/support/buildSupportShareBlockText";
import { buildSupportTurnReproBlockText } from "@/lib/support/buildSupportTurnReproBlockText";
import { buildSupportCriticalAnchorsText } from "@/lib/support/buildSupportCriticalAnchorsText";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  buildSupportManifestFromBundle,
  hashSupportManifest,
  serializeSupportManifest,
  sha256HexFromText,
  type SupportManifestV1,
} from "@/lib/support/supportManifest";
import {
  SUPPORT_PACKAGE_VERSION,
  serializeSupportPackage,
  type SupportPackageV1,
} from "@/lib/support/supportPackage";

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
  failForwardSignal: string;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  costTypes: string;
  escalation: "NONE" | "MINOR" | "MAJOR";
  stakesReason: string[];
};

type StyleStabilityPanel = {
  toneStable: boolean;
  genreStable: boolean;
  pacingStable: boolean;
  driftCount: number;
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

type SupportPackageParseResult = {
  pkg: SupportPackageV1 | null;
  error: string;
};

type SupportPackageDiffRow = {
  label: string;
  left: string;
  right: string;
  same: boolean;
};

type IntakeConsistencyState = {
  status: "idle" | "pass" | "fail";
  message: string;
  rebuiltManifestHash: string;
  rebuiltFinalStateHash: string;
};

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

function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

function readSupportPackageHashCandidate(value: unknown): string {
  if (!isRecord(value)) return "";
  const candidateKeys = ["PACKAGE_HASH", "packageHash", "package_hash"];
  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return "";
}

function asSupportPackageV1(value: unknown): SupportPackageV1 | null {
  if (!isRecord(value)) return null;
  const packageVersion = value.packageVersion;
  const manifestHash = value.manifestHash;
  const manifest = value.manifest;
  const replay = value.replay;
  const drift = value.drift;
  const integrity = value.integrity;
  const runbook = value.runbook;

  if (typeof packageVersion !== "number") return null;
  if (typeof manifestHash !== "string" || manifestHash.trim().length === 0) return null;
  if (!isRecord(manifest) || !isRecord(replay) || !isRecord(drift) || !isRecord(integrity) || !isRecord(runbook)) {
    return null;
  }

  const manifestReplay = manifest.replay;
  const manifestTelemetry = manifest.telemetry;
  const manifestPerTurn = manifest.perTurn;
  const replayTelemetry = replay.telemetry;
  const replayPerTurn = replay.perTurn;

  if (!isRecord(manifestReplay) || !isRecord(manifestTelemetry) || !Array.isArray(manifestPerTurn)) return null;
  if (!isRecord(replayTelemetry) || !Array.isArray(replayPerTurn)) return null;
  if (typeof replay.finalStateHash !== "string") return null;
  if (typeof drift.severity !== "string") return null;
  if (typeof integrity.manifestHashMatches !== "boolean") return null;
  if (typeof integrity.replayFinalStateMatchesManifest !== "boolean") return null;
  if (typeof integrity.telemetryConsistent !== "boolean") return null;
  if (!("originalBundle" in value)) return null;

  return value as SupportPackageV1;
}

function parseSupportPackageJson(raw: string): SupportPackageParseResult {
  const text = raw.trim();
  if (!text) {
    return { pkg: null, error: "No support package JSON pasted." };
  }

  try {
    const parsed = JSON.parse(text);
    const pkg = asSupportPackageV1(parsed);
    if (!pkg) {
      return {
        pkg: null,
        error: "Support package JSON invalid: required fields packageVersion, manifest, manifestHash.",
      };
    }
    return { pkg, error: "Support package loaded." };
  } catch {
    return { pkg: null, error: "Support package JSON invalid: invalid JSON." };
  }
}

function buildSupportPackageChecklistText(rows: Array<{ label: string; ok: boolean }>): string {
  return [
    "### Incident Checklist",
    ...rows.map((row) => `- [${row.ok ? "x" : " "}] ${row.label}`),
  ].join("\n");
}

function buildSupportPackageIssueDraftText(args: {
  manifestHash: string;
  packageHash: string;
  engineVersion: string;
  scenarioContentHash: string;
  driftSeverity: string;
  firstDriftTurnIndex: string;
  firstDriftMetric: string;
  replayInvariant: string;
}): string {
  return [
    "### Support Package",
    `Manifest Hash: ${args.manifestHash}`,
    `Package Hash: ${args.packageHash}`,
    `Engine Version: ${args.engineVersion}`,
    `Scenario Hash: ${args.scenarioContentHash}`,
    "",
    "### Drift Severity:",
    args.driftSeverity,
    "",
    "### First Drift:",
    `Turn: ${args.firstDriftTurnIndex}`,
    `Metric: ${args.firstDriftMetric}`,
    "",
    "### Replay Invariants:",
    args.replayInvariant,
  ].join("\n");
}

function buildSupportPackageDiffRows(left: SupportPackageV1, right: SupportPackageV1): SupportPackageDiffRow[] {
  return [
    {
      label: "manifestHash",
      left: left.manifestHash,
      right: right.manifestHash,
      same: left.manifestHash === right.manifestHash,
    },
    {
      label: "finalStateHash",
      left: left.replay.finalStateHash,
      right: right.replay.finalStateHash,
      same: left.replay.finalStateHash === right.replay.finalStateHash,
    },
    {
      label: "driftSeverity",
      left: left.drift.severity,
      right: right.drift.severity,
      same: left.drift.severity === right.drift.severity,
    },
    {
      label: "turnCount",
      left: String(left.manifest.replay.turnCount),
      right: String(right.manifest.replay.turnCount),
      same: left.manifest.replay.turnCount === right.manifest.replay.turnCount,
    },
    {
      label: "perTurnRows",
      left: String(left.replay.perTurn.length),
      right: String(right.replay.perTurn.length),
      same: left.replay.perTurn.length === right.replay.perTurn.length,
    },
  ];
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
      const failForwardSignalRaw = row.failForwardSignal ?? row.FAIL_FORWARD_SIGNAL ?? "";
      const riskLevelRaw = row.riskLevel ?? row.RISK_LEVEL ?? "LOW";
      const costTypesRaw = row.costTypes ?? row.COST_TYPES ?? "";
      const escalationRaw = row.escalation ?? row.ESCALATION ?? "NONE";

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
      const failForwardSignal =
        typeof failForwardSignalRaw === "string" ? failForwardSignalRaw.trim() : "";
      const normalizedRisk = typeof riskLevelRaw === "string" ? riskLevelRaw.trim().toUpperCase() : "LOW";
      const riskLevel: "LOW" | "MODERATE" | "HIGH" =
        normalizedRisk === "HIGH" ? "HIGH" : normalizedRisk === "MODERATE" ? "MODERATE" : "LOW";
      const costTypes = typeof costTypesRaw === "string" ? costTypesRaw.trim() : "";
      const normalizedEscalation = typeof escalationRaw === "string" ? escalationRaw.trim().toUpperCase() : "NONE";
      const escalation: "NONE" | "MINOR" | "MAJOR" =
        normalizedEscalation === "MAJOR" ? "MAJOR" : normalizedEscalation === "MINOR" ? "MINOR" : "NONE";

      rows.push({
        turnIndex,
        deltaCount,
        ledgerCount,
        hasResolution,
        failForwardSignal,
        riskLevel,
        costTypes,
        escalation,
        stakesReason: [],
      });
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

function normalizeCopyBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
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
  const [supportPackageJsonText, setSupportPackageJsonText] = useState("");
  const [supportPackageStatus, setSupportPackageStatus] = useState("No support package loaded.");
  const [supportPackageData, setSupportPackageData] = useState<SupportPackageV1 | null>(null);
  const [supportPackageReadOnly, setSupportPackageReadOnly] = useState(false);
  const [supportPackageHashReference, setSupportPackageHashReference] = useState("");
  const [supportPackageComputedHash, setSupportPackageComputedHash] = useState("");
  const [supportPackageDerivedManifestHash, setSupportPackageDerivedManifestHash] = useState("");
  const [manifestCopyStatus, setManifestCopyStatus] = useState("");
  const [supportPackageManifestHashCopyStatus, setSupportPackageManifestHashCopyStatus] = useState("");
  const [supportPackagePackageHashCopyStatus, setSupportPackagePackageHashCopyStatus] = useState("");
  const [supportPackageManifestWarningCopyStatus, setSupportPackageManifestWarningCopyStatus] = useState("");
  const [supportPackageChecklistCopyStatus, setSupportPackageChecklistCopyStatus] = useState("");
  const [supportPackageIssueCopyStatus, setSupportPackageIssueCopyStatus] = useState("");
  const [supportPackageCliCopyStatus, setSupportPackageCliCopyStatus] = useState("");
  const [supportPackageImmutableHashCopyStatus, setSupportPackageImmutableHashCopyStatus] = useState("");
  const [criticalAnchorsCopyStatus, setCriticalAnchorsCopyStatus] = useState("");
  const [intakeConsistencyState, setIntakeConsistencyState] = useState<IntakeConsistencyState>({
    status: "idle",
    message: "No support package loaded.",
    rebuiltManifestHash: "",
    rebuiltFinalStateHash: "",
  });
  const [driftReportCopyStatus, setDriftReportCopyStatus] = useState("");
  const [runbookCopyStatus, setRunbookCopyStatus] = useState<Record<string, string>>({});
  const [leftCompareJson, setLeftCompareJson] = useState("");
  const [rightCompareJson, setRightCompareJson] = useState("");
  const [leftPackageJson, setLeftPackageJson] = useState("");
  const [rightPackageJson, setRightPackageJson] = useState("");

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

  useEffect(() => {
    let cancelled = false;

    async function computeSupportPackageHashes() {
      if (!supportPackageData) {
        if (!cancelled) {
          setSupportPackageDerivedManifestHash("");
          setSupportPackageComputedHash("");
        }
        return;
      }

      try {
        const derivedManifestHash = await hashSupportManifest(supportPackageData.manifest);
        const computedPackageHash = await sha256HexFromText(serializeSupportPackage(supportPackageData));
        if (!cancelled) {
          setSupportPackageDerivedManifestHash(derivedManifestHash);
          setSupportPackageComputedHash(computedPackageHash);
        }
      } catch {
        if (!cancelled) {
          setSupportPackageDerivedManifestHash("");
          setSupportPackageComputedHash("");
        }
      }
    }

    void computeSupportPackageHashes();
    return () => {
      cancelled = true;
    };
  }, [supportPackageData]);

  useEffect(() => {
    let cancelled = false;

    async function runIntakeConsistencySelfTest() {
      if (!supportPackageData) {
        if (!cancelled) {
          setIntakeConsistencyState({
            status: "idle",
            message: "No support package loaded.",
            rebuiltManifestHash: "",
            rebuiltFinalStateHash: "",
          });
        }
        return;
      }

      try {
        const rebuiltManifest = await buildSupportManifestFromBundle(supportPackageData.originalBundle);
        const rebuiltManifestHash = await hashSupportManifest(rebuiltManifest);
        const rebuiltFinalStateHash = rebuiltManifest.replay.finalStateHash;
        const isManifestHashMatch = rebuiltManifestHash === supportPackageData.manifestHash;
        const isFinalStateHashMatch = rebuiltFinalStateHash === supportPackageData.manifest.replay.finalStateHash;
        const pass = isManifestHashMatch && isFinalStateHashMatch;

        if (!cancelled) {
          setIntakeConsistencyState({
            status: pass ? "pass" : "fail",
            message: pass ? "INTAKE CONSISTENCY PASS" : "INTAKE CONSISTENCY FAILURE",
            rebuiltManifestHash,
            rebuiltFinalStateHash,
          });
        }
      } catch {
        if (!cancelled) {
          setIntakeConsistencyState({
            status: "fail",
            message: "INTAKE CONSISTENCY FAILURE",
            rebuiltManifestHash: "",
            rebuiltFinalStateHash: "",
          });
        }
      }
    }

    void runIntakeConsistencySelfTest();
    return () => {
      cancelled = true;
    };
  }, [supportPackageData]);

  const supportPackageManifestIntegrity = useMemo(() => {
    if (!supportPackageData) {
      return {
        manifestHashMatches: false,
        replayFinalStateMatchesManifest: false,
        telemetryConsistent: false,
        derivedManifestHashMatches: false,
        allTrue: false,
      };
    }

    const derivedManifestHashMatches =
      supportPackageDerivedManifestHash.length > 0 &&
      supportPackageDerivedManifestHash === supportPackageData.manifestHash;
    const allTrue =
      derivedManifestHashMatches &&
      supportPackageData.integrity.manifestHashMatches &&
      supportPackageData.integrity.replayFinalStateMatchesManifest &&
      supportPackageData.integrity.telemetryConsistent;

    return {
      manifestHashMatches: supportPackageData.integrity.manifestHashMatches,
      replayFinalStateMatchesManifest: supportPackageData.integrity.replayFinalStateMatchesManifest,
      telemetryConsistent: supportPackageData.integrity.telemetryConsistent,
      derivedManifestHashMatches,
      allTrue,
    };
  }, [supportPackageData, supportPackageDerivedManifestHash]);

  const supportPackageVersionSupported = useMemo(
    () => !supportPackageData || supportPackageData.packageVersion === SUPPORT_PACKAGE_VERSION,
    [supportPackageData],
  );
  const supportPackageIntakeBlocked = useMemo(
    () => !!supportPackageData && !supportPackageVersionSupported,
    [supportPackageData, supportPackageVersionSupported],
  );
  const supportManifestVersionSupported = useMemo(
    () => !supportPackageData || supportPackageData.manifest.manifestVersion === SUPPORT_MANIFEST_VERSION,
    [supportPackageData],
  );
  const supportPackageManifestWarningText = useMemo(() => {
    if (!supportPackageData || supportManifestVersionSupported) return "";
    return [
      "Manifest version mismatch",
      `Expected: ${SUPPORT_MANIFEST_VERSION}`,
      `Actual: ${supportPackageData.manifest.manifestVersion}`,
      "Proceed with caution: forward-compatibility not guaranteed.",
    ].join("\n");
  }, [supportManifestVersionSupported, supportPackageData]);

  const supportPackageHashBadge = useMemo(() => {
    if (!supportPackageData || !supportPackageComputedHash) {
      return { label: "PACKAGE_HASH unavailable", cls: "text-amber-700" };
    }

    const reference = normalizeHash(supportPackageHashReference);
    if (!reference) {
      return { label: "PACKAGE_HASH reference not provided", cls: "text-amber-700" };
    }
    if (reference !== normalizeHash(supportPackageComputedHash)) {
      return { label: "PACKAGE TAMPER DETECTED", cls: "text-red-700" };
    }
    return { label: "PACKAGE_HASH verified", cls: "text-green-700" };
  }, [supportPackageComputedHash, supportPackageData, supportPackageHashReference]);

  const supportPackageChecklistRows = useMemo(
    () => {
      if (supportPackageIntakeBlocked) {
        return [
          { label: "Manifest integrity verified", ok: false },
          { label: "Replay telemetry consistent", ok: false },
          { label: "Drift severity reviewed", ok: false },
          { label: "First drift turn inspected", ok: false },
          { label: "Repro CLI validated", ok: false },
          { label: "Package hash verified", ok: false },
        ];
      }
      return [
        { label: "Manifest integrity verified", ok: supportPackageManifestIntegrity.allTrue },
        { label: "Replay telemetry consistent", ok: supportPackageManifestIntegrity.telemetryConsistent },
        { label: "Drift severity reviewed", ok: !!supportPackageData },
        {
          label: "First drift turn inspected",
          ok:
            !!supportPackageData &&
            (supportPackageData.drift.severity === "NONE" ||
              typeof supportPackageData.drift.firstDriftTurnIndex === "number"),
        },
        { label: "Repro CLI validated", ok: !!supportPackageData },
        { label: "Package hash verified", ok: supportPackageHashBadge.label === "PACKAGE_HASH verified" },
      ];
    },
    [
      supportPackageIntakeBlocked,
      supportPackageData,
      supportPackageHashBadge.label,
      supportPackageManifestIntegrity.allTrue,
      supportPackageManifestIntegrity.telemetryConsistent,
    ],
  );

  const supportPackageChecklistText = useMemo(
    () =>
      supportPackageIntakeBlocked
        ? "Unsupported Support Package Version"
        : buildSupportPackageChecklistText(supportPackageChecklistRows),
    [supportPackageChecklistRows, supportPackageIntakeBlocked],
  );

  const supportPackageIssueDraftText = useMemo(() => {
    if (supportPackageIntakeBlocked) {
      return "Unsupported Support Package Version";
    }
    if (!supportPackageData) {
      return buildSupportPackageIssueDraftText({
        manifestHash: "(none)",
        packageHash: "(none)",
        engineVersion: "(none)",
        scenarioContentHash: "(none)",
        driftSeverity: "(none)",
        firstDriftTurnIndex: "(none)",
        firstDriftMetric: "(none)",
        replayInvariant: "(none)",
      });
    }
    return buildSupportPackageIssueDraftText({
      manifestHash: supportPackageData.manifestHash,
      packageHash: supportPackageComputedHash || "(none)",
      engineVersion: supportPackageData.manifest.engineVersion ?? "(none)",
      scenarioContentHash: supportPackageData.manifest.scenarioContentHash ?? "(none)",
      driftSeverity: supportPackageData.drift.severity,
      firstDriftTurnIndex:
        typeof supportPackageData.drift.firstDriftTurnIndex === "number"
          ? String(supportPackageData.drift.firstDriftTurnIndex)
          : "(none)",
      firstDriftMetric: supportPackageData.drift.firstDriftMetric ?? "(none)",
      replayInvariant: supportPackageManifestIntegrity.allTrue ? "PASS" : "FAIL",
    });
  }, [supportPackageComputedHash, supportPackageData, supportPackageIntakeBlocked, supportPackageManifestIntegrity.allTrue]);

  const supportPackageCliHelperText = useMemo(
    () =>
      [
        "node --import tsx scripts/replay-from-bundle.ts --bundle-path=./path/to/bundle.json --manifest-json",
        "node --import tsx scripts/build-support-package.ts --bundle-path=./path/to/bundle.json --out-dir=./support-output",
      ].join("\n"),
    [],
  );

  const leftPackageDiffState = useMemo(() => {
    const text = leftPackageJson.trim();
    if (!text) return { pkg: null as SupportPackageV1 | null, error: "" };
    const parsed = parseSupportPackageJson(text);
    return { pkg: parsed.pkg, error: parsed.pkg ? "" : parsed.error };
  }, [leftPackageJson]);

  const rightPackageDiffState = useMemo(() => {
    const text = rightPackageJson.trim();
    if (!text) return { pkg: null as SupportPackageV1 | null, error: "" };
    const parsed = parseSupportPackageJson(text);
    return { pkg: parsed.pkg, error: parsed.pkg ? "" : parsed.error };
  }, [rightPackageJson]);

  const supportPackageDiffRows = useMemo(() => {
    if (!leftPackageDiffState.pkg || !rightPackageDiffState.pkg) return [] as SupportPackageDiffRow[];
    return buildSupportPackageDiffRows(leftPackageDiffState.pkg, rightPackageDiffState.pkg);
  }, [leftPackageDiffState.pkg, rightPackageDiffState.pkg]);

  const supportPackageFirstDivergence = useMemo(() => {
    const first = supportPackageDiffRows.find((row) => !row.same);
    return first ? first.label : "(none)";
  }, [supportPackageDiffRows]);

  const noBundleLoaded = bundleData == null;
  const noSupportPackageLoaded = supportPackageData == null;
  const noDiffComparisonLoaded = !leftPackageDiffState.pkg || !rightPackageDiffState.pkg;

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
    const failForwardSignalByTurn = new Map<number, string>();
    const consequenceByTurn = new Map<number, ReturnType<typeof classifyConsequence>>();
    const stakesReasonByTurn = new Map<number, string[]>();
    turnRows.forEach((row, index) => {
      const turnIndex = parseTurnIndex(row.turnIndex, index);
      const signal = classifyFailForwardSignal(row.rawTurn);
      const consequence = classifyConsequence(row.rawTurn);
      const reasonLines = explainConsequence(row.rawTurn);
      if (signal) {
        failForwardSignalByTurn.set(turnIndex, signal);
      }
      consequenceByTurn.set(turnIndex, consequence);
      stakesReasonByTurn.set(turnIndex, reasonLines);
    });

    if (supportManifest) {
      return [...supportManifest.perTurn]
        .map((row) => ({
          ...row,
          failForwardSignal: failForwardSignalByTurn.get(row.turnIndex) ?? "",
          riskLevel: (consequenceByTurn.get(row.turnIndex)?.riskLevel ?? "LOW") as "LOW" | "MODERATE" | "HIGH",
          costTypes: (consequenceByTurn.get(row.turnIndex)?.costTypes ?? []).join(","),
          escalation: (consequenceByTurn.get(row.turnIndex)?.escalation ?? "NONE") as "NONE" | "MINOR" | "MAJOR",
          stakesReason: stakesReasonByTurn.get(row.turnIndex) ?? [],
        }))
        .sort((a, b) => (a.turnIndex === b.turnIndex ? 0 : a.turnIndex < b.turnIndex ? -1 : 1));
    }

    const rows = turnRows.map((row, index) => {
      const turnIndex = parseTurnIndex(row.turnIndex, index);
      const consequence = consequenceByTurn.get(turnIndex) ?? classifyConsequence(row.rawTurn);
      return {
        turnIndex,
        deltaCount: row.stateDeltas.length,
        ledgerCount: row.ledgerAdds.length,
        hasResolution: row.resolution !== "(none)",
        failForwardSignal: failForwardSignalByTurn.get(turnIndex) ?? "",
        riskLevel: consequence.riskLevel,
        costTypes: consequence.costTypes.join(","),
        escalation: consequence.escalation,
        stakesReason: stakesReasonByTurn.get(turnIndex) ?? [],
      };
    });
    rows.sort((a, b) => (a.turnIndex === b.turnIndex ? 0 : a.turnIndex < b.turnIndex ? -1 : 1));
    return rows;
  }, [supportManifest, turnRows]);

  const styleStability = useMemo<StyleStabilityPanel>(() => {
    if (turnRows.length === 0) {
      return {
        toneStable: true,
        genreStable: true,
        pacingStable: true,
        driftCount: 0,
      };
    }

    try {
      const events = turnRows
        .map((row, index) => {
          const turnIndex = parseTurnIndex(row.turnIndex, index);
          const rawTurn = isRecord(row.rawTurn) ? row.rawTurn : {};
          const deltas = Array.isArray(rawTurn.deltas) ? rawTurn.deltas : row.stateDeltas;
          const ledgerAdds = Array.isArray(rawTurn.ledgerAdds) ? rawTurn.ledgerAdds : row.ledgerAdds;
          return {
            seq: turnIndex,
            turnJson: {
              ...rawTurn,
              deltas,
              ledgerAdds,
            },
          };
        })
        .sort((a, b) => (a.seq === b.seq ? 0 : a.seq < b.seq ? -1 : 1));
      return deriveStyleStabilityFromEvents(events);
    } catch {
      return {
        toneStable: false,
        genreStable: false,
        pacingStable: false,
        driftCount: 0,
      };
    }
  }, [turnRows]);

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
      `FAIL_FORWARD_SIGNAL: ${rowForReport ? rowForReport.failForwardSignal || "(none)" : "(none)"}`,
      `RISK_LEVEL: ${rowForReport ? rowForReport.riskLevel : "(none)"}`,
      `COST_TYPES: ${rowForReport ? rowForReport.costTypes || "(none)" : "(none)"}`,
      `ESCALATION: ${rowForReport ? rowForReport.escalation : "(none)"}`,
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

  const driftParityMismatch = useMemo(
    () => !!supportPackageData && supportPackageData.drift.severity !== telemetryDrift.severity,
    [supportPackageData, telemetryDrift.severity],
  );

  const packageTamperDetected = supportPackageHashBadge.label === "PACKAGE TAMPER DETECTED";
  const integrityFailure = !!supportPackageData && !supportPackageManifestIntegrity.allTrue;
  const validationComplete =
    !!supportPackageData &&
    !supportPackageIntakeBlocked &&
    !integrityFailure &&
    !packageTamperDetected &&
    intakeConsistencyState.status === "pass" &&
    !driftParityMismatch;

  const nextActionText = useMemo(() => {
    if (integrityFailure || supportPackageIntakeBlocked || packageTamperDetected || intakeConsistencyState.status === "fail") {
      return "Resolve integrity before proceeding.";
    }
    if (telemetryDrift.isDrift || driftParityMismatch) {
      return "Inspect first drift turn.";
    }
    if (validationComplete) {
      return "Safe to generate issue draft.";
    }
    return "Resolve integrity before proceeding.";
  }, [
    driftParityMismatch,
    intakeConsistencyState.status,
    integrityFailure,
    packageTamperDetected,
    supportPackageIntakeBlocked,
    telemetryDrift.isDrift,
    validationComplete,
  ]);

  const criticalAnchorsText = useMemo(
    () =>
      buildSupportCriticalAnchorsText({
        manifestHash: supportPackageData?.manifestHash ?? "",
        packageHash: supportPackageComputedHash,
        finalStateHash: replayTelemetry.finalStateHash,
        driftSeverity: supportPackageData?.drift.severity ?? telemetryDrift.severity,
      }),
    [replayTelemetry.finalStateHash, supportPackageComputedHash, supportPackageData, telemetryDrift.severity],
  );

  const advancedDiagnosticsPerTurnText = useMemo(
    () =>
      perTurnTelemetry.length === 0
        ? "(none)"
        : perTurnTelemetry
            .map(
              (row) =>
                `TURN_INDEX: ${row.turnIndex} DELTA_COUNT: ${row.deltaCount} LEDGER_COUNT: ${row.ledgerCount} HAS_RESOLUTION: ${row.hasResolution} FAIL_FORWARD_SIGNAL: ${row.failForwardSignal} RISK_LEVEL: ${row.riskLevel} COST_TYPES: ${row.costTypes} ESCALATION: ${row.escalation}`,
            )
            .join("\n"),
    [perTurnTelemetry],
  );

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

  const selectedTurnCausal = useMemo(() => {
    if (!selectedTurn) {
      return {
        rows: [] as Array<{
          deltaPath: string;
          ledgerExplanations: string[];
          ledgerIndexes: number[];
          explained: boolean;
        }>,
        coverage: { totalDeltas: 0, explainedDeltas: 0, unexplainedDeltas: 0, coverageRatio: 1 },
      };
    }
    return buildDeltaLedgerExplanationRows({
      deltas: selectedTurn.stateDeltas,
      ledgerAdds: selectedTurn.ledgerAdds,
      allowImplicitSinglePair: true,
      systemNoLedger: false,
    });
  }, [selectedTurn]);

  const selectedTurnLedgerExplanationCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of selectedTurnCausal.rows) {
      for (const ledgerIndex of row.ledgerIndexes) {
        counts.set(ledgerIndex, (counts.get(ledgerIndex) ?? 0) + 1);
      }
    }
    return counts;
  }, [selectedTurnCausal.rows]);

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
    const normalized = normalizeCopyBlock(text);
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      onStatus("Copy not supported");
      return;
    }

    await navigator.clipboard.writeText(normalized);
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

  function applySupportPackage(pkg: SupportPackageV1, sourceText: string) {
    setSupportPackageData(pkg);
    setSupportPackageJsonText(sourceText);
    setSupportPackageStatus("Support package loaded.");
    setSupportPackageHashReference(readSupportPackageHashCandidate(pkg));
    setPastedBundleData(pkg.originalBundle);
    setBundleJsonStatus("Bundle JSON parsed.");
  }

  function onImportSupportPackageJson() {
    const parsed = parseSupportPackageJson(supportPackageJsonText);
    if (!parsed.pkg) {
      setSupportPackageData(null);
      setSupportPackageStatus(parsed.error);
      return;
    }
    applySupportPackage(parsed.pkg, supportPackageJsonText);
  }

  function onSupportPackageFileChange(file: File | null) {
    if (!file) {
      setSupportPackageStatus("No support package file selected.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseSupportPackageJson(text);
      if (!parsed.pkg) {
        setSupportPackageData(null);
        setSupportPackageJsonText(text);
        setSupportPackageStatus(parsed.error);
        return;
      }
      applySupportPackage(parsed.pkg, text);
    };
    reader.onerror = () => {
      setSupportPackageStatus("Support package file read failed.");
    };
    reader.readAsText(file);
  }

  async function onCopySupportPackageManifestHash() {
    const hash = supportPackageData?.manifestHash ?? "";
    if (!hash) {
      setSupportPackageManifestHashCopyStatus("Copy not supported");
      return;
    }
    await copyText(hash, setSupportPackageManifestHashCopyStatus);
  }

  async function onCopySupportPackagePackageHash() {
    const hash = supportPackageComputedHash;
    if (!hash) {
      setSupportPackagePackageHashCopyStatus("Copy not supported");
      return;
    }
    await copyText(hash, setSupportPackagePackageHashCopyStatus);
  }

  async function onCopySupportPackageManifestWarning() {
    if (!supportPackageManifestWarningText) {
      setSupportPackageManifestWarningCopyStatus("Copy not supported");
      return;
    }
    await copyText(supportPackageManifestWarningText, setSupportPackageManifestWarningCopyStatus);
  }

  async function onCopySupportPackageImmutableHashes() {
    if (!supportPackageData) {
      setSupportPackageImmutableHashCopyStatus("Copy not supported");
      return;
    }
    const text = [
      `MANIFEST_HASH: ${supportPackageData.manifestHash}`,
      `PACKAGE_HASH: ${supportPackageComputedHash || "(none)"}`,
    ].join("\n");
    await copyText(text, setSupportPackageImmutableHashCopyStatus);
  }

  async function onCopySupportPackageChecklist() {
    await copyText(supportPackageChecklistText, setSupportPackageChecklistCopyStatus);
  }

  async function onCopySupportPackageIssueDraft() {
    await copyText(supportPackageIssueDraftText, setSupportPackageIssueCopyStatus);
  }

  async function onCopyCriticalAnchors() {
    await copyText(criticalAnchorsText, setCriticalAnchorsCopyStatus);
  }

  async function onCopySupportPackageCliHelper() {
    await copyText(supportPackageCliHelperText, setSupportPackageCliCopyStatus);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        void copyText(issueBlockText, setIssueCopyStatus);
      }
      if (key === "h") {
        event.preventDefault();
        void onCopyCriticalAnchors();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [criticalAnchorsText, issueBlockText]);

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

      {noBundleLoaded || noSupportPackageLoaded || noDiffComparisonLoaded ? (
        <section className="mt-4 rounded border p-4 text-sm" aria-label="Deterministic Empty States">
          <h2 className="text-base font-semibold">Deterministic Empty States</h2>
          {noBundleLoaded ? (
            <div className="mt-2 rounded border p-2 text-xs">
              <div className="font-semibold">NO BUNDLE LOADED</div>
              <div>→ Paste JSON</div>
              <div>→ Or load .support.json file</div>
              <div>→ Then verify integrity</div>
            </div>
          ) : null}
          {noSupportPackageLoaded ? (
            <div className="mt-2 rounded border p-2 text-xs">
              <div className="font-semibold">NO SUPPORT PACKAGE LOADED</div>
              <div>→ Paste JSON</div>
              <div>→ Or load .support.json file</div>
              <div>→ Then verify integrity</div>
            </div>
          ) : null}
          {noDiffComparisonLoaded ? (
            <div className="mt-2 rounded border p-2 text-xs">
              <div className="font-semibold">NO DIFF COMPARISON LOADED</div>
              <div>→ Paste JSON</div>
              <div>→ Or load .support.json file</div>
              <div>→ Then verify integrity</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 rounded border p-4 text-sm" aria-label="What To Do Next">
        <h2 className="text-base font-semibold">What To Do Next</h2>
        <div className="mt-2 text-xs">{nextActionText}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Deterministic Badge Legend">
        <h2 className="text-base font-semibold">Deterministic Badge Legend</h2>
        <div className="mt-2 text-xs">GREEN = verified</div>
        <div className="text-xs">YELLOW = warning</div>
        <div className="text-xs">RED = blocking failure</div>
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

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Import Support Package">
        <h2 className="text-base font-semibold">Import Support Package</h2>
        <div className="mt-2 text-xs">Paste support-package JSON and load deterministic triage state.</div>
        <label htmlFor="support-package-json" className="mt-2 mb-1 block text-xs">
          Paste support-package JSON
        </label>
        <textarea
          id="support-package-json"
          value={supportPackageJsonText}
          onChange={(e) => setSupportPackageJsonText(e.target.value)}
          readOnly={supportPackageReadOnly}
          className="w-full rounded border p-2 font-mono text-xs"
          rows={8}
          placeholder='{"packageVersion":1,"manifest":{"manifestVersion":1},"manifestHash":"..."}'
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={onImportSupportPackageJson}>
            Import support package
          </button>
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={supportPackageReadOnly}
              onChange={(e) => setSupportPackageReadOnly(e.target.checked)}
            />
            Locked Read-Only Mode
          </label>
          <label className="inline-flex items-center gap-2 text-xs">
            Load .support.json file
            <input
              type="file"
              accept=".json,.support.json,application/json"
              onChange={(e) => onSupportPackageFileChange(e.target.files?.[0] ?? null)}
              disabled={supportPackageReadOnly}
            />
          </label>
        </div>
        <div className="mt-2">
          <label htmlFor="support-package-hash-ref" className="text-xs">
            PACKAGE_HASH (optional)
          </label>
          <input
            id="support-package-hash-ref"
            value={supportPackageHashReference}
            onChange={(e) => setSupportPackageHashReference(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-xs"
            placeholder="sha256 from copy block"
          />
        </div>
        <div className="mt-2 text-xs" role="status" aria-live="polite">
          {supportPackageStatus}
        </div>
      </section>

      {supportPackageIntakeBlocked ? (
        <section className="mt-4 rounded border border-red-600 p-4 text-sm" aria-label="Unsupported Support Package Version">
          <h2 className="text-base font-semibold text-red-700">Unsupported Support Package Version</h2>
          <div className="mt-2 text-xs">Expected packageVersion: {SUPPORT_PACKAGE_VERSION}</div>
          <div className="text-xs">Actual packageVersion: {supportPackageData?.packageVersion ?? "(none)"}</div>
          <div className="mt-1 text-xs">Checklist and draft generation are blocked for unsupported package versions.</div>
        </section>
      ) : null}

      {supportPackageData && !supportManifestVersionSupported ? (
        <section className="mt-4 rounded border border-amber-600 p-4 text-sm" aria-label="Manifest Version Gate Warning">
          <h2 className="text-base font-semibold text-amber-700">Manifest Version Gate Warning</h2>
          <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">{supportPackageManifestWarningText}</pre>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={onCopySupportPackageManifestWarning}
            >
              Copy manifest version warning
            </button>
            <span role="status" aria-live="polite">
              {supportPackageManifestWarningCopyStatus}
            </span>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Package Header Summary">
        <h2 className="text-base font-semibold">Package Header Summary</h2>
        <div className="mt-2 text-xs">PACKAGE_VERSION: {supportPackageData?.packageVersion ?? "(none)"}</div>
        <div className="text-xs">MANIFEST_VERSION: {supportPackageData?.manifest.manifestVersion ?? "(none)"}</div>
        <div className="text-xs">
          MANIFEST_HASH:{" "}
          {supportPackageData?.manifestHash ? `${supportPackageData.manifestHash.slice(0, 16)}...` : "(none)"}
        </div>
        <div className="text-xs">FINAL_STATE_HASH: {supportPackageData?.replay.finalStateHash ?? "(none)"}</div>
        <div className="text-xs">DRIFT_SEVERITY: {supportPackageData?.drift.severity ?? "(none)"}</div>
        <div className="text-xs">TURN_COUNT: {supportPackageData?.manifest.replay.turnCount ?? "(none)"}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackageManifestHash}
            disabled={!supportPackageData?.manifestHash}
          >
            Copy manifest hash
          </button>
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={onCopyCriticalAnchors}>
            Copy all critical anchors
          </button>
          <span role="status" aria-live="polite">
            {supportPackageManifestHashCopyStatus || criticalAnchorsCopyStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Manifest Integrity Badge">
        <h2 className="text-base font-semibold">Manifest Integrity Badge</h2>
        <div className={`mt-2 font-medium ${supportPackageManifestIntegrity.allTrue ? "text-green-700" : "text-red-700"}`}>
          {supportPackageManifestIntegrity.allTrue ? "GREEN: All true" : "RED: Any false"}
        </div>
        <ul className="mt-2 list-disc pl-5 text-xs">
          <li>derivedManifestHashMatches: {String(supportPackageManifestIntegrity.derivedManifestHashMatches)}</li>
          <li>integrity.manifestHashMatches: {String(supportPackageManifestIntegrity.manifestHashMatches)}</li>
          <li>
            integrity.replayFinalStateMatchesManifest:{" "}
            {String(supportPackageManifestIntegrity.replayFinalStateMatchesManifest)}
          </li>
          <li>integrity.telemetryConsistent: {String(supportPackageManifestIntegrity.telemetryConsistent)}</li>
        </ul>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Package Hash Recompute Badge">
        <h2 className="text-base font-semibold">Package Hash Recompute Badge</h2>
        <div className="mt-2 text-xs">PACKAGE_HASH_COMPUTED: {supportPackageComputedHash || "(none)"}</div>
        <div className="text-xs">PACKAGE_HASH_REFERENCE: {supportPackageHashReference || "(none)"}</div>
        <div className={`mt-1 font-medium ${supportPackageHashBadge.cls}`}>{supportPackageHashBadge.label}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Deterministic Error Surface">
        <h2 className="text-base font-semibold">Deterministic Error Surface</h2>
        <div className={`mt-2 text-xs ${integrityFailure ? "text-red-700" : ""}`}>
          INTEGRITY FAILURE: {integrityFailure ? "YES" : "NO"}
        </div>
        <div className={`text-xs ${packageTamperDetected ? "text-red-700" : ""}`}>
          PACKAGE TAMPER DETECTED: {packageTamperDetected ? "YES" : "NO"}
        </div>
        <div className={`text-xs ${intakeConsistencyState.status === "fail" ? "text-red-700" : ""}`}>
          INTAKE CONSISTENCY FAILURE: {intakeConsistencyState.status === "fail" ? "YES" : "NO"}
        </div>
        <div className={`text-xs ${driftParityMismatch ? "text-red-700" : ""}`}>
          DRIFT PARITY MISMATCH: {driftParityMismatch ? "YES" : "NO"}
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Immutable Hash Anchor Display">
        <h2 className="text-base font-semibold">Immutable Hash Anchor Display</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs">Show full immutable hash anchors</summary>
          <div className="mt-2 rounded border p-2">
            <div className="text-xs">MANIFEST_HASH_FULL: {supportPackageData?.manifestHash || "(none)"}</div>
            <div className="text-xs">PACKAGE_HASH_FULL: {supportPackageComputedHash || "(none)"}</div>
          </div>
        </details>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackageManifestHash}
            disabled={!supportPackageData?.manifestHash}
          >
            Copy full manifest hash
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackagePackageHash}
            disabled={!supportPackageComputedHash}
          >
            Copy full package hash
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackageImmutableHashes}
            disabled={!supportPackageData}
          >
            Copy immutable hash anchors
          </button>
        </div>
        <div className="mt-1 text-xs">
          {supportPackageManifestHashCopyStatus || supportPackagePackageHashCopyStatus || supportPackageImmutableHashCopyStatus}
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Intake Consistency Self-Test">
        <h2 className="text-base font-semibold">Intake Consistency Self-Test</h2>
        <div
          className={`mt-2 font-medium ${
            intakeConsistencyState.status === "fail"
              ? "text-red-700"
              : intakeConsistencyState.status === "pass"
                ? "text-green-700"
                : "text-amber-700"
          }`}
        >
          {intakeConsistencyState.message}
        </div>
        <div className="mt-1 text-xs">
          rebuiltManifestHash === package.manifestHash:{" "}
          {String(
            !!supportPackageData &&
              intakeConsistencyState.rebuiltManifestHash.length > 0 &&
              intakeConsistencyState.rebuiltManifestHash === supportPackageData.manifestHash,
          )}
        </div>
        <div className="text-xs">
          rebuiltFinalStateHash === manifest.replay.finalStateHash:{" "}
          {String(
            !!supportPackageData &&
              intakeConsistencyState.rebuiltFinalStateHash.length > 0 &&
              intakeConsistencyState.rebuiltFinalStateHash === supportPackageData.manifest.replay.finalStateHash,
          )}
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Structured Incident Checklist">
        <h2 className="text-base font-semibold">Structured Incident Checklist</h2>
        {supportPackageIntakeBlocked ? (
          <div className="mt-2 text-xs text-red-700">Unsupported Support Package Version</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            {supportPackageChecklistRows.map((row) => (
              <li key={row.label}>
                {row.label}: {row.ok ? "PASS" : "FAIL"}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackageChecklist}
            disabled={supportPackageIntakeBlocked}
          >
            Copy Checklist
          </button>
          <span role="status" aria-live="polite">
            {supportPackageChecklistCopyStatus}
          </span>
        </div>
        {!supportPackageIntakeBlocked ? (
          <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">{supportPackageChecklistText}</pre>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Deterministic Issue Draft Generator (Package-aware)">
        <h2 className="text-base font-semibold">Deterministic Issue Draft Generator (Package-aware)</h2>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={onCopySupportPackageIssueDraft}
            disabled={supportPackageIntakeBlocked}
          >
            Copy package issue draft
          </button>
          <span role="status" aria-live="polite">
            {supportPackageIssueCopyStatus}
          </span>
        </div>
        {supportPackageIntakeBlocked ? (
          <div className="mt-2 text-xs text-red-700">Unsupported Support Package Version</div>
        ) : (
          <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">{supportPackageIssueDraftText}</pre>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Package Diff Mode">
        <h2 className="text-base font-semibold">Package Diff Mode</h2>
        <div className="mt-2">
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setRightPackageJson("")}
          >
            Clear Diff Comparison
          </button>
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="support-package-left" className="mb-1 block text-xs">
              Left support package JSON
            </label>
            <textarea
              id="support-package-left"
              value={leftPackageJson}
              onChange={(e) => setLeftPackageJson(e.target.value)}
              className="w-full rounded border p-2 font-mono text-xs"
              rows={8}
            />
            <div className="mt-1 text-xs">{leftPackageDiffState.error || "Left package ready."}</div>
          </div>
          <div>
            <label htmlFor="support-package-right" className="mb-1 block text-xs">
              Right support package JSON
            </label>
            <textarea
              id="support-package-right"
              value={rightPackageJson}
              onChange={(e) => setRightPackageJson(e.target.value)}
              className="w-full rounded border p-2 font-mono text-xs"
              rows={8}
            />
            <div className="mt-1 text-xs">{rightPackageDiffState.error || "Right package ready."}</div>
          </div>
        </div>
        {supportPackageDiffRows.length === 0 ? (
          <div className="mt-2 text-xs">NO DIFF COMPARISON LOADED</div>
        ) : (
          <div className="mt-2">
            <div className="text-xs">First divergence: {supportPackageFirstDivergence}</div>
            <table className="mt-2 w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border p-2 text-left">field</th>
                  <th className="border p-2 text-left">left</th>
                  <th className="border p-2 text-left">right</th>
                </tr>
              </thead>
              <tbody>
                {supportPackageDiffRows.map((row) => (
                  <tr key={row.label} className={row.same ? "" : "bg-red-50"}>
                    <td className="border p-2">{row.label}</td>
                    <td className="border p-2">{row.left}</td>
                    <td className="border p-2">{row.right}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Open in Replay CLI">
        <h2 className="text-base font-semibold">Open in Replay CLI</h2>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={onCopySupportPackageCliHelper}>
            Copy Replay CLI helper
          </button>
          <span role="status" aria-live="polite">
            {supportPackageCliCopyStatus}
          </span>
        </div>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">{supportPackageCliHelperText}</pre>
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

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Style stability">
        <h2 className="text-base font-semibold">STYLE STABILITY</h2>
        <div className={`mt-2 text-xs ${styleStability.toneStable ? "text-green-700" : "text-red-700"}`}>
          Tone: {styleStability.toneStable ? "STABLE" : "DRIFTED"}
        </div>
        <div className={`text-xs ${styleStability.genreStable ? "text-green-700" : "text-red-700"}`}>
          Genre: {styleStability.genreStable ? "STABLE" : "DRIFTED"}
        </div>
        <div className={`text-xs ${styleStability.pacingStable ? "text-green-700" : "text-red-700"}`}>
          Pacing: {styleStability.pacingStable ? "STABLE" : "DRIFTED"}
        </div>
        <div className="text-xs">Drift Count: {styleStability.driftCount}</div>
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
                <th className="border p-2 text-left">FAIL_FORWARD_SIGNAL</th>
                <th className="border p-2 text-left">RISK_LEVEL</th>
                <th className="border p-2 text-left">COST_TYPES</th>
                <th className="border p-2 text-left">ESCALATION</th>
              </tr>
            </thead>
            <tbody>
              {perTurnTelemetry.length === 0 ? (
                <tr>
                  <td className="border p-2" colSpan={8}>
                    (none)
                  </td>
                </tr>
              ) : (
                perTurnTelemetry.map((row) => (
                  <tr
                    key={`per-turn-${row.turnIndex}`}
                    className={row.riskLevel === "HIGH" ? "bg-red-50 text-red-800" : ""}
                  >
                    <td className="border p-2">{row.turnIndex}</td>
                    <td className="border p-2">{row.deltaCount}</td>
                    <td className="border p-2">{row.ledgerCount}</td>
                    <td className="border p-2">{String(row.hasResolution)}</td>
                    <td className="border p-2">{row.failForwardSignal}</td>
                    <td className="border p-2" title={row.stakesReason.length > 0 ? row.stakesReason.join("\n") : "(none)"}>
                      {row.riskLevel}
                    </td>
                    <td className="border p-2">{row.costTypes || "(none)"}</td>
                    <td className="border p-2">{row.escalation}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Advanced Diagnostics">
        <h2 className="text-base font-semibold">Advanced Diagnostics</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs">Show advanced diagnostics</summary>
          <div className="mt-2 space-y-3 text-xs">
            <div>
              <div className="font-semibold">Per-turn telemetry</div>
              <pre className="mt-1 rounded border p-2 whitespace-pre-wrap">{advancedDiagnosticsPerTurnText}</pre>
            </div>
            <div>
              <div className="font-semibold">Drift details</div>
              <pre className="mt-1 rounded border p-2 whitespace-pre-wrap">
                {telemetryDrift.details.length > 0 ? telemetryDrift.details.join("\n") : "(none)"}
              </pre>
            </div>
            <div>
              <div className="font-semibold">Raw manifest</div>
              <pre className="mt-1 rounded border p-2 whitespace-pre-wrap">{supportManifestJson || "(none)"}</pre>
            </div>
            <div>
              <div className="font-semibold">Raw package JSON</div>
              <pre className="mt-1 rounded border p-2 whitespace-pre-wrap">
                {supportPackageJsonText.trim() || "(none)"}
              </pre>
            </div>
          </div>
        </details>
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

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Export Support Package">
        <h2 className="text-base font-semibold">Export Support Package</h2>
        <div className="mt-2 text-xs">Support package version: {SUPPORT_PACKAGE_VERSION}</div>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap text-xs">
          {[
            "node --import tsx scripts/build-support-package.ts \\",
            "  --bundle-path=./path/to/bundle.json \\",
            "  --out-dir=./support-output",
          ].join("\n")}
        </pre>
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
        <div className="mt-1 text-xs">
          Keyboard shortcuts: Ctrl + Shift + C (Copy Issue Draft), Ctrl + Shift + H (Copy Hash Anchors)
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

            <div className="mt-3 rounded border p-3" aria-label="Why This Changed">
              <div className="font-semibold">Why This Changed</div>
              <div className="mt-1 text-xs">
                explainedDeltas: {selectedTurnCausal.coverage.explainedDeltas} / {selectedTurnCausal.coverage.totalDeltas}
              </div>
              <div className="mt-1 text-xs">coverageRatio: {selectedTurnCausal.coverage.coverageRatio}</div>
              {selectedTurnCausal.coverage.unexplainedDeltas > 0 ? (
                <div className="mt-1 text-xs font-semibold text-red-700">UNEXPLAINED DELTA</div>
              ) : null}
              {selectedTurn && selectedTurnLedgerExplanationCount.size > 0 ? (
                <div className="mt-1 text-xs">
                  {Array.from(selectedTurnLedgerExplanationCount.entries())
                    .filter(([, count]) => count > 1)
                    .sort((a, b) => a[0] - b[0])
                    .map(([ledgerIndex, count]) => {
                      const prefix = `#${ledgerIndex}`;
                      return `${prefix} MULTI_DELTA_EXPLANATION(${count})`;
                    })
                    .join(" | ") || "(no multi-delta ledger entries)"}
                </div>
              ) : null}
              <div className="mt-2 overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border p-2 text-left">Delta Path</th>
                      <th className="border p-2 text-left">Ledger Explanation(s)</th>
                      <th className="border p-2 text-left">Highlights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTurnCausal.rows.length === 0 ? (
                      <tr>
                        <td className="border p-2" colSpan={3}>
                          (none)
                        </td>
                      </tr>
                    ) : (
                      selectedTurnCausal.rows.map((row, index) => (
                        <tr key={`${selectedTurn.turnKey}-causal-${row.deltaPath}-${index}`}>
                          <td className="border p-2">{row.deltaPath}</td>
                          <td className="border p-2">
                            {row.ledgerExplanations.length > 0 ? row.ledgerExplanations.join(" || ") : "(none)"}
                          </td>
                          <td className="border p-2">
                            {row.ledgerIndexes.length > 1 ? "MULTI_LEDGER_REFERENCES" : "(none)"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

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

      <footer className="mt-4 rounded border p-4 text-sm" aria-label="Operator Confirmation Footer">
        <div className={`font-semibold ${validationComplete ? "text-green-700" : "text-red-700"}`}>
          {validationComplete ? "DETERMINISTIC VALIDATION COMPLETE" : "VALIDATION INCOMPLETE"}
        </div>
      </footer>
    </main>
  );
}
