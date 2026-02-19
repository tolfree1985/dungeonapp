type ValidationIssue = { path: string; code: string; message: string };
type ChecklistItem = { label: string; ok: boolean };
type PromptScaffoldSnapshot =
  | {
      preview: string;
      system: string;
      developer: string;
      user: string;
    }
  | null;

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortedIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => {
    const byPath = compareText(a.path, b.path);
    if (byPath !== 0) return byPath;
    const byCode = compareText(a.code, b.code);
    if (byCode !== 0) return byCode;
    return compareText(a.message, b.message);
  });
}

export function buildCreatorDebugBundleText(args: {
  title: string;
  summary: string;
  ownerId: string;
  tier: string;
  contentJson: string;
  validationOk: boolean;
  parseError: string | null;
  issues: ValidationIssue[];
  checklist: ChecklistItem[];
  lastMappedError: string;
  createDraftStatus: string;
  forkStatus: string;
  billingBanner: string;
  promptScaffold: PromptScaffoldSnapshot;
}): string {
  const lines: string[] = [];
  lines.push("Creator debug bundle");
  lines.push("");
  lines.push("Scenario:");
  lines.push(`- title: ${args.title}`);
  lines.push(`- summary: ${args.summary}`);
  lines.push(`- ownerId: ${args.ownerId}`);
  lines.push(`- tier: ${args.tier}`);
  lines.push("");
  lines.push("Validation:");
  lines.push(`- valid: ${args.validationOk ? "true" : "false"}`);
  lines.push(`- parseError: ${args.parseError ?? ""}`);
  lines.push("- issues:");
  for (const issue of sortedIssues(args.issues)) {
    lines.push(`  - ${issue.path} ${issue.code}: ${issue.message}`);
  }
  if (args.issues.length === 0) {
    lines.push("  - (none)");
  }
  lines.push("");
  lines.push("Preflight:");
  for (const item of args.checklist) {
    lines.push(`- ${item.label}: ${item.ok ? "pass" : "fail"}`);
  }
  lines.push("");
  lines.push("Status:");
  lines.push(`- lastMappedError: ${args.lastMappedError}`);
  lines.push(`- createDraftStatus: ${args.createDraftStatus}`);
  lines.push(`- forkStatus: ${args.forkStatus}`);
  lines.push(`- billingBanner: ${args.billingBanner}`);
  lines.push("");
  lines.push("Prompt scaffold:");
  if (!args.promptScaffold) {
    lines.push("- unavailable");
  } else {
    lines.push(`- preview: ${args.promptScaffold.preview}`);
    lines.push("- system:");
    lines.push(args.promptScaffold.system);
    lines.push("- developer:");
    lines.push(args.promptScaffold.developer);
    lines.push("- user:");
    lines.push(args.promptScaffold.user);
  }
  lines.push("");
  lines.push("Content JSON:");
  lines.push(args.contentJson);
  return lines.join("\n");
}
