"use client";

import { useEffect, useState } from "react";

type PublicScenario = {
  id: string;
  title: string;
  summary: string | null;
};

type PublicResponse = {
  scenarios?: PublicScenario[];
  nextCursor?: string | null;
};

type Mode = "public" | "mine";
const PAGE_TAKE = 20;

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<PublicScenario[]>([]);
  const [mode, setMode] = useState<Mode>("public");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const ownerIdTrimmed = ownerId.trim();
  const mineOwnerKey = mode === "mine" ? ownerIdTrimmed : "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (mode === "mine" && !ownerIdTrimmed) {
          setScenarios([]);
          setNextCursor(null);
          setError("ownerId required");
          return;
        }

        const params = new URLSearchParams();
        params.set("take", String(PAGE_TAKE));
        if (mode === "mine") {
          params.set("ownerId", ownerIdTrimmed);
        }
        const url = mode === "mine" ? `/api/scenario/mine?${params.toString()}` : `/api/scenario/public?${params.toString()}`;
        const res = await fetch(url);
        const json = (await res.json().catch(() => ({}))) as PublicResponse;
        if (!res.ok) {
          const msg = (json as any)?.error?.message ?? "Failed to load scenarios";
          throw new Error(msg);
        }
        if (!cancelled) {
          const firstPage = Array.isArray(json.scenarios) ? json.scenarios : [];
          setScenarios(firstPage);
          setNextCursor(json.nextCursor ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load scenarios");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, mineOwnerKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    if (mode === "mine" && !ownerIdTrimmed) {
      setError("ownerId required");
      return;
    }

    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("take", String(PAGE_TAKE));
      params.set("cursor", nextCursor);
      if (mode === "mine") {
        params.set("ownerId", ownerIdTrimmed);
      }
      const url = mode === "mine" ? `/api/scenario/mine?${params.toString()}` : `/api/scenario/public?${params.toString()}`;
      const res = await fetch(url);
      const json = (await res.json().catch(() => ({}))) as PublicResponse;
      if (!res.ok) {
        const msg = (json as any)?.error?.message ?? "Failed to load more scenarios";
        throw new Error(msg);
      }

      const nextPage = Array.isArray(json.scenarios) ? json.scenarios : [];
      setScenarios((prev) => [...prev, ...nextPage]);
      setNextCursor(json.nextCursor ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load more scenarios");
    } finally {
      setLoadingMore(false);
    }
  }

  async function copyScenario(sourceScenarioId: string) {
    if (!ownerId.trim()) {
      setError("ownerId is required to copy");
      return;
    }

    const newId = `${sourceScenarioId}-copy-${Date.now().toString(36)}`;
    setCopyingId(sourceScenarioId);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/scenario/${encodeURIComponent(sourceScenarioId)}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newId, ownerId: ownerId.trim() }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const msg = json?.error?.code ?? json?.error?.message ?? `Fork failed (${res.status})`;
        throw new Error(msg);
      }

      setResult(`Copied ${sourceScenarioId} to ${newId}`);
    } catch (e: any) {
      setError(e?.message ?? "Copy failed");
    } finally {
      setCopyingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Browse Scenarios</h1>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-medium">Browse</span>
        <span className="text-neutral-500">|</span>
        <button
          className={`rounded px-2 py-1 ${mode === "public" ? "bg-neutral-900 text-white" : "border"}`}
          onClick={() => setMode("public")}
        >
          Community
        </button>
        <span className="text-neutral-500">|</span>
        <button
          className={`rounded px-2 py-1 ${mode === "mine" ? "bg-neutral-900 text-white" : "border"}`}
          onClick={() => setMode("mine")}
        >
          My Library
        </button>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm">ownerId for Copy</label>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder="owner id"
        />
      </div>

      {loading ? <p className="mt-4 text-sm">Loading...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {result ? <p className="mt-4 text-sm text-green-700">{result}</p> : null}

      <ul className="mt-6 space-y-3">
        {scenarios.map((s) => (
          <li key={s.id} className="rounded border p-4">
            <div className="text-base font-medium">{s.title}</div>
            <div className="mt-1 text-sm text-neutral-700">{s.summary ?? "No summary"}</div>
            <div className="mt-1 text-xs text-neutral-500">{s.id}</div>
            <button
              className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => copyScenario(s.id)}
              disabled={copyingId === s.id}
            >
              {copyingId === s.id ? "Copying..." : "Copy"}
            </button>
          </li>
        ))}
      </ul>

      {!loading && nextCursor ? (
        <button
          className="mt-4 rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </main>
  );
}
