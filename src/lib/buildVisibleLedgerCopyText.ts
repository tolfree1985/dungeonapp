type AnyRecord = Record<string, unknown>;

export type VisibleLedgerGroup = {
  title: string;
  anchorId: string;
  entries: AnyRecord[];
};

export function buildVisibleLedgerCopyText(args: {
  filterKind: string;
  filterRuleId: string;
  groups: VisibleLedgerGroup[];
}): string {
  const lines: string[] = [];
  const kind = (args.filterKind ?? "").trim();
  const ruleId = (args.filterRuleId ?? "").trim();

  lines.push("Visible ledger");
  lines.push(`Filters: kind=${kind || ""} ruleId=${ruleId || ""}`);
  lines.push("");

  for (let gi = 0; gi < args.groups.length; gi++) {
    const g = args.groups[gi];
    if (gi > 0) {
      lines.push("");
      lines.push("====");
      lines.push("");
    }

    lines.push(`Group: ${g.title}`);
    lines.push(`Anchor: #${g.anchorId}`);
    lines.push("");

    for (let ei = 0; ei < g.entries.length; ei++) {
      const e = g.entries[ei];
      if (ei > 0) {
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const pushIf = (label: string, v: unknown) => {
        if (v === undefined || v === null) return;
        if (typeof v === "string" && v.length === 0) return;
        lines.push(`${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
      };

      pushIf("message", e["message"]);
      pushIf("because", e["because"]);
      pushIf("kind", e["kind"]);
      pushIf("refEventId", e["refEventId"]);
      pushIf("ruleId", e["ruleId"]);
      pushIf("source", e["source"]);
      lines.push("");
      lines.push("raw:");
      lines.push(JSON.stringify(e, null, 2));
    }
  }

  return lines.join("\n");
}
