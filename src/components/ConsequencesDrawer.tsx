"use client";

import { useEffect, useRef, useState } from "react";
import { buildConsequencesExplanationText } from "@/lib/buildConsequencesExplanationText";
import { buildLedgerEntryCopyText } from "@/lib/buildLedgerEntryCopyText";
import { filterLedgerEntries } from "@/lib/filterLedgerEntries";
import { formatConsequenceValue } from "@/lib/formatConsequenceValue";

type Props = {
  stateDeltas?: readonly unknown[];
  ledgerAdds?: readonly unknown[];
  detailsId?: string;
  anchorId?: string;
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

export function ConsequencesDrawer({ stateDeltas, ledgerAdds, detailsId, anchorId }: Props) {
  const deltas = Array.isArray(stateDeltas) ? stateDeltas : [];
  const ledger = Array.isArray(ledgerAdds) ? ledgerAdds : [];
  const ledgerRecords = ledger.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
  const kindOptions = Array.from(
    new Set(
      ledgerRecords.map((entry) =>
        typeof entry.kind === "string" ? entry.kind : "",
      ),
    ),
  )
    .filter(Boolean)
    .sort();
  const [filterKind, setFilterKind] = useState<string>("");
  const [filterRuleId, setFilterRuleId] = useState<string>("");
  const filtered = filterLedgerEntries(ledgerRecords, {
    kind: filterKind || undefined,
    ruleId: filterRuleId || undefined,
  });
  const deltaCount = deltas.length;
  const ledgerCount = ledger.length;
  const hasCounts = deltaCount > 0 || ledgerCount > 0;
  const [showRawJson, setShowRawJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [entryCopyStatus, setEntryCopyStatus] = useState<Record<number, string>>({});
  const [entryLinkCopyStatus, setEntryLinkCopyStatus] = useState<Record<number, string>>({});
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!anchorId) return;

    const expectedHash = `#${anchorId}`;
    const maybeOpenFromHash = () => {
      if (location.hash === expectedHash && detailsRef.current) {
        detailsRef.current.open = true;
      }
    };

    maybeOpenFromHash();
    window.addEventListener("hashchange", maybeOpenFromHash);
    return () => {
      window.removeEventListener("hashchange", maybeOpenFromHash);
    };
  }, [anchorId]);

  async function handleCopyExplanation(): Promise<void> {
    const text = buildConsequencesExplanationText({
      stateDeltas: deltas,
      ledgerAdds: ledger,
    });

    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Copy not supported in this environment");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied!");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <details
      ref={detailsRef}
      id={detailsId}
      className={`mt-3 rounded border p-3 ${hasCounts ? "border-neutral-600" : "border-neutral-800"}`}
    >
      <summary
        className={`cursor-pointer text-sm ${hasCounts ? "text-neutral-100" : "text-neutral-300"}`}
      >
        <span>Why did this happen?</span>
        {deltaCount > 0 ? (
          <span className="ml-2 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-200">
            Δ {deltaCount}
          </span>
        ) : null}
        {ledgerCount > 0 ? (
          <span className="ml-2 rounded border border-neutral-600 px-1.5 py-0.5 text-[10px] text-neutral-200">
            ⚡ {ledgerCount}
          </span>
        ) : null}
      </summary>

      <div className="mt-3 space-y-4 text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-200 hover:border-neutral-500"
            onClick={() => {
              void handleCopyExplanation();
            }}
          >
            Copy explanation
          </button>
          {copyStatus ? <span className="text-neutral-400">{copyStatus}</span> : null}
        </div>

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
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-neutral-400">
              <span className="mb-1 block text-[11px]">Filter kind</span>
              <select
                className="w-full rounded border border-neutral-700 bg-black/30 px-2 py-1 text-neutral-200"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
              >
                <option value="">All</option>
                {kindOptions.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-neutral-400">
              <span className="mb-1 block text-[11px]">Filter ruleId</span>
              <input
                type="text"
                value={filterRuleId}
                onChange={(e) => setFilterRuleId(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-black/30 px-2 py-1 text-neutral-200"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-neutral-200 hover:border-neutral-500"
                onClick={() => {
                  setFilterKind("");
                  setFilterRuleId("");
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
          {ledger.length > 0 ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {filtered.map((entry, index) => {
                const row = asRecord(entry);
                const rowId =
                  typeof (entry as any).refEventId === "string" && (entry as any).refEventId
                    ? `ledger-${(entry as any).refEventId}`
                    : `ledger-idx-${index}`;
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
                  <li id={rowId} key={index} className="space-y-1">
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs underline opacity-80 hover:opacity-100"
                        onClick={async () => {
                          const nav: typeof navigator | undefined =
                            typeof navigator !== "undefined" ? navigator : undefined;
                          const canCopy =
                            !!nav?.clipboard && typeof nav.clipboard.writeText === "function";

                          if (!canCopy) {
                            setEntryCopyStatus((prev) => ({ ...prev, [index]: "Copy not supported" }));
                            return;
                          }

                          try {
                            const text = buildLedgerEntryCopyText(entry as Record<string, unknown>);
                            await nav.clipboard.writeText(text);
                            setEntryCopyStatus((prev) => ({ ...prev, [index]: "Copied" }));
                          } catch {
                            setEntryCopyStatus((prev) => ({ ...prev, [index]: "Copy not supported" }));
                          }
                        }}
                      >
                        Copy entry
                      </button>
                      {entryCopyStatus[index] ? (
                        <span className="ml-2 text-xs opacity-70">{entryCopyStatus[index]}</span>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs underline opacity-80 hover:opacity-100"
                        onClick={async () => {
                          const nav: typeof navigator | undefined =
                            typeof navigator !== "undefined" ? navigator : undefined;
                          const canCopy =
                            !!nav?.clipboard && typeof nav.clipboard.writeText === "function";
                          if (!canCopy) {
                            setEntryLinkCopyStatus((prev) => ({ ...prev, [index]: "Copy not supported" }));
                            return;
                          }

                          try {
                            const loc: Location | undefined =
                              typeof location !== "undefined" ? location : undefined;
                            const path = `${loc?.pathname ?? ""}${loc?.search ?? ""}#${rowId}`;
                            await nav.clipboard.writeText(path);
                            setEntryLinkCopyStatus((prev) => ({ ...prev, [index]: "Copied" }));
                          } catch {
                            setEntryLinkCopyStatus((prev) => ({ ...prev, [index]: "Copy not supported" }));
                          }
                        }}
                      >
                        Copy link
                      </button>
                      {entryLinkCopyStatus[index] ? (
                        <span className="text-xs opacity-70">{entryLinkCopyStatus[index]}</span>
                      ) : null}
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-neutral-400 hover:text-neutral-200">
                        Details
                      </summary>
                      <pre className="mt-2 overflow-auto rounded bg-black/40 p-2 text-[11px] text-neutral-200">
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-2 text-neutral-500">None.</div>
          )}
          {ledger.length > 0 && filtered.length === 0 ? (
            <div className="mt-2 text-neutral-500">No matching entries.</div>
          ) : null}
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
