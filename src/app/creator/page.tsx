"use client";

import { useMemo, useState } from "react";

type ValidationIssue = { path: string; code: string; message: string };

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
    </main>
  );
}
