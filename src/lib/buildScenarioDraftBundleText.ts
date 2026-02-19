type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export function buildScenarioDraftBundleText(args: {
  title: string;
  summary: string;
  contentJson: string;
  validationOk: boolean;
  parseError: string | null;
  issues: ValidationIssue[];
}): string {
  const lines: string[] = [];
  lines.push("Scenario draft bundle");
  lines.push(`Title: ${args.title}`);
  lines.push(`Summary: ${args.summary}`);
  lines.push(`Validation: ${args.validationOk ? "valid" : "invalid"}`);
  lines.push(`Parse error: ${args.parseError ?? ""}`);
  lines.push(`Issue count: ${args.issues.length}`);
  lines.push("Issues:");

  if (args.issues.length === 0) {
    lines.push("(none)");
  } else {
    for (let i = 0; i < args.issues.length; i++) {
      const issue = args.issues[i];
      lines.push(`${i + 1}. ${issue.path} ${issue.code}: ${issue.message}`);
    }
  }

  lines.push("");
  lines.push("Content JSON:");
  lines.push(args.contentJson);
  return lines.join("\n");
}
