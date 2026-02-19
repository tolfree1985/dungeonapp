"use client";

import { useMemo, useState } from "react";
import { categorizeDeltaPath } from "@/lib/support/deltaPathMeaningMap";
import { buildDeterministicReproCliText } from "@/lib/support/buildDeterministicReproCliText";
import { buildSupportShareBlockText } from "@/lib/support/buildSupportShareBlockText";
import { buildSupportTurnReproBlockText } from "@/lib/support/buildSupportTurnReproBlockText";

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
