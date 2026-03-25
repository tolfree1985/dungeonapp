"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

type SceneArtRow = {
  sceneKey: string;
  promptHash: string;
  status: "queued" | "generating" | string;
  attemptCount: number;
  generationStartedAt: string | null;
  generationLeaseUntil: string | null;
  updatedAt: string | null;
  errorMessage?: string | null;
  leaseOwnerId?: string | null;
  leaseAcquiredAt?: string | null;
  lastRecoveredAt?: string | null;
  createdAt?: string | null;
  imageUrl?: string | null;
};

type SceneArtWorkerBatchSummary = {
  batchId: string;
  workerId: string;
  startedAt: string;
  completedAt: string;
  processedCount: number;
  claimedCount: number;
  failedCount: number;
  reclaimedCount: number;
  idle: boolean;
  batchCostUsd: number;
  billableAttempts: number;
};

type WorkerHealth = {
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastBatchAt: string | null;
  lastProcessedCount: number;
  lastDurationMs: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  paused: boolean;
  draining: boolean;
  lastBatchSummary: SceneArtWorkerBatchSummary | null;
  recentBatchHistory: SceneArtWorkerBatchSummary[];
};

export default function SceneArtWorkerPage() {
  const [rows, setRows] = useState<SceneArtRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [batchLimit, setBatchLimit] = useState(3);
  const [batchRunning, setBatchRunning] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);
  const [lastReclaimedCount, setLastReclaimedCount] = useState<number | null>(null);
  const [autoReclaimedCount, setAutoReclaimedCount] = useState(0);
  const [requeueing, setRequeueing] = useState<string | null>(null);
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [controlLoading, setControlLoading] = useState(false);
  const [drainLoading, setDrainLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [highlightedPromptHash, setHighlightedPromptHash] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const highlightTarget = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQueue = useCallback(async () => {
    const response = await fetch("/api/scene-art/worker/queue");
    const body = await response.json();
    const data: SceneArtRow[] = body.rows ?? [];
    setRows(data);
    setAutoReclaimedCount(body.autoReclaimedCount ?? 0);

    if (highlightTarget.current) {
      if (highlightTarget.current === "__generating__") {
        const generatingRow = data.find((row) => row.status === "generating");
        setHighlightedPromptHash(generatingRow?.promptHash ?? null);
      } else {
        setHighlightedPromptHash(highlightTarget.current);
      }
      highlightTarget.current = null;

      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
      highlightTimer.current = setTimeout(() => setHighlightedPromptHash(null), 3000);
    }

    return data;
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/scene-art/worker/health");
      const body: WorkerHealth = await response.json();
      setHealth(body);
    } catch {
      setHealth(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchQueue();
    await fetchHealth();
  }, [fetchHealth, fetchQueue]);

  useEffect(() => {
    refresh();
    return () => {
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
    };
  }, [refresh]);

  const runNext = useCallback(async () => {
    setRunning("run-next");
    highlightTarget.current = "__generating__";
    await fetch("/api/scene-art/worker/run-next", { method: "POST" });
    setRunning(null);
    await refresh();
  }, [refresh]);

  const runRow = useCallback(
    async (promptHash: string) => {
      setRunning(promptHash);
      highlightTarget.current = promptHash;
      await fetch(`/api/scene-art/worker/run/${promptHash}`, { method: "POST" });
      setRunning(null);
      await refresh();
    },
    [refresh],
  );

  const reclaimStale = useCallback(async () => {
    setReclaiming(true);
    try {
      const response = await fetch("/api/scene-art/worker/reclaim-stale", { method: "POST" });
      const data = await response.json();
      setLastReclaimedCount(data.reclaimedCount ?? 0);
      await refresh();
    } finally {
      setReclaiming(false);
    }
  }, [refresh]);

  const requeueRow = useCallback(
    async (sceneKey: string, promptHash: string) => {
      setRequeueing(promptHash);
      try {
        await fetch("/api/scene-art/worker/requeue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneKey, promptHash }),
        });
      } finally {
        setRequeueing(null);
        await refresh();
      }
    },
    [refresh],
  );

  const refreshQueue = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const now = Date.now();
    return rows.reduce(
      (acc, row) => {
        if (row.status === "queued") {
          acc.queued += 1;
        }
        if (row.status === "generating") {
          acc.generating += 1;
          if (row.generationLeaseUntil && new Date(row.generationLeaseUntil).getTime() < now) {
            acc.stale += 1;
          }
        }
        if (row.status === "failed") {
          acc.failed += 1;
        }
        return acc;
      },
      { queued: 0, generating: 0, stale: 0, failed: 0 },
    );
  }, [rows]);

  const focusShots = useMemo(() => {
    return rows
      .filter((row) => row.sceneKey.startsWith("focus:"))
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [rows]);

  const latestFocusShot = focusShots[0] ?? null;

  const parseFocusReason = (sceneKey: string | null) => {
    if (!sceneKey) return null;
    const parts = sceneKey.split(":");
    return parts[1] ?? null;
  };

  const formatFocusReason = (reason: string | null) => {
    if (!reason) return "Focus Reveal";
    return reason
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const focusTier = (reason: string | null) => {
    if (!reason) return "Medium";
    if (/legendary|boss/i.test(reason)) return "High";
    return "Medium";
  };

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");
  const formatTime = (value: string | null) => (value ? new Date(value).toLocaleTimeString() : "-");
  const formatCost = (value?: number) => `$${(value ?? 0).toFixed(2)}`;

  const getRowSignals = (row: SceneArtRow) => {
    const now = Date.now();
    const leaseUntil = row.generationLeaseUntil ? new Date(row.generationLeaseUntil).getTime() : null;
    const expired = row.status === "generating" && leaseUntil !== null && leaseUntil < now;
    const inFlight = row.status === "generating" && row.leaseOwnerId && leaseUntil !== null && leaseUntil >= now;
    const repeatedFailure = row.status === "failed" && row.attemptCount >= 3;
    const recovered = Boolean(row.lastRecoveredAt);
    return { expired, inFlight, repeatedFailure, recovered };
  };

  const healthStatus = useMemo(() => {
    if (!health) return "unknown";
    if (health.draining) return "draining";
    if (!health.running) return "stopped";
    if (health.paused) return "paused";
    if (health.lastErrorMessage) return "error";
    if (!health.lastBatchAt || health.lastProcessedCount === 0) return "idle";
    return "running";
  }, [health]);

  const statusLabel =
    healthStatus === "paused"
      ? "Paused"
      : healthStatus === "error"
      ? "Error"
      : healthStatus === "draining"
      ? "Draining"
      : healthStatus === "stopped"
      ? "Stopped"
      : healthStatus === "idle"
      ? "Idle"
      : healthStatus === "running"
      ? "Running"
      : "Unknown";
  const statusColor =
    healthStatus === "paused"
      ? "text-slate-500"
      : healthStatus === "error"
      ? "text-rose-600"
      : healthStatus === "draining"
      ? "text-amber-600"
      : healthStatus === "stopped"
      ? "text-slate-500"
      : healthStatus === "idle"
      ? "text-slate-500"
      : "text-emerald-600";

  const latestBatch = health?.lastBatchSummary;
  const history = health?.recentBatchHistory ?? [];

  const pauseWorker = useCallback(async () => {
    setControlLoading(true);
    try {
      await fetch("/api/scene-art/worker/pause", { method: "POST" });
    } finally {
      setControlLoading(false);
      await fetchHealth();
    }
  }, [fetchHealth]);

  const resumeWorker = useCallback(async () => {
    setControlLoading(true);
    try {
      await fetch("/api/scene-art/worker/resume", { method: "POST" });
    } finally {
      setControlLoading(false);
      await fetchHealth();
    }
  }, [fetchHealth]);

  const drainWorker = useCallback(async () => {
    setDrainLoading(true);
    try {
      await fetch("/api/scene-art/worker/drain", { method: "POST" });
    } finally {
      setDrainLoading(false);
    }
    await refresh();
  }, [refresh]);

  const startWorker = useCallback(async () => {
    setStartLoading(true);
    try {
      await fetch("/api/scene-art/worker/start", { method: "POST" });
    } finally {
      setStartLoading(false);
    }
    await refresh();
  }, [refresh]);

  const handleBatch = useCallback(async () => {
    setBatchRunning(true);
    try {
      await fetch("/api/scene-art/worker/run-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: batchLimit }),
      });
    } finally {
      setBatchRunning(false);
      await refresh();
    }
  }, [batchLimit, refresh]);

  return (
    <div className="p-6 space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Scene Art Worker</h1>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1 text-sm"
              onClick={runNext}
              disabled={running === "run-next"}
            >
              {running === "run-next" ? "Running..." : "Run next"}
            </button>
            <button
              className="rounded border px-3 py-1 text-sm"
              onClick={refreshQueue}
              disabled={running !== null}
            >
              Refresh queue
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-500">Run batch</label>
            <select
              className="rounded border px-2 py-1 text-xs"
              value={batchLimit}
              onChange={(event) => setBatchLimit(Number(event.target.value))}
              disabled={batchRunning}
            >
              {[1, 3, 5, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              className="rounded border px-3 py-1 text-xs text-amber-600"
              onClick={handleBatch}
              disabled={batchRunning}
            >
              {batchRunning ? "Running..." : "Run batch"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Queued: {stats.queued}</span>
          <span>Generating: {stats.generating}</span>
          <span className="text-rose-500">Stale: {stats.stale}</span>
          <span>Failed: {stats.failed}</span>
          <button
            className="rounded border border-amber-400 px-3 py-1 text-xs text-amber-500"
            onClick={reclaimStale}
            disabled={reclaiming}
          >
            {reclaiming ? "Reclaiming..." : "Reclaim stale jobs"}
          </button>
          {lastReclaimedCount !== null ? (
            <span className="text-emerald-500">Reclaimed {lastReclaimedCount} job(s)</span>
          ) : null}
          {autoReclaimedCount > 0 ? (
            <span className="text-emerald-500">Auto-reclaimed {autoReclaimedCount} job(s)</span>
          ) : null}
        </div>
      </header>

      <section className="rounded border bg-white/50 p-4 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Worker Health</div>
          <span className={`text-xs font-semibold uppercase tracking-wide ${statusColor}`}>
            Status: {statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Last Tick: {formatTime(health?.lastTickAt ?? null)}</span>
          <span>Last Batch: {formatTime(health?.lastBatchAt ?? null)}</span>
          <span>Last Processed: {health?.lastProcessedCount ?? 0}</span>
        </div>
        {health?.lastErrorMessage ? (
          <div className="text-xs text-rose-600">Error: {health.lastErrorMessage}</div>
        ) : null}
        <div className="pt-2">
          {!health?.running ? (
            <button
              className="rounded border border-emerald-500 px-3 py-1 text-xs text-emerald-600"
              onClick={startWorker}
              disabled={startLoading}
            >
              {startLoading ? "Starting..." : "Start worker"}
            </button>
          ) : health?.draining ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600">
              <span className="rounded border border-amber-300 px-3 py-1">Draining…</span>
              <span className="text-amber-500">Stopping after queue drains</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {health?.paused ? (
                <button
                  className="rounded border border-emerald-500 px-3 py-1 text-xs text-emerald-600"
                  onClick={resumeWorker}
                  disabled={controlLoading}
                >
                  {controlLoading ? "Resuming..." : "Resume worker"}
                </button>
              ) : (
                <button
                  className="rounded border border-rose-500 px-3 py-1 text-xs text-rose-600"
                  onClick={pauseWorker}
                  disabled={controlLoading}
                >
                  {controlLoading ? "Pausing..." : "Pause worker"}
                </button>
              )}
              <button
                className="rounded border border-amber-500 px-3 py-1 text-xs text-amber-600"
                onClick={drainWorker}
                disabled={drainLoading}
              >
                {drainLoading ? "Draining..." : "Drain & stop"}
              </button>
            </div>
          )}
        </div>
      </section>

      {latestFocusShot ? (
        <section className="rounded border bg-gradient-to-br from-indigo-50 to-white/70 p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-700">Latest Focus Shot</div>
          <div className="mt-2 flex flex-col gap-2 text-xs text-slate-500">
            <span className="text-2xs text-slate-400">{focusShots.length} focus shot(s) tracked</span>
            <div className="flex flex-wrap gap-3 text-xs">
              <span>Reason: {formatFocusReason(parseFocusReason(latestFocusShot.sceneKey))}</span>
              <span>Tier: {focusTier(parseFocusReason(latestFocusShot.sceneKey))}</span>
              <span>Status: {latestFocusShot.status}</span>
              <span>Updated: {formatTime(latestFocusShot.updatedAt)}</span>
            </div>
          </div>
          {latestFocusShot.imageUrl ? (
            <img
              src={latestFocusShot.imageUrl}
              alt="Focus reveal"
              className="mt-3 h-40 w-full rounded object-cover"
            />
          ) : (
            <div className="mt-3 flex h-40 w-full items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
              Image pending…
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded border bg-white/50 p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">Recent Batches</div>
        {history.length === 0 ? (
          <div className="text-xs text-slate-500">No batches recorded yet.</div>
        ) : (
          <div className="mt-3 space-y-3 text-xs text-slate-500">
            {history.slice().reverse().map((entry) => (
              <div key={entry.batchId} className="flex flex-wrap items-center gap-4 border-b pb-2 last:border-b-0">
                <div className="w-32 font-mono text-[11px] text-slate-700">{entry.batchId}</div>
                <div className="text-[11px]">{formatDate(entry.completedAt)}</div>
                <div className="text-[11px]">Processed: {entry.processedCount}</div>
                <div className="text-[11px]">Failed: {entry.failedCount}</div>
                <div className="text-[11px]">Reclaimed: {entry.reclaimedCount}</div>
                <div className="text-[11px]">Cost: {formatCost(entry.batchCostUsd)}</div>
                <div className="text-[11px]">Attempts: {entry.billableAttempts}</div>
                <div className="text-[11px]">Idle: {entry.idle ? "Yes" : "No"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section data-testid="latest-batch-panel" className="rounded border bg-white/50 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">Latest Batch</div>
          <span className="text-xs text-slate-500">
            {latestBatch ? (latestBatch.idle ? "Idle" : "Processed") : "No data"}
          </span>
        </div>
        {latestBatch ? (
          <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
            <div>
              <div className="text-[10px] uppercase text-slate-400">Batch ID</div>
              <div data-testid="latest-batch-id" className="font-mono text-[12px] text-slate-700">
                {latestBatch.batchId}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Worker</div>
              <div data-testid="latest-batch-worker" className="font-mono text-[12px] text-slate-700">
                {latestBatch.workerId}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Started</div>
              <div className="text-[12px] text-slate-700">{formatDate(latestBatch.startedAt)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Completed</div>
              <div className="text-[12px] text-slate-700">{formatDate(latestBatch.completedAt)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Processed</div>
              <div data-testid="latest-batch-processed" className="text-[12px] text-slate-700">
                {latestBatch.processedCount}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Claimed</div>
              <div className="text-[12px] text-slate-700">{latestBatch.claimedCount}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Failed</div>
              <div className="text-[12px] text-slate-700">{latestBatch.failedCount}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Reclaimed</div>
              <div className="text-[12px] text-slate-700">{latestBatch.reclaimedCount}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Idle</div>
              <div data-testid="latest-batch-idle" className="text-[12px] text-slate-700">
                {latestBatch.idle ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Batch Cost</div>
              <div data-testid="latest-batch-cost" className="text-[12px] text-slate-700">
                {formatCost(latestBatch.batchCostUsd)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Billable Attempts</div>
              <div data-testid="latest-batch-attempts" className="text-[12px] text-slate-700">
                {latestBatch.billableAttempts}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500">No batch summary has been recorded yet.</div>
        )}
      </section>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left uppercase text-xs text-slate-500">
            <th className="pb-2">Scene</th>
            <th className="pb-2">PromptHash</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Signals</th>
            <th className="pb-2">Attempts</th>
            <th className="pb-2">Lease</th>
            <th className="pb-2">Updated</th>
            <th className="pb-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const canRunThis = row.status === "queued";
            const isHighlighted = highlightedPromptHash === row.promptHash;
            const isStale =
              row.status === "generating" &&
              row.generationLeaseUntil !== null &&
              new Date(row.generationLeaseUntil).getTime() < Date.now();
            const rowClasses = ["border-t", isHighlighted ? "bg-slate-50" : "", isStale ? "bg-rose-50/40" : ""].join(" ");

            return (
              <Fragment key={row.promptHash}>
                <tr data-testid={`worker-row-${row.promptHash}`} className={rowClasses}>
                  <td className="py-2 font-medium">{row.sceneKey}</td>
                  <td className="py-2 font-mono text-xs">{row.promptHash}</td>
                <td className="py-2 capitalize">
                  <span>{row.status}</span>
                  {isStale && (
                    <span className="ml-2 rounded border border-rose-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                      Stale
                    </span>
                  )}
                </td>
                <td className="py-2">
                  {(() => {
                    const signals = getRowSignals(row);
                    return (
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {signals.expired && <span className="rounded border border-rose-200 px-2 py-0.5 text-rose-600">Lease Expired</span>}
                        {signals.repeatedFailure && (
                          <span className="rounded border border-rose-200 px-2 py-0.5 text-rose-600">Repeated Failure</span>
                        )}
                        {signals.recovered && (
                          <span className="rounded border border-amber-200 px-2 py-0.5 text-amber-600">Recovered</span>
                        )}
                        {signals.inFlight && <span className="rounded border border-slate-200 px-2 py-0.5 text-slate-600">In Flight</span>}
                      </div>
                    );
                  })()}
                </td>
                  <td className="py-2">{row.attemptCount}</td>
                  <td className="py-2">
                    {row.generationLeaseUntil ? new Date(row.generationLeaseUntil).toLocaleTimeString() : "-"}
                  </td>
                  <td className="py-2">{formatDate(row.updatedAt)}</td>
                  <td className="py-2 space-y-1">
                    <div className="flex flex-wrap gap-2">
                      {row.status === "failed" ? (
                        <button
                          className="rounded border border-emerald-500 px-2 py-1 text-xs"
                          onClick={() => requeueRow(row.sceneKey, row.promptHash)}
                          disabled={requeueing === row.promptHash}
                        >
                          {requeueing === row.promptHash ? "Requeueing..." : "Requeue"}
                        </button>
                      ) : canRunThis ? (
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => runRow(row.promptHash)}
                          disabled={running === row.promptHash}
                        >
                          {running === row.promptHash ? "Running" : "Run this"}
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">queued-only</span>
                      )}
                      <button
                        className="text-xs text-slate-500"
                        onClick={() =>
                          setDetailsOpen((prev) => ({ ...prev, [row.promptHash]: !prev[row.promptHash] }))
                        }
                      >
                        {detailsOpen[row.promptHash] ? "Hide details" : "Show details"}
                      </button>
                    </div>
                    {row.errorMessage ? (
                      <div className="text-rose-500 text-[10px]">{row.errorMessage}</div>
                    ) : null}
                  </td>
                </tr>
                {detailsOpen[row.promptHash] && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-4 py-2 text-[12px] text-slate-600">
                      <div className="grid grid-cols-2 gap-4">
                        <div>Lease owner: {row.leaseOwnerId ?? "n/a"}</div>
                        <div>Lease acquired: {formatTime(row.leaseAcquiredAt ?? null)}</div>
                        <div>Lease expires: {formatTime(row.generationLeaseUntil ?? null)}</div>
                        <div>Recovered at: {formatTime(row.lastRecoveredAt ?? null)}</div>
                        <div>Started at: {formatTime(row.generationStartedAt ?? null)}</div>
                        <div>Created: {formatDate(row.createdAt ?? null)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
