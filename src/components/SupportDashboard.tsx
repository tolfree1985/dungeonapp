"use client";

import { useMemo, useState } from "react";

type RunbookLink = {
  label: string;
  path: string;
  exists: boolean;
};

type SupportDashboardProps = {
  debugEndpointAvailable: boolean;
  runbookLinks: RunbookLink[];
};

type DiffRow = {
  path: string;
  kind: "added" | "removed" | "changed";
  left: string;
  right: string;
};

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

function readStringField(bundle: unknown, key: string): string {
  if (!isRecord(bundle)) return "";
  const value = bundle[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function readChecklistField(bundle: unknown, key: string): string {
  const value = readStringField(bundle, key).trim();
  return value;
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

export function SupportDashboard({ debugEndpointAvailable, runbookLinks }: SupportDashboardProps) {
  const [bundleId, setBundleId] = useState("");
  const [bundleStatus, setBundleStatus] = useState("No bundle loaded.");
  const [bundleData, setBundleData] = useState<unknown | null>(null);
  const [redactionPreview, setRedactionPreview] = useState(false);
  const [issueCopyStatus, setIssueCopyStatus] = useState("");
  const [leftCompareJson, setLeftCompareJson] = useState("");
  const [rightCompareJson, setRightCompareJson] = useState("");

  const checklistRows = useMemo(
    () => [
      { key: "engineVersion", label: "engineVersion" },
      { key: "scenarioContentHash", label: "scenarioContentHash" },
      { key: "adventureId", label: "adventureId" },
      { key: "latestTurnIndex", label: "latestTurnIndex" },
      { key: "buildVersion", label: "buildVersion" },
    ],
    [],
  );

  const bundleEngineVersion = readStringField(bundleData, "engineVersion");
  const bundleScenarioHash = readStringField(bundleData, "scenarioContentHash");

  const issueBlockText = useMemo(
    () =>
      buildIssueBlock({
        bundleId,
        engineVersion: bundleEngineVersion,
        scenarioContentHash: bundleScenarioHash,
      }),
    [bundleEngineVersion, bundleId, bundleScenarioHash],
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

  async function onLoadBundle() {
    const id = bundleId.trim();
    if (!id) {
      setBundleData(null);
      setBundleStatus("bundleId is required.");
      return;
    }

    if (!debugEndpointAvailable) {
      setBundleData(null);
      setBundleStatus("Debug bundle endpoint not found.");
      return;
    }

    try {
      const res = await fetch(`/api/debug/bundle/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setBundleData(null);
        setBundleStatus("Bundle not found.");
        return;
      }

      const json = await res.json().catch(() => null);
      if (json == null) {
        setBundleData(null);
        setBundleStatus("Bundle payload invalid.");
        return;
      }

      setBundleData(json);
      setBundleStatus("Bundle loaded.");
    } catch {
      setBundleData(null);
      setBundleStatus("Bundle request failed.");
    }
  }

  async function onCopyIssueBlock() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setIssueCopyStatus("Copy not supported");
      return;
    }

    await navigator.clipboard.writeText(issueBlockText);
    setIssueCopyStatus("Copied");
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
        <div className="mt-1 text-xs">
          Endpoint availability: {debugEndpointAvailable ? "available" : "not found"}
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Reproduction Checklist">
        <h2 className="text-base font-semibold">Reproduction Checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {checklistRows.map((row) => {
            const value = readChecklistField(bundleData, row.key);
            const hasValue = value.length > 0;
            return (
              <li key={row.key} className={hasValue ? "text-green-700" : "text-red-700"}>
                {row.label}: {hasValue ? value : "missing"}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Issue Draft Generator">
        <h2 className="text-base font-semibold">Issue Draft Generator</h2>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyIssueBlock} className="rounded border px-2 py-1 text-xs">
            Copy issue block
          </button>
          <span role="status" aria-live="polite">
            {issueCopyStatus}
          </span>
        </div>
        <pre className="mt-2 rounded border p-2 whitespace-pre-wrap">{issueBlockText}</pre>
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
      </section>
    </main>
  );
}
