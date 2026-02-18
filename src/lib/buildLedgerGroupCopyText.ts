type AnyRecord = Record<string, unknown>;

export function buildLedgerGroupCopyText(groupTitle: string, entries: AnyRecord[]): string {
  const lines: string[] = [];
  lines.push(`Group: ${groupTitle}`);
  lines.push("");

  const pushIf = (out: string[], label: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.length === 0) return;
    out.push(`${label}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  };

  entries.forEach((e, idx) => {
    if (idx > 0) {
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    const block: string[] = [];
    pushIf(block, "message", e["message"]);
    pushIf(block, "because", e["because"]);
    pushIf(block, "kind", e["kind"]);
    pushIf(block, "refEventId", e["refEventId"]);
    pushIf(block, "ruleId", e["ruleId"]);
    pushIf(block, "source", e["source"]);

    lines.push(...block);
    lines.push("");
    lines.push("raw:");
    lines.push(JSON.stringify(e, null, 2));
  });

  return lines.join("\n");
}
