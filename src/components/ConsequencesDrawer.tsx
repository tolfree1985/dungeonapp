"use client";

import { useState } from "react";
import { formatConsequenceValue } from "@/lib/formatConsequenceValue";

type Props = {
  stateDeltas?: readonly unknown[];
  ledgerAdds?: readonly unknown[];
};

const BEFORE_KEYS = ["before", "from", "oldValue", "previous", "prev"] as const;
const AFTER_KEYS = ["after", "to", "newValue", "next", "value"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstDefined(
  input: Record<string, unknown> | null,
  keys: readonly string[],
): unknown {
  if (!input) return undefined;
  for (const key of keys) {
    if (key in input) return input[key];
  }
  return undefined;
}

export function ConsequencesDrawer({ stateDeltas, ledgerAdds }: Props) {
  const deltas = Array.isArray(stateDeltas) ? stateDeltas : [];
  const ledger = Array.isArray(ledgerAdds) ? ledgerAdds : [];
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <details className="mt-3 rounded border border-neutral-800 p-3">
      <summary className="cursor-pointer text-sm text-neutral-300">
        Why did this happen?
      </summary>

      <div className="mt-3 space-y-4 text-xs">
        <label className="flex items-center gap-2 text-neutral-400">
          <input
            type="checkbox"
            checked={showRawJson}
            onChange={(e) => setShowRawJson(e.target.checked)}
          />
          Show raw JSON
        </label>

        <div>
          <div className="font-semibold text-neutral-400">STATE DELTAS</div>
          {deltas.length > 0 ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {deltas.map((delta, index) => {
                const row = asRecord(delta);
                const path = typeof row?.path === "string" && row.path.length > 0
                  ? row.path
                  : `#${index + 1}`;
                const op = typeof row?.op === "string" ? row.op : null;
                const before = firstDefined(row, BEFORE_KEYS);
                const after = firstDefined(row, AFTER_KEYS);
                return (
                  <li key={`${path}-${index}`} className="space-y-1">
                    <div className="text-neutral-300">
                      <span className="font-medium">{path}</span>
                      {op ? <span className="ml-2 text-neutral-500">({op})</span> : null}
                    </div>
                    <div className="text-neutral-400">
                      {formatConsequenceValue(before)} {"\u2192"} {formatConsequenceValue(after)}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-2 text-neutral-500">None.</div>
          )}
          {showRawJson ? (
            <pre className="mt-2 overflow-auto bg-black/40 p-2">
              {JSON.stringify(deltas, null, 2)}
            </pre>
          ) : null}
        </div>

        <div>
          <div className="font-semibold text-neutral-400">CAUSAL LEDGER</div>
          {ledger.length > 0 ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {ledger.map((entry, index) => {
                const row = asRecord(entry);
                const kind = typeof row?.kind === "string"
                  ? row.kind
                  : typeof row?.type === "string"
                    ? row.type
                    : null;
                const message = typeof row?.message === "string"
                  ? row.message
                  : typeof row?.summary === "string"
                    ? row.summary
                    : null;
                const because = typeof row?.because === "string" ? row.because : null;
                return (
                  <li key={`ledger-${index}`} className="space-y-1">
                    {kind ? <div className="font-medium text-neutral-300">{kind}</div> : null}
                    {message ? (
                      <div className="text-neutral-400">{formatConsequenceValue(message)}</div>
                    ) : null}
                    {because ? (
                      <div className="text-neutral-500">Because: {formatConsequenceValue(because)}</div>
                    ) : null}
                    {!kind && !message && !because ? (
                      <div className="text-neutral-400">{formatConsequenceValue(entry)}</div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-2 text-neutral-500">None.</div>
          )}
          {showRawJson ? (
            <pre className="mt-2 overflow-auto bg-black/40 p-2">
              {JSON.stringify(ledger, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </details>
  );
}
