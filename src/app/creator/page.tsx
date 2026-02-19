"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCreatorDebugBundleText } from "@/lib/buildCreatorDebugBundleText";
import { buildPromptScaffoldBundleText } from "@/lib/buildPromptScaffoldBundleText";
import { buildScenarioDraftBundleText } from "@/lib/buildScenarioDraftBundleText";
import {
  formatCreatorCapDetail,
  formatCreatorRetryAfterText,
  mapCreatorErrorMessage,
} from "@/lib/creator/mapCreatorErrorMessage";
import { buildPromptParts } from "@/lib/promptScaffold";

type ValidationIssue = { path: string; code: string; message: string };
type ScenarioListItem = {
  id: string;
  title: string;
  summary: string | null;
  ownerId: string | null;
  sourceScenarioId: string | null;
  updatedAt: string;
};
type MineViewItem = ScenarioListItem & { visibilityBadge: "DRAFT" | "PUBLIC" };
type CreatorTier = "NOMAD" | "TRAILBLAZOR" | "CHRONICLER" | "LOREMASTER";
type CreatorSnapshot = { title: string; summary: string; contentJson: string };
type LintWarning = { code: string; message: string };

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function groupValidationIssues(issues: ValidationIssue[]): Array<{ path: string; issues: ValidationIssue[] }> {
  const sorted = [...issues].sort((a, b) => {
    const byPath = compareText(a.path, b.path);
    if (byPath !== 0) return byPath;
    const byCode = compareText(a.code, b.code);
    if (byCode !== 0) return byCode;
    return compareText(a.message, b.message);
  });

  const groups: Array<{ path: string; issues: ValidationIssue[] }> = [];
  for (const issue of sorted) {
    const path = issue.path || "(root)";
    const last = groups[groups.length - 1];
    if (!last || last.path !== path) {
      groups.push({ path, issues: [issue] });
      continue;
    }
    last.issues.push(issue);
  }
  return groups;
}

function normalizeJsonForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonForDisplay(entry));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const keys = Object.keys(input).sort(compareText);
    for (const key of keys) {
      output[key] = normalizeJsonForDisplay(input[key]);
    }
    return output;
  }
  return value;
}

function stableJsonDisplay(value: unknown): string {
  return JSON.stringify(normalizeJsonForDisplay(value), null, 2);
}

function lintScenario(parsed: unknown): LintWarning[] {
  if (!parsed || typeof parsed !== "object") return [];
  const s = parsed as any;
  const warnings: LintWarning[] = [];

  if (typeof s.id === "string" && /\s/.test(s.id)) {
    warnings.push({
      code: "ID_WHITESPACE",
      message: "id contains whitespace; prefer hyphenated ids for stable linking.",
    });
  }

  if (typeof s.summary === "string" && s.summary.trim().length > 0 && s.summary.trim().length < 24) {
    warnings.push({
      code: "SUMMARY_SHORT",
      message: "summary is very short; include one concrete risk or hook.",
    });
  }

  if (typeof s.start?.prompt === "string" && s.start.prompt.trim().length > 0 && s.start.prompt.trim().length < 40) {
    warnings.push({
      code: "START_PROMPT_SHORT",
      message: "start.prompt is short; consider adding immediate context and stakes.",
    });
  }

  if (!s.initialState || typeof s.initialState !== "object" || !("memory" in s.initialState)) {
    warnings.push({
      code: "INITIAL_MEMORY_MISSING",
      message: "initialState.memory is missing; memory preview and recall may be limited.",
    });
  }

  return warnings;
}

function validateScenarioContentJson(raw: string): {
  ok: boolean;
  parseError: string | null;
  issues: ValidationIssue[];
} {
  const text = raw.trim();
  if (!text) {
    return {
      ok: false,
      parseError: null,
      issues: [{ path: "/contentJson", code: "REQUIRED", message: "contentJson is required" }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, parseError: "Invalid JSON", issues: [] };
  }

  const issues: ValidationIssue[] = [];
  const push = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (!parsed || typeof parsed !== "object") {
    push("", "TYPE", "Scenario must be an object");
    return { ok: false, parseError: null, issues };
  }

  const s = parsed as any;

  if (s.version !== "1") push("/version", "REQUIRED", 'version must be "1"');
  if (typeof s.id !== "string" || !s.id.trim()) push("/id", "REQUIRED", "id must be a non-empty string");
  if (typeof s.title !== "string" || !s.title.trim()) {
    push("/title", "REQUIRED", "title must be a non-empty string");
  }
  if (typeof s.summary !== "string" || !s.summary.trim()) {
    push("/summary", "REQUIRED", "summary must be a non-empty string");
  }

  if (!s.initialState || typeof s.initialState !== "object") {
    push("/initialState", "REQUIRED", "initialState must be an object");
  }

  if (!s.start || typeof s.start !== "object") {
    push("/start", "REQUIRED", "start must be an object");
  } else {
    if (typeof s.start.sceneId !== "string" || !s.start.sceneId.trim()) {
      push("/start/sceneId", "REQUIRED", "start.sceneId must be non-empty");
    }
    if (typeof s.start.prompt !== "string" || !s.start.prompt.trim()) {
      push("/start/prompt", "REQUIRED", "start.prompt must be non-empty");
    }
  }

  return { ok: issues.length === 0, parseError: null, issues };
}

export default function CreatorPage() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [contentJson, setContentJson] = useState("");
  const [importJsonText, setImportJsonText] = useState("");
  const [jsonImportStatus, setJsonImportStatus] = useState("");
  const [lastValidation, setLastValidation] = useState<ReturnType<typeof validateScenarioContentJson> | null>(
    null,
  );
  const [ownerId, setOwnerId] = useState("");
  const [creatorTier, setCreatorTier] = useState<CreatorTier>("NOMAD");
  const [forkSourceScenarioId, setForkSourceScenarioId] = useState("");
  const [forkNewScenarioId, setForkNewScenarioId] = useState("");
  const [myScenarios, setMyScenarios] = useState<MineViewItem[]>([]);
  const [mineStatus, setMineStatus] = useState("My scenarios not loaded.");
  const [draftCopyStatus, setDraftCopyStatus] = useState("");
  const [debugBundleCopyStatus, setDebugBundleCopyStatus] = useState("");
  const [promptBundleCopyStatus, setPromptBundleCopyStatus] = useState("");
  const [createDraftStatus, setCreateDraftStatus] = useState("");
  const [forkStatus, setForkStatus] = useState("");
  const [billingBanner, setBillingBanner] = useState("");
  const [lastMappedError, setLastMappedError] = useState("");
  const [baselineSnapshot, setBaselineSnapshot] = useState<CreatorSnapshot>({
    title: "",
    summary: "",
    contentJson: "",
  });
  const [promptSectionOpen, setPromptSectionOpen] = useState({
    preview: true,
    system: false,
    developer: false,
    user: false,
  });

  const emptyState = useMemo(
    () => ({
      title: title.trim().length === 0,
      summary: summary.trim().length === 0,
      contentJson: contentJson.trim().length === 0,
    }),
    [contentJson, summary, title],
  );

  const validation = useMemo(() => validateScenarioContentJson(contentJson), [contentJson]);
  const validationView = lastValidation ?? validation;
  const groupedValidation = useMemo(() => groupValidationIssues(validationView.issues), [validationView.issues]);
  const publishEnabled = validation.ok;
  const preview = useMemo(() => {
    try {
      const parsed = JSON.parse(contentJson) as any;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [contentJson]);
  const promptParts = useMemo(() => {
    if (!preview) {
      return null;
    }

    try {
      const initialState =
        preview.initialState && typeof preview.initialState === "object" ? preview.initialState : {};
      const startPrompt =
        typeof preview.start?.prompt === "string" && preview.start.prompt.trim()
          ? preview.start.prompt
          : "(no start prompt)";

      return buildPromptParts({
        narrationInput: {
          style: {
            genre: "mystery-adventure",
            tone: "grounded, serious",
            pov: "second-person",
            tense: "present",
            allowedMagicLevel: "low-or-unclear",
            profanity: "none",
            maxWords: 220,
          },
          state: initialState,
          playerInput: startPrompt,
          resolution: {
            roll: { d1: 3, d2: 4, total: 7 },
            tier: "mixed",
          },
          stateDeltas: [],
          causalLedgerAdds: [],
          scene: {},
        },
        memory: {
          injected: [],
          suppressedIds: [],
          matchedIds: [],
          gate: null,
        },
      });
    } catch {
      return null;
    }
  }, [preview]);
  const lintWarnings = useMemo(() => lintScenario(preview), [preview]);
  useEffect(() => {
    setBillingBanner("");
    setLastMappedError("");
  }, [contentJson, creatorTier, forkNewScenarioId, forkSourceScenarioId, ownerId, summary, title]);
  const preflightChecklist = useMemo(
    () => [
      {
        label: "Title present",
        ok:
          title.trim().length > 0 ||
          (typeof preview?.title === "string" && preview.title.trim().length > 0),
      },
      {
        label: "Summary present",
        ok:
          summary.trim().length > 0 ||
          (typeof preview?.summary === "string" && preview.summary.trim().length > 0),
      },
      {
        label: "Content JSON present",
        ok: contentJson.trim().length > 0,
      },
      {
        label: "Start prompt present",
        ok:
          typeof preview?.start?.prompt === "string" &&
          preview.start.prompt.trim().length > 0,
      },
      {
        label: "Validation pass",
        ok: validation.ok,
      },
    ],
    [contentJson, preview, summary, title, validation.ok],
  );
  const memoryPreview = useMemo(() => {
    if (!preview || typeof preview !== "object") {
      return "(none)";
    }
    const memory = (preview as any)?.initialState?.memory;
    if (memory == null) {
      return "(none)";
    }
    return stableJsonDisplay(memory);
  }, [preview]);
  const hasUnsavedChanges = useMemo(
    () =>
      title !== baselineSnapshot.title ||
      summary !== baselineSnapshot.summary ||
      contentJson !== baselineSnapshot.contentJson,
    [baselineSnapshot.contentJson, baselineSnapshot.summary, baselineSnapshot.title, contentJson, summary, title],
  );

  async function loadMyScenarios() {
    const trimmedOwnerId = ownerId.trim();
    if (!trimmedOwnerId) {
      setMyScenarios([]);
      setMineStatus("ownerId is required.");
      return;
    }

    setMineStatus("Loading...");
    try {
      const [mineRes, publicRes] = await Promise.all([
        fetch(`/api/scenario/mine?ownerId=${encodeURIComponent(trimmedOwnerId)}`),
        fetch("/api/scenario/public"),
      ]);

      if (!mineRes.ok || !publicRes.ok) {
        setMyScenarios([]);
        setMineStatus("Failed to load scenarios.");
        return;
      }

      const mineJson = (await mineRes.json()) as { scenarios?: ScenarioListItem[] };
      const publicJson = (await publicRes.json()) as { scenarios?: ScenarioListItem[] };

      const mine = Array.isArray(mineJson.scenarios) ? mineJson.scenarios : [];
      const publicIds = new Set(
        (Array.isArray(publicJson.scenarios) ? publicJson.scenarios : []).map((s) => s.id),
      );

      const view = mine
        .map((s) => ({
          ...s,
          visibilityBadge: publicIds.has(s.id) ? "PUBLIC" : "DRAFT",
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      setMyScenarios(view);
      setMineStatus(view.length === 0 ? "No scenarios found." : "Loaded.");
    } catch {
      setMyScenarios([]);
      setMineStatus("Failed to load scenarios.");
    }
  }

  async function onCreateDraft() {
    const trimmedOwnerId = ownerId.trim();
    if (!trimmedOwnerId) {
      setCreateDraftStatus("ownerId is required.");
      return;
    }
    if (!validation.ok || !preview) {
      setCreateDraftStatus("Cannot create draft: validation must pass.");
      return;
    }

    const scenarioId = typeof preview.id === "string" ? preview.id : "";
    const scenarioTitle =
      title.trim() || (typeof preview.title === "string" ? preview.title : "");
    if (!scenarioId || !scenarioTitle) {
      setCreateDraftStatus("Cannot create draft: id and title are required.");
      return;
    }

    const scenarioSummary =
      summary.trim() || (typeof preview.summary === "string" ? preview.summary : null);

    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: scenarioId,
          title: scenarioTitle,
          summary: scenarioSummary,
          contentJson: preview,
          visibility: "PRIVATE",
          ownerId: trimmedOwnerId,
          tier: creatorTier,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = mapCreatorErrorMessage({ status: res.status, payload: json });
        const detail = formatCreatorCapDetail(json);
        const retryAfter = formatCreatorRetryAfterText({
          status: res.status,
          payload: json,
          retryAfterHeader: res.headers.get("Retry-After"),
        });
        const parts = [message, detail, retryAfter].filter(Boolean);
        const statusText = parts.join(" ");
        setCreateDraftStatus(statusText);
        setLastMappedError(message);
        setBillingBanner(statusText);
        return;
      }
      setCreateDraftStatus("Draft created.");
    } catch {
      setCreateDraftStatus("Request failed.");
    }
  }

  async function onForkScenario() {
    const trimmedOwnerId = ownerId.trim();
    const sourceScenarioId = forkSourceScenarioId.trim();
    const newScenarioId = forkNewScenarioId.trim();

    if (!trimmedOwnerId) {
      setForkStatus("ownerId is required.");
      return;
    }
    if (!sourceScenarioId || !newScenarioId) {
      setForkStatus("sourceScenarioId and newScenarioId are required.");
      return;
    }

    try {
      const res = await fetch(`/api/scenario/${encodeURIComponent(sourceScenarioId)}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newId: newScenarioId,
          ownerId: trimmedOwnerId,
          tier: creatorTier,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = mapCreatorErrorMessage({ status: res.status, payload: json });
        const detail = formatCreatorCapDetail(json);
        const retryAfter = formatCreatorRetryAfterText({
          status: res.status,
          payload: json,
          retryAfterHeader: res.headers.get("Retry-After"),
        });
        const parts = [message, detail, retryAfter].filter(Boolean);
        const statusText = parts.join(" ");
        setForkStatus(statusText);
        setLastMappedError(message);
        setBillingBanner(statusText);
        return;
      }
      setForkStatus("Scenario forked.");
    } catch {
      setForkStatus("Request failed.");
    }
  }

  async function onCopyDraftBundle() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setDraftCopyStatus("Copy not supported");
      return;
    }

    const text = buildScenarioDraftBundleText({
      title: title.trim(),
      summary: summary.trim(),
      contentJson,
      validationOk: validationView.ok,
      parseError: validationView.parseError,
      issues: validationView.issues,
    });

    await navigator.clipboard.writeText(text);
    setDraftCopyStatus("Copied");
  }

  async function onCopyPromptScaffoldBundle() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setPromptBundleCopyStatus("Copy not supported");
      return;
    }
    if (!promptParts) {
      setPromptBundleCopyStatus("Prompt scaffold preview unavailable.");
      return;
    }

    const text = buildPromptScaffoldBundleText({
      preview: promptParts.preview,
      system: promptParts.system,
      developer: promptParts.developer,
      user: promptParts.user,
    });
    await navigator.clipboard.writeText(text);
    setPromptBundleCopyStatus("Copied");
  }

  async function onCopyCreatorDebugBundle() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setDebugBundleCopyStatus("Copy not supported");
      return;
    }
    const text = buildCreatorDebugBundleText({
      title: title.trim(),
      summary: summary.trim(),
      ownerId: ownerId.trim(),
      tier: creatorTier,
      contentJson,
      validationOk: validationView.ok,
      parseError: validationView.parseError,
      issues: validationView.issues,
      checklist: preflightChecklist,
      lastMappedError,
      createDraftStatus,
      forkStatus,
      billingBanner,
      promptScaffold: promptParts
        ? {
            preview: promptParts.preview,
            system: promptParts.system,
            developer: promptParts.developer,
            user: promptParts.user,
          }
        : null,
    });
    await navigator.clipboard.writeText(text);
    setDebugBundleCopyStatus("Copied");
  }

  function onImportJson() {
    const raw = importJsonText.trim();
    if (!raw) {
      setJsonImportStatus("Import error: JSON input is required.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setJsonImportStatus("Import error: Invalid JSON.");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonImportStatus("Import error: Scenario JSON must be an object.");
      return;
    }

    const scenario = parsed as any;
    const importedTitle = typeof scenario.title === "string" ? scenario.title : "";
    const importedSummary = typeof scenario.summary === "string" ? scenario.summary : "";
    setTitle(importedTitle);
    setSummary(importedSummary);
    setContentJson(raw);
    setBaselineSnapshot({
      title: importedTitle,
      summary: importedSummary,
      contentJson: raw,
    });
    setLastValidation(validateScenarioContentJson(raw));
    setJsonImportStatus("Import complete.");
  }

  function togglePromptSection(section: keyof typeof promptSectionOpen) {
    setPromptSectionOpen((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Scenario Creator</h1>
      <p className="mt-1 text-sm text-neutral-600">Create and validate scenario drafts.</p>

      <section className="mt-6 space-y-4 rounded border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-json-import">
            Paste scenario JSON
          </label>
          <textarea
            id="scenario-json-import"
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            rows={6}
            placeholder="{\"id\":\"scenario-id\",\"title\":\"...\",\"summary\":\"...\",\"start\":{\"prompt\":\"...\"}}"
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={onImportJson} className="rounded border px-2 py-1 text-xs">
              Import JSON
            </button>
            <span role="status" aria-live="polite">
              {jsonImportStatus}
            </span>
          </div>
          {jsonImportStatus.startsWith("Import error:") ? (
            <div className="mt-2 rounded border p-2 text-xs" aria-label="JSON import error">
              {jsonImportStatus}
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-title">
            Title
          </label>
          <input
            id="scenario-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Scenario title"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-summary">
            Summary
          </label>
          <textarea
            id="scenario-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
            placeholder="Short scenario summary"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-content-json">
            Content JSON
          </label>
          <textarea
            id="scenario-content-json"
            value={contentJson}
            onChange={(e) => setContentJson(e.target.value)}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            rows={12}
            placeholder="{\"id\":\"scenario-id\",\"initialState\":{},\"start\":{\"prompt\":\"...\"}}"
          />
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Editor empty state">
        <h2 className="text-base font-semibold">Editor readiness</h2>
        <div className="mt-2">Title field: {emptyState.title ? "empty" : "ready"}</div>
        <div>Summary field: {emptyState.summary ? "empty" : "ready"}</div>
        <div>Content JSON field: {emptyState.contentJson ? "empty" : "ready"}</div>
        <div>Unsaved changes: {hasUnsavedChanges ? "yes" : "no"}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario validation">
        <h2 className="text-base font-semibold">Validation</h2>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLastValidation(validateScenarioContentJson(contentJson))}
            className="rounded border px-2 py-1 text-xs"
          >
            Validate scenario
          </button>
          <div>
            Status: {validationView.ok ? "valid" : "invalid"}
            {lastValidation ? " (manual)" : " (live)"}
          </div>
        </div>
        {validationView.parseError ? <div className="mt-2">Parse error: {validationView.parseError}</div> : null}
        {!validationView.parseError && validationView.issues.length > 0 ? (
          <div className="mt-2 space-y-2">
            {groupedValidation.map((group, groupIndex) => (
              <div key={`${group.path}:${groupIndex}`}>
                <div className="text-xs font-semibold">Path: {group.path}</div>
                <ol className="mt-1 list-decimal space-y-1 pl-6">
                  {group.issues.map((issue, issueIndex) => (
                    <li key={`${group.path}:${issue.code}:${issue.message}:${issueIndex}`}>
                      {issue.code}: {issue.message}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : null}
        {!validationView.parseError && validationView.issues.length === 0 && validationView.ok ? (
          <div className="mt-2">No schema issues.</div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario lint warnings">
        <h2 className="text-base font-semibold">Scenario lint warnings</h2>
        <div className="mt-1 text-xs">Non-blocking guidance only.</div>
        {lintWarnings.length === 0 ? (
          <div className="mt-2">No lint warnings.</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            {lintWarnings.map((warning) => (
              <li key={warning.code}>
                {warning.code}: {warning.message}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario preview">
        <h2 className="text-base font-semibold">Preview</h2>
        {!preview ? (
          <div className="mt-2">Preview unavailable until content JSON parses.</div>
        ) : (
          <div className="mt-2 space-y-1">
            <div>ID: {typeof preview.id === "string" && preview.id ? preview.id : "(missing)"}</div>
            <div>Version: {typeof preview.version === "string" && preview.version ? preview.version : "(missing)"}</div>
            <div>
              Title: {typeof preview.title === "string" && preview.title ? preview.title : "(missing)"}
            </div>
            <div>
              Summary: {typeof preview.summary === "string" && preview.summary ? preview.summary : "(missing)"}
            </div>
            <div>
              Start sceneId:{" "}
              {typeof preview.start?.sceneId === "string" && preview.start.sceneId
                ? preview.start.sceneId
                : "(missing)"}
            </div>
            <div>Start prompt:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">
              {typeof preview.start?.prompt === "string" && preview.start.prompt
                ? preview.start.prompt
                : "(missing)"}
            </pre>
            <div>Memory preview:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{memoryPreview}</pre>
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Preflight checklist">
        <h2 className="text-base font-semibold">Preflight checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {preflightChecklist.map((item) => (
            <li key={item.label}>
              {item.label}: {item.ok ? "pass" : "fail"}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Publish controls">
        <h2 className="text-base font-semibold">Publish</h2>
        {billingBanner ? (
          <div className="mt-2 rounded border p-2 text-xs" aria-label="Creator billing banner">
            {billingBanner}
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="creator-tier" className="text-xs">
            Tier
          </label>
          <select
            id="creator-tier"
            value={creatorTier}
            onChange={(e) => setCreatorTier(e.target.value as CreatorTier)}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="NOMAD">NOMAD</option>
            <option value="TRAILBLAZOR">TRAILBLAZOR</option>
            <option value="CHRONICLER">CHRONICLER</option>
            <option value="LOREMASTER">LOREMASTER</option>
          </select>
          <span>Request tier: {creatorTier}</span>
        </div>
        <div className="mt-1 text-xs">Tier selection is deterministic and attached to creator requests.</div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" disabled={!publishEnabled} className="rounded border px-2 py-1 text-xs disabled:opacity-50">
            Publish scenario
          </button>
          <span>{publishEnabled ? "Publish enabled: validation passed." : "Publish disabled: validation must pass."}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCreateDraft} className="rounded border px-2 py-1 text-xs">
            Create draft
          </button>
          <span role="status" aria-live="polite">
            {createDraftStatus}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label htmlFor="fork-source-id" className="text-xs">
            sourceScenarioId
          </label>
          <input
            id="fork-source-id"
            value={forkSourceScenarioId}
            onChange={(e) => setForkSourceScenarioId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="source scenario id"
          />
          <label htmlFor="fork-new-id" className="text-xs">
            newScenarioId
          </label>
          <input
            id="fork-new-id"
            value={forkNewScenarioId}
            onChange={(e) => setForkNewScenarioId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="new scenario id"
          />
          <button type="button" onClick={onForkScenario} className="rounded border px-2 py-1 text-xs">
            Fork scenario
          </button>
          <span role="status" aria-live="polite">
            {forkStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Draft export">
        <h2 className="text-base font-semibold">Draft export</h2>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyDraftBundle} className="rounded border px-2 py-1 text-xs">
            Copy scenario draft bundle
          </button>
          <span role="status" aria-live="polite">
            {draftCopyStatus}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyCreatorDebugBundle} className="rounded border px-2 py-1 text-xs">
            Copy creator debug bundle
          </button>
          <span role="status" aria-live="polite">
            {debugBundleCopyStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="My scenarios">
        <h2 className="text-base font-semibold">My scenarios</h2>
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="owner-id" className="text-xs">
            ownerId
          </label>
          <input
            id="owner-id"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="owner id"
          />
          <button type="button" onClick={loadMyScenarios} className="rounded border px-2 py-1 text-xs">
            Load mine
          </button>
          <span role="status" aria-live="polite">
            {mineStatus}
          </span>
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          {myScenarios.map((s) => (
            <li key={s.id}>
              <div className="font-medium">{s.title || s.id}</div>
              <div className="text-xs">id: {s.id}</div>
              <div className="text-xs">summary: {s.summary || "(none)"}</div>
              <div className="text-xs">badge: {s.visibilityBadge}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Prompt scaffold preview">
        <h2 className="text-base font-semibold">Prompt scaffold preview</h2>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onCopyPromptScaffoldBundle}
            className="rounded border px-2 py-1 text-xs"
          >
            Copy prompt scaffold bundle
          </button>
          <span role="status" aria-live="polite">
            {promptBundleCopyStatus}
          </span>
        </div>
        {!promptParts ? (
          <div className="mt-2">Prompt scaffold preview unavailable.</div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("preview")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.preview ? "Hide" : "Show"} preview
              </button>
            </div>
            {promptSectionOpen.preview ? <div>Preview: {promptParts.preview}</div> : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("system")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.system ? "Hide" : "Show"} system
              </button>
            </div>
            {promptSectionOpen.system ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.system}</pre>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("developer")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.developer ? "Hide" : "Show"} developer
              </button>
            </div>
            {promptSectionOpen.developer ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.developer}</pre>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("user")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.user ? "Hide" : "Show"} user
              </button>
            </div>
            {promptSectionOpen.user ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.user}</pre>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
