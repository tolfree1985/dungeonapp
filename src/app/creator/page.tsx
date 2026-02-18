"use client";

import { useMemo, useState } from "react";

export default function CreatorPage() {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [contentJson, setContentJson] = useState("");

  const emptyState = useMemo(
    () => ({
      title: title.trim().length === 0,
      summary: summary.trim().length === 0,
      contentJson: contentJson.trim().length === 0,
    }),
    [contentJson, summary, title],
  );

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
    </main>
  );
}
