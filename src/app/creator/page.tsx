"use client";

import { useMemo, useState } from "react";
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
  const [lastValidation, setLastValidation] = useState<ReturnType<typeof validateScenarioContentJson> | null>(
    null,
  );
  const [ownerId, setOwnerId] = useState("");
  const [creatorTier, setCreatorTier] = useState<CreatorTier>("NOMAD");
  const [myScenarios, setMyScenarios] = useState<MineViewItem[]>([]);
  const [mineStatus, setMineStatus] = useState("My scenarios not loaded.");
  const [draftCopyStatus, setDraftCopyStatus] = useState("");
  const [creatorRequestStatus, setCreatorRequestStatus] = useState("");

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
      setCreatorRequestStatus("ownerId is required.");
      return;
    }
    if (!validation.ok || !preview) {
      setCreatorRequestStatus("Cannot create draft: validation must pass.");
      return;
    }

    const scenarioId = typeof preview.id === "string" ? preview.id : "";
    const scenarioTitle =
      title.trim() || (typeof preview.title === "string" ? preview.title : "");
    if (!scenarioId || !scenarioTitle) {
      setCreatorRequestStatus("Cannot create draft: id and title are required.");
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
        setCreatorRequestStatus(parts.join(" "));
        return;
      }
      setCreatorRequestStatus("Draft created.");
    } catch {
      setCreatorRequestStatus("Request failed.");
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

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Scenario Creator</h1>
      <p className="mt-1 text-sm text-neutral-600">Create and validate scenario drafts.</p>

      <section className="mt-6 space-y-4 rounded border p-4">
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
        <div>Title: {emptyState.title ? "empty" : "ready"}</div>
        <div>Summary: {emptyState.summary ? "empty" : "ready"}</div>
        <div>Content JSON: {emptyState.contentJson ? "empty" : "ready"}</div>
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
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            {validationView.issues.map((issue, i) => (
              <li key={`${issue.path}:${issue.code}:${i}`}>
                {issue.path} {issue.code}: {issue.message}
              </li>
            ))}
          </ol>
        ) : null}
        {!validationView.parseError && validationView.issues.length === 0 && validationView.ok ? (
          <div className="mt-2">No schema issues.</div>
        ) : null}
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
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Publish controls">
        <h2 className="text-base font-semibold">Publish</h2>
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
          <span>{creatorRequestStatus}</span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Draft export">
        <h2 className="text-base font-semibold">Draft export</h2>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyDraftBundle} className="rounded border px-2 py-1 text-xs">
            Copy scenario draft bundle
          </button>
          <span>{draftCopyStatus}</span>
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
          <span>{mineStatus}</span>
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
        {!promptParts ? (
          <div className="mt-2">Prompt scaffold preview unavailable.</div>
        ) : (
          <div className="mt-2 space-y-2">
            <div>Preview: {promptParts.preview}</div>
            <div>System:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.system}</pre>
            <div>Developer:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.developer}</pre>
            <div>User:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.user}</pre>
          </div>
        )}
      </section>
    </main>
  );
}
