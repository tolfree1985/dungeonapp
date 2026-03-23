"use client";

import { useCallback, useEffect, useState } from "react";

type SceneArtRow = {
  sceneKey: string;
  promptHash: string;
  status: "queued" | "generating" | string;
  attemptCount: number;
  generationStartedAt: string | null;
  generationLeaseUntil: string | null;
};

export default function SceneArtWorkerPage() {
  const [rows, setRows] = useState<SceneArtRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/scene-art/worker/queue");
    const data: SceneArtRow[] = await response.json();
    setRows(data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runNext = useCallback(async () => {
    setRunning("run-next");
    await fetch("/api/scene-art/worker/run-next", { method: "POST" });
    setRunning(null);
    refresh();
  }, [refresh]);

  const runRow = useCallback(
    async (promptHash: string) => {
      setRunning(promptHash);
      await fetch(`/api/scene-art/worker/run/${promptHash}`, { method: "POST" });
      setRunning(null);
      refresh();
    },
    [refresh],
  );

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Scene Art Worker</h1>
        <button
          className="rounded border px-3 py-1 text-sm"
          onClick={runNext}
          disabled={running === "run-next"}
        >
          {running === "run-next" ? "Running..." : "Run next"}
        </button>
      </header>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left uppercase text-xs text-slate-500">
            <th className="pb-2">Scene</th>
            <th className="pb-2">PromptHash</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Attempts</th>
            <th className="pb-2">Lease</th>
            <th className="pb-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const canRunThis = row.status === "queued";

            return (
              <tr key={row.promptHash} className="border-t">
                <td className="py-2 font-medium">{row.sceneKey}</td>
                <td className="py-2 font-mono text-xs">{row.promptHash}</td>
                <td className="py-2 capitalize">{row.status}</td>
                <td className="py-2">{row.attemptCount}</td>
                <td className="py-2">
                  {row.generationLeaseUntil
                    ? new Date(row.generationLeaseUntil).toLocaleTimeString()
                    : "-"}
                </td>
                <td className="py-2">
                  {canRunThis ? (
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
