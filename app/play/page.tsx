"use client";

import { useEffect, useRef, useState } from "react";

type TurnResult = {
  scene: string;
  resolution: {
    roll: { dice: "2d6"; d1: number; d2: number; total: number };
    mods: any[];
    resultBand: "success" | "success_with_cost" | "fail_forward";
  };
  stateDelta: Record<string, any>;
  ledgerUpdates: Array<{ because: string; therefore: string }>;
  options: string[];
};

export default function PlayPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ player: string; turn: TurnResult }>
  >([]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // keep typing enabled after refresh/hot reload
    inputRef.current?.focus();
  }, []);

  async function submit(text: string) {
    const playerInput = text.trim();
    if (!playerInput || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerInput }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body.slice(0, 160)}`);
      }

      const data = (await res.json()) as { turnResult: TurnResult };
      setHistory((h) => [...h, { player: playerInput, turn: data.turnResult }]);
      setInput("");

      // keep cursor in the input
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submit(input);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Dungeon++ / Play</h1>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {/* Main story pane */}
          <div className="md:col-span-2 rounded-xl bg-white p-4 shadow">
            {history.length === 0 ? (
              <div className="text-zinc-600">
                Type an action to start. Try: <b>pick the lock</b>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item, idx) => (
                  <div key={idx} className="rounded-lg border p-3">
                    <div className="text-sm text-zinc-500">You</div>
                    <div className="font-medium">{item.player}</div>

                    <div className="mt-3 text-sm text-zinc-500">Scene</div>
                    <div>{item.turn.scene}</div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-sm font-semibold">Resolution</div>
                        <div className="text-sm">
                          Roll: {item.turn.resolution.roll.d1} +{" "}
                          {item.turn.resolution.roll.d2} ={" "}
                          <b>{item.turn.resolution.roll.total}</b>
                        </div>
                        <div className="text-sm">
                          Band:{" "}
                          <span className="font-medium">
                            {item.turn.resolution.resultBand}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-zinc-50 p-3">
                        <div className="text-sm font-semibold">State Δ</div>
                        <pre className="mt-1 whitespace-pre-wrap text-xs">
                          {JSON.stringify(item.turn.stateDelta, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-zinc-50 p-3">
                      <div className="text-sm font-semibold">Causal Ledger</div>
                      {item.turn.ledgerUpdates.map((l, i) => (
                        <div key={i} className="mt-2 text-sm">
                          <div>
                            <b>Because:</b> {l.because}
                          </div>
                          <div>
                            <b>Therefore:</b> {l.therefore}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-semibold">Options</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.turn.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => submit(opt)}
                            disabled={busy}
                            className="rounded-full border bg-white px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                placeholder='Try: "listen at the door"'
                className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100"
              />
              <button
                onClick={() => submit(input)}
                disabled={busy}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy ? "..." : "Send"}
              </button>
            </div>
          </div>

          {/* Side panel (simple for now) */}
          <div className="rounded-xl bg-white p-4 shadow">
            <div className="text-sm font-semibold">Debug</div>
            <div className="mt-2 text-sm text-zinc-600">
              API: <code>/api/turn</code>
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              Turns: <b>{history.length}</b>
            </div>

            <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
              Tip: if typing ever “locks”, it’s usually because the page
              crashed. Check the browser console + terminal for errors.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
