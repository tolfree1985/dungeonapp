"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildConsequencesExplanationText } from "@/lib/buildConsequencesExplanationText";
import { buildLedgerEntryCopyText } from "@/lib/buildLedgerEntryCopyText";
import { buildLedgerGroupCopyText } from "@/lib/buildLedgerGroupCopyText";
import { buildVisibleLedgerCopyText } from "@/lib/buildVisibleLedgerCopyText";
import { buildInspectorBundleCopyText } from "@/lib/buildInspectorBundleCopyText";
import {
  buildFilteredDeltasCopyText,
  buildTurnImpactSummaryCopyText,
  buildTurnDiffCopyText,
  classifyTurnImpact,
  compareTurnKeys,
  getTurnDiffTopKeys,
} from "@/lib/turnDiff/buildTurnDiffCopyText";
import { filterLedgerEntries } from "@/lib/filterLedgerEntries";
import { formatConsequenceValue } from "@/lib/formatConsequenceValue";
import { ResolutionBadge as OutcomeBadge } from "@/components/ResolutionBadge";

type Props = {
  turnIndex?: number | null;
  stateDeltas?: readonly unknown[];
  previousStateDeltas?: readonly unknown[];
  ledgerAdds?: readonly unknown[];
  detailsId?: string;
  anchorId?: string;
};
type AnyEntry = Record<string, unknown>;
type TimelineItem = {
  turnKey: string;
  anchorId: string;
  outcome: "success" | "mixed" | "failure";
  label: string;
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

function getRefEventId(e: AnyEntry): string | null {
  const v = e["refEventId"];
  return typeof v === "string" && v.length ? v : null;
}

function groupLedger(entries: { entry: AnyEntry; index: number }[]) {
  const order: string[] = [];
  const map = new Map<string, { entry: AnyEntry; index: number }[]>();

  for (const e of entries) {
    const key = getRefEventId(e.entry) ?? "ungrouped";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(e);
  }

  return { order, map };
}

function groupKeyFromLedgerHash(hash: string): string | null {
  if (!hash.startsWith("#ledger-")) return null;
  const id = hash.slice(1);
  if (id.startsWith("ledger-idx-")) return "ungrouped";
  return id.slice("ledger-".length) || null;
}

function focusedGroupAnchorFromHash(hash: string): string | null {
  if (!hash) return null;
  if (hash.startsWith("#ledger-group-")) return hash.slice(1);
  if (!hash.startsWith("#ledger-")) return null;

  const id = hash.slice(1);
  if (id.startsWith("ledger-idx-")) return "ledger-group-ungrouped";
  return `ledger-group-${id.slice("ledger-".length)}`;
}

function groupTitleFromKey(key: string): string {
  return key === "ungrouped" ? "Ungrouped" : `Event: ${key}`;
}

function groupAnchorIdFromKey(key: string): string {
  return key === "ungrouped" ? "ledger-group-ungrouped" : `ledger-group-${key}`;
}

function timelineOutcomeFromEntry(entry: AnyEntry | null): "success" | "mixed" | "failure" {
  const raw =
    typeof entry?.outcome === "string"
      ? entry.outcome
      : typeof entry?.tier === "string"
        ? entry.tier
        : typeof entry?.result === "string"
          ? entry.result
          : "";
  const normalized = raw.toLowerCase();

  if (normalized === "success" || normalized === "hit" || normalized === "crit") return "success";
  if (normalized === "mixed" || normalized === "cost" || normalized === "partial") return "mixed";
  return "failure";
}

function timelineLabelFromEntry(entry: AnyEntry | null): string {
  const message =
    typeof entry?.message === "string" && entry.message.length > 0
      ? entry.message
      : typeof entry?.summary === "string" && entry.summary.length > 0
        ? entry.summary
        : "";
  if (message) return formatConsequenceValue(message, 80);
  return formatConsequenceValue(entry ?? "", 80);
}

export function ConsequencesDrawer({
  turnIndex,
  stateDeltas,
  previousStateDeltas,
  ledgerAdds,
  detailsId,
  anchorId,
}: Props) {
  const searchParams = (() => {
    try {
      return useSearchParams();
    } catch {
      return null;
    }
  })();
  const router = (() => {
    try {
      return useRouter();
    } catch {
      return null;
    }
  })();
  void router;
  const initialDeltaKey = searchParams?.get("deltaKey") ?? "";
  const deltas = Array.isArray(stateDeltas) ? stateDeltas : [];
  const stateDeltasArray = deltas;
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
  const [deltaKeyFilter, setDeltaKeyFilter] = useState<string>(initialDeltaKey);
  const [focusMode, setFocusMode] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => openGroups[key] !== false;
  const filtered = filterLedgerEntries(ledgerRecords, {
    kind: filterKind || undefined,
    ruleId: filterRuleId || undefined,
  });
  const filteredWithIndex = filtered.map((entry, index) => ({ entry, index }));
  const { order: groupOrder, map: groups } = groupLedger(filteredWithIndex);
  const timeline: TimelineItem[] = groupOrder
    .filter((key) => key !== "ungrouped")
    .map((key) => {
      const firstEntry = groups.get(key)?.[0]?.entry ?? null;
      return {
        turnKey: key,
        anchorId: groupAnchorIdFromKey(key),
        outcome: timelineOutcomeFromEntry(firstEntry),
        label: timelineLabelFromEntry(firstEntry),
      };
    });
  const ledgerRows = filteredWithIndex;
  const deltaCount = stateDeltasArray.length;
  const ledgerCount = ledgerRows.length;
  const impact = classifyTurnImpact({
    deltaCount,
    ledgerCount,
  });
  const hasCounts = deltaCount > 0 || ledgerCount > 0;
  const [showRawJson, setShowRawJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [turnDiffCopyStatus, setTurnDiffCopyStatus] = useState<"" | "copied" | "unsupported">("");
  const [turnImpactCopyStatus, setTurnImpactCopyStatus] = useState<"" | "copied" | "unsupported">("");
  const [turnLinkCopyStatus, setTurnLinkCopyStatus] = useState<"" | "copied" | "unsupported">("");
  const [visibleLedgerCopyStatus, setVisibleLedgerCopyStatus] = useState<string | null>(null);
  const [focusedViewCopyStatus, setFocusedViewCopyStatus] = useState<string | null>(null);
  const [inspectorBundleCopyStatus, setInspectorBundleCopyStatus] = useState<string | null>(null);
  const [entryCopyStatus, setEntryCopyStatus] = useState<Record<number, string>>({});
  const [entryLinkCopyStatus, setEntryLinkCopyStatus] = useState<Record<number, string>>({});
  const [groupLinkCopyStatus, setGroupLinkCopyStatus] = useState<Record<string, string>>({});
  const [groupSummaryCopyStatus, setGroupSummaryCopyStatus] = useState<Record<string, string>>({});
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const focusModeRef = useRef(focusMode);
  const groupOrderRef = useRef(groupOrder);

  function updateDeltaFilter(value: string): void {
    setDeltaKeyFilter(value);

    if (!searchParams || !router) return;

    const params = new URLSearchParams(searchParams.toString());

    if (!value) {
      params.delete("deltaKey");
    } else {
      params.set("deltaKey", value);
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const visibleLedgerGroups = groupOrder.map((key) => {
    const entries = groups.get(key) ?? [];
    const expanded = isOpen(key);
    return {
      title: groupTitleFromKey(key),
      anchorId: groupAnchorIdFromKey(key),
      state: expanded ? ("expanded" as const) : ("collapsed" as const),
      entries: expanded ? entries.map(({ entry }) => entry as AnyEntry) : [],
    };
  });
  const turnDiffText = buildTurnDiffCopyText({
    turnIndex: typeof turnIndex === "number" ? turnIndex : null,
    deltas: stateDeltasArray as {
      path?: string | string[];
      op?: string;
      before?: unknown;
      after?: unknown;
      [k: string]: unknown;
    }[],
  });
  const allTopKeys = getTurnDiffTopKeys(
    stateDeltasArray as {
      path?: string | string[];
      op?: string;
      before?: unknown;
      after?: unknown;
      [k: string]: unknown;
    }[],
  );
  const hasPreviousTurn = previousStateDeltas !== undefined;
  const previousTopKeys = getTurnDiffTopKeys(
    (Array.isArray(previousStateDeltas) ? previousStateDeltas : []) as {
      path?: string | string[];
      op?: string;
      before?: unknown;
      after?: unknown;
      [k: string]: unknown;
    }[],
  );
  const previousTurnKeysLine = hasPreviousTurn
    ? `Previous turn keys: ${previousTopKeys.length > 0 ? previousTopKeys.join(", ") : "(none)"}`
    : "No previous turn";
  const keyComparison = compareTurnKeys(allTopKeys, previousTopKeys);
  const addedKeysLine = keyComparison.added.length > 0 ? keyComparison.added.join(", ") : "(none)";
  const removedKeysLine = keyComparison.removed.length > 0 ? keyComparison.removed.join(", ") : "(none)";
  const unchangedKeysLine = keyComparison.unchanged.length > 0 ? keyComparison.unchanged.join(", ") : "(none)";
  const normalizedDeltaKeyFilter = allTopKeys.includes(deltaKeyFilter)
    ? deltaKeyFilter
    : "";
  const visibleDeltas =
    normalizedDeltaKeyFilter === ""
      ? stateDeltasArray
      : stateDeltasArray.filter((d: any) => {
          const key = getTurnDiffTopKeys([d])[0];
          return key === normalizedDeltaKeyFilter;
        });
  const totalDeltas = stateDeltasArray.length;
  const shownDeltas = visibleDeltas.length;
  const activeDeltaFilterLabel = normalizedDeltaKeyFilter === "" ? "All" : normalizedDeltaKeyFilter;
  const topKeysLine = (() => {
    const lines = turnDiffText.split("\n");
    const keysLine = lines.find((line) => line.startsWith("Keys: "));
    return keysLine ?? "Keys: (none)";
  })();
  const turnDiffKeys = allTopKeys;
  const turnDiffKeyChips = turnDiffKeys.slice(0, 8);

  useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);

  useEffect(() => {
    groupOrderRef.current = groupOrder;
  }, [groupOrder]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleHash = () => {
      const pinnedFocus =
        new URLSearchParams(window.location.search).get("focus") === "1";
      if (pinnedFocus) {
        focusModeRef.current = true;
        setFocusMode(true);
      }

      const hash = window.location.hash;
      if (!hash || !hash.startsWith("#ledger-")) return;

      const groupKey = groupKeyFromLedgerHash(hash);
      if (focusModeRef.current && groupKey) {
        setOpenGroups(() => {
          const next: Record<string, boolean> = {};
          groupOrderRef.current.forEach((k) => {
            next[k] = k === groupKey;
          });
          return next;
        });
      } else if (groupKey) {
        setOpenGroups((prev) => {
          if (prev[groupKey] !== false) return prev;
          const next = { ...prev };
          delete next[groupKey];
          return next;
        });
      }

      document.querySelectorAll(".ledger-highlight").forEach((n) => {
        n.classList.remove("ledger-highlight");
      });

      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (!el) return;

      el.classList.add("ledger-highlight");
      el.scrollIntoView({ block: "center" });
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

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

  async function onCopyTurnDiff(): Promise<void> {
    if (
      typeof navigator === "undefined"
      || !navigator.clipboard
      || typeof navigator.clipboard.writeText !== "function"
    ) {
      setTurnDiffCopyStatus("unsupported");
      return;
    }
    try {
      await navigator.clipboard.writeText(turnDiffText);
      setTurnDiffCopyStatus("copied");
    } catch {
      setTurnDiffCopyStatus("unsupported");
    }
  }

  async function onCopyFiltered(): Promise<void> {
    if (
      typeof navigator === "undefined"
      || !navigator.clipboard
      || typeof navigator.clipboard.writeText !== "function"
    ) {
      setTurnDiffCopyStatus("unsupported");
      return;
    }

    const text = buildFilteredDeltasCopyText({
      turnIndex: typeof turnIndex === "number" ? turnIndex : null,
      deltas: visibleDeltas as any,
      activeFilter: activeDeltaFilterLabel,
    });

    await navigator.clipboard.writeText(text);
    setTurnDiffCopyStatus("copied");
  }

  async function onCopyTurnLink(): Promise<void> {
    if (
      typeof window === "undefined"
      || typeof navigator === "undefined"
      || !navigator.clipboard
      || typeof navigator.clipboard.writeText !== "function"
    ) {
      setTurnLinkCopyStatus("unsupported");
      return;
    }
    try {
      const href = window.location.href;
      await navigator.clipboard.writeText(href);
      setTurnLinkCopyStatus("copied");
    } catch {
      setTurnLinkCopyStatus("unsupported");
    }
  }

  async function onCopyTurnImpactSummary(): Promise<void> {
    if (
      typeof navigator === "undefined"
      || !navigator.clipboard
      || typeof navigator.clipboard.writeText !== "function"
    ) {
      setTurnImpactCopyStatus("unsupported");
      return;
    }

    try {
      const text = buildTurnImpactSummaryCopyText({
        turnIndex: typeof turnIndex === "number" ? turnIndex : null,
        impact,
        deltaCount,
        ledgerCount,
        added: keyComparison.added,
        removed: keyComparison.removed,
        unchanged: keyComparison.unchanged,
      });
      await navigator.clipboard.writeText(text);
      setTurnImpactCopyStatus("copied");
    } catch {
      setTurnImpactCopyStatus("unsupported");
    }
  }

  return (
    <details
      ref={detailsRef}
      id={detailsId}
      data-timeline-count={timeline.length}
      data-impact={impact}
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
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-200 hover:border-neutral-500"
            onClick={async () => {
              const nav: typeof navigator | undefined =
                typeof navigator !== "undefined" ? navigator : undefined;
              const canCopy =
                !!nav?.clipboard && typeof nav.clipboard.writeText === "function";
              if (!canCopy) {
                setVisibleLedgerCopyStatus("Copy not supported");
                return;
              }

              try {
                const loc: Location | undefined =
                  typeof location !== "undefined" ? location : undefined;
                const sp = new URLSearchParams(loc?.search ?? "");
                const pinnedFocus = sp.get("focus") === "1" || focusMode;
                if (pinnedFocus) sp.set("focus", "1");
                const mergedSearch = sp.toString();
                const basePath = pinnedFocus
                  ? `${loc?.pathname ?? ""}${mergedSearch ? `?${mergedSearch}` : ""}`
                  : `${loc?.pathname ?? ""}${loc?.search ?? ""}`;
                const text = buildVisibleLedgerCopyText({
                  filterKind,
                  filterRuleId,
                  pinnedFocus,
                  basePath,
                  groups: visibleLedgerGroups,
                });
                await nav.clipboard.writeText(text);
                setVisibleLedgerCopyStatus("Copied");
              } catch {
                setVisibleLedgerCopyStatus("Copy not supported");
              }
            }}
          >
            Copy visible ledger
          </button>
          {visibleLedgerCopyStatus ? (
            <span className="text-neutral-400">{visibleLedgerCopyStatus}</span>
          ) : null}
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-200 hover:border-neutral-500"
            onClick={async () => {
              const nav: typeof navigator | undefined =
                typeof navigator !== "undefined" ? navigator : undefined;
              const canCopy =
                !!nav?.clipboard && typeof nav.clipboard.writeText === "function";
              if (!canCopy) {
                setFocusedViewCopyStatus("Copy not supported");
                return;
              }

              try {
                const loc: Location | undefined =
                  typeof location !== "undefined" ? location : undefined;
                const sp = new URLSearchParams(loc?.search ?? "");
                const pinnedFocus = sp.get("focus") === "1" || focusMode;
                if (pinnedFocus) sp.set("focus", "1");
                const mergedSearch = sp.toString();
                const basePath = pinnedFocus
                  ? `${loc?.pathname ?? ""}${mergedSearch ? `?${mergedSearch}` : ""}`
                  : `${loc?.pathname ?? ""}${loc?.search ?? ""}`;
                const focusedAnchorId = focusedGroupAnchorFromHash(loc?.hash ?? "");
                if (!focusedAnchorId) {
                  setFocusedViewCopyStatus("No focused group");
                  return;
                }
                const focusedGroup = visibleLedgerGroups.find(
                  (group) => group.anchorId === focusedAnchorId,
                );
                if (!focusedGroup) {
                  setFocusedViewCopyStatus("No focused group");
                  return;
                }
                const text = buildVisibleLedgerCopyText({
                  filterKind,
                  filterRuleId,
                  pinnedFocus,
                  basePath,
                  groups: [focusedGroup],
                });
                await nav.clipboard.writeText(text);
                setFocusedViewCopyStatus("Copied");
              } catch {
                setFocusedViewCopyStatus("Copy not supported");
              }
            }}
          >
            Copy focused view
          </button>
          {focusedViewCopyStatus ? (
            <span className="text-neutral-400">{focusedViewCopyStatus}</span>
          ) : null}
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-200 hover:border-neutral-500"
            onClick={async () => {
              const nav: typeof navigator | undefined =
                typeof navigator !== "undefined" ? navigator : undefined;
              const canCopy =
                !!nav?.clipboard && typeof nav.clipboard.writeText === "function";
              if (!canCopy) {
                setInspectorBundleCopyStatus("Copy not supported");
                return;
              }

              try {
                const loc: Location | undefined =
                  typeof location !== "undefined" ? location : undefined;
                const sp = new URLSearchParams(loc?.search ?? "");
                const pinnedFocus = sp.get("focus") === "1" || focusMode;
                if (pinnedFocus) sp.set("focus", "1");
                const mergedSearch = sp.toString();
                const basePath = pinnedFocus
                  ? `${loc?.pathname ?? ""}${mergedSearch ? `?${mergedSearch}` : ""}`
                  : `${loc?.pathname ?? ""}${loc?.search ?? ""}`;
                const targetHash = loc?.hash ?? "";
                const focusedAnchorId = focusedGroupAnchorFromHash(targetHash);
                const focusedGroup = focusedAnchorId
                  ? visibleLedgerGroups.find((group) => group.anchorId === focusedAnchorId) ?? null
                  : null;
                const text = buildInspectorBundleCopyText({
                  pinnedFocus,
                  filterKind,
                  filterRuleId,
                  targetHash,
                  basePath,
                  visibleGroups: visibleLedgerGroups,
                  focusedGroup,
                });
                await nav.clipboard.writeText(text);
                setInspectorBundleCopyStatus("Copied");
              } catch {
                setInspectorBundleCopyStatus("Copy not supported");
              }
            }}
          >
            Copy inspector bundle
          </button>
          {inspectorBundleCopyStatus ? (
            <span className="text-neutral-400">{inspectorBundleCopyStatus}</span>
          ) : null}
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
          <section aria-label="Turn diff" className="mt-4 border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-300">Turn diff</h3>
              <button
                type="button"
                onClick={() => {
                  void onCopyTurnDiff();
                }}
                className="text-xs underline text-neutral-300"
                aria-label="Copy turn diff"
              >
                Copy turn diff
              </button>
              <button
                type="button"
                onClick={() => {
                  void onCopyTurnImpactSummary();
                }}
                className="text-xs underline ml-2 text-neutral-300"
                aria-label="Copy impact summary"
              >
                Copy impact summary
              </button>
              {normalizedDeltaKeyFilter !== "" ? (
                <button
                  type="button"
                  onClick={() => {
                    void onCopyFiltered();
                  }}
                  className="text-xs underline ml-2 text-neutral-300"
                  aria-label="Copy filtered deltas"
                >
                  Copy filtered deltas
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void onCopyTurnLink();
                }}
                className="text-xs underline ml-2 text-neutral-300"
                aria-label="Copy turn link"
              >
                Copy turn link
              </button>
            </div>
            <div className="text-xs">
              Impact: {impact} (Deltas: {deltaCount}, Ledger: {ledgerCount})
            </div>
            {deltaCount === 0 && ledgerCount === 0 ? (
              <div className="text-xs">No-op turn</div>
            ) : impact === "Low" ? (
              <div className="text-xs">Low-signal turn</div>
            ) : null}
            {impact === "High" ? (
              <div className="text-xs">High-impact turn</div>
            ) : null}
            <div className="mt-2 space-y-1 text-xs text-neutral-400">
              <div>State delta entries: {stateDeltasArray.length}</div>
              <div>{topKeysLine}</div>
              <div>{previousTurnKeysLine}</div>
              <div className="pt-1">Compared to previous turn</div>
              <div>+ Added: {addedKeysLine}</div>
              <div>– Removed: {removedKeysLine}</div>
              <div>= Unchanged: {unchangedKeysLine}</div>
              <div className="mt-2 space-y-1">
                <div>Added keys</div>
                <div className="flex flex-wrap gap-1">
                  {keyComparison.added.length > 0 ? keyComparison.added.map((key) => (
                    <span
                      key={`added-${key}`}
                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    >
                      {key}
                    </span>
                  )) : <span>(none)</span>}
                </div>
                <div>Removed keys</div>
                <div className="flex flex-wrap gap-1">
                  {keyComparison.removed.length > 0 ? keyComparison.removed.map((key) => (
                    <span
                      key={`removed-${key}`}
                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    >
                      {key}
                    </span>
                  )) : <span>(none)</span>}
                </div>
                <div>Unchanged keys</div>
                <div className="flex flex-wrap gap-1">
                  {keyComparison.unchanged.length > 0 ? keyComparison.unchanged.map((key) => (
                    <span
                      key={`unchanged-${key}`}
                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    >
                      {key}
                    </span>
                  )) : <span>(none)</span>}
                </div>
              </div>
              <div>Active delta filter: {activeDeltaFilterLabel}</div>
              {turnDiffKeyChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turnDiffKeyChips.map((key) => (
                    <span
                      key={key}
                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    >
                      {key}
                    </span>
                  ))}
                  {turnDiffKeys.length > 8 ? (
                    <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
                      +{turnDiffKeys.length - 8} more
                    </span>
                  ) : null}
                </div>
              ) : null}
              {turnDiffCopyStatus === "copied" ? <div>Copied</div> : null}
              {turnDiffCopyStatus === "unsupported" ? <div>Copy not supported</div> : null}
              {turnImpactCopyStatus === "copied" ? <div>Copied</div> : null}
              {turnImpactCopyStatus === "unsupported" ? <div>Copy not supported</div> : null}
              {turnLinkCopyStatus === "copied" ? <div className="text-xs">Copied</div> : null}
              {turnLinkCopyStatus === "unsupported" ? (
                <div className="text-xs">Copy not supported</div>
              ) : null}
            </div>
          </section>
          <div className="font-semibold text-neutral-400">STATE DELTAS</div>
          <div className="mt-3">
            <label className="text-xs font-medium">
              Filter deltas
            </label>
            <select
              value={normalizedDeltaKeyFilter}
              onChange={(e) => updateDeltaFilter(e.target.value)}
              className="ml-2 text-xs"
              aria-label="Filter deltas"
            >
              <option value="">All</option>
              {allTopKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ml-2 text-xs underline text-neutral-300"
              onClick={() => updateDeltaFilter("")}
              aria-label="Clear delta filter"
            >
              Clear delta filter
            </button>
            <span className="ml-2 text-xs text-muted-foreground">
              Showing {shownDeltas} of {totalDeltas} deltas
            </span>
          </div>
          {visibleDeltas.length > 0 ? (
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {visibleDeltas.map((delta, index) => {
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
              {JSON.stringify(visibleDeltas, null, 2)}
            </pre>
          ) : null}
        </div>

        <div>
          <div className="font-semibold text-neutral-400">CAUSAL LEDGER</div>
          <div className="mb-4 border-b border-neutral-800 pb-2">
            <div className="mb-2 text-xs font-semibold opacity-70">Replay timeline</div>
            <div className="space-y-1">
              {timeline.map((item) => (
                <button
                  key={item.turnKey}
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    const hash = `#${item.anchorId}`;
                    window.location.hash = hash;
                    const el = document.getElementById(item.anchorId);
                    if (el) {
                      el.classList.add("ledger-highlight");
                      el.scrollIntoView({ block: "center" });
                    }
                  }}
                  className="flex items-center gap-2 text-xs underline"
                >
                  <OutcomeBadge
                    outcome={item.outcome === "failure" ? "fail" : item.outcome}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
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
            <div className="mt-2">
              <div className="mb-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOpenGroups({});
                  }}
                  className="underline opacity-80 hover:opacity-100"
                >
                  Expand all
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    groupOrder.forEach((key) => {
                      next[key] = false;
                    });
                    setOpenGroups(next);
                  }}
                  className="underline opacity-80 hover:opacity-100"
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  onClick={() => setFocusMode((v) => !v)}
                  className="underline opacity-80 hover:opacity-100"
                >
                  Focus mode: {focusMode ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusMode(false);
                    setOpenGroups({});
                  }}
                  className="underline opacity-80 hover:opacity-100"
                >
                  Clear focus
                </button>
              </div>
              {groupOrder.map((key) => {
                const entries = groups.get(key)!;
                const groupAnchorId = groupAnchorIdFromKey(key);
                const groupTitle = groupTitleFromKey(key);
                return (
                  <div key={key} id={groupAnchorId} className="mb-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold opacity-70">
                      <span>{groupTitle}</span>
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
                              setGroupLinkCopyStatus((prev) => ({ ...prev, [key]: "Copy not supported" }));
                              return;
                            }

                            try {
                              const loc: Location | undefined =
                                typeof location !== "undefined" ? location : undefined;
                              const sp = new URLSearchParams(loc?.search ?? "");
                              if (focusMode) sp.set("focus", "1");
                              const search = sp.toString();
                              const href = `${loc?.pathname ?? ""}${search ? `?${search}` : ""}#${groupAnchorId}`;
                              await nav.clipboard.writeText(href);
                              setGroupLinkCopyStatus((prev) => ({ ...prev, [key]: "Copied" }));
                            } catch {
                              setGroupLinkCopyStatus((prev) => ({ ...prev, [key]: "Copy not supported" }));
                            }
                          }}
                        >
                          Copy group link
                        </button>
                        {groupLinkCopyStatus[key] ? (
                          <span className="text-xs opacity-70">{groupLinkCopyStatus[key]}</span>
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
                              setGroupSummaryCopyStatus((prev) => ({ ...prev, [key]: "Copy not supported" }));
                              return;
                            }

                            try {
                              const text = buildLedgerGroupCopyText(
                                groupTitle,
                                groupAnchorId,
                                entries as any[],
                              );
                              await nav.clipboard.writeText(text);
                              setGroupSummaryCopyStatus((prev) => ({ ...prev, [key]: "Copied" }));
                            } catch {
                              setGroupSummaryCopyStatus((prev) => ({ ...prev, [key]: "Copy not supported" }));
                            }
                          }}
                        >
                          Copy group summary
                        </button>
                        {groupSummaryCopyStatus[key] ? (
                          <span className="text-xs opacity-70">{groupSummaryCopyStatus[key]}</span>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs underline opacity-80 hover:opacity-100"
                          onClick={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [key]: prev[key] === false ? true : false,
                            }))
                          }
                        >
                          {isOpen(key) ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>
                    {isOpen(key) ? (
                      <div className="mt-1 space-y-2">
                        {entries.map(({ entry, index }, groupIndex) => {
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
                            <div
                              id={rowId}
                              key={`${rowId}-${index}-${groupIndex}`}
                              className="space-y-1 rounded border border-transparent p-1"
                            >
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
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
