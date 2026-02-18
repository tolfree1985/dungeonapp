import {
  buildVisibleLedgerCopyText,
  type VisibleLedgerGroup,
} from "./buildVisibleLedgerCopyText";

export function buildInspectorBundleCopyText(args: {
  pinnedFocus: boolean;
  filterKind: string;
  filterRuleId: string;
  targetHash: string;
  basePath: string;
  visibleGroups: VisibleLedgerGroup[];
  focusedGroup: VisibleLedgerGroup | null;
}): string {
  const lines: string[] = [];
  const kind = (args.filterKind ?? "").trim();
  const ruleId = (args.filterRuleId ?? "").trim();

  lines.push("Inspector bundle");
  lines.push(`PinnedFocus: ${args.pinnedFocus ? "true" : "false"}`);
  lines.push(`Filters: kind=${kind || ""} ruleId=${ruleId || ""}`);
  lines.push(`Target: ${args.targetHash || ""}`);
  lines.push("");

  lines.push("==== Focused view ====");
  if (!args.focusedGroup) {
    lines.push("Focused: none");
  } else {
    lines.push(
      buildVisibleLedgerCopyText({
        pinnedFocus: args.pinnedFocus,
        basePath: args.basePath,
        filterKind: args.filterKind,
        filterRuleId: args.filterRuleId,
        groups: [args.focusedGroup],
      }),
    );
  }

  lines.push("");
  lines.push("==== Visible ledger ====");
  lines.push(
    buildVisibleLedgerCopyText({
      pinnedFocus: args.pinnedFocus,
      basePath: args.basePath,
      filterKind: args.filterKind,
      filterRuleId: args.filterRuleId,
      groups: args.visibleGroups,
    }),
  );

  return lines.join("\n");
}
