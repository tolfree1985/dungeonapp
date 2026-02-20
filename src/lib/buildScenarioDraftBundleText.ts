import { buildScenarioVersionStamp } from "./scenario/scenarioVersion";

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
  determinismReport?: unknown;
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
  lines.push("Determinism report:");
  if (args.determinismReport === undefined) {
    lines.push("(none)");
  } else {
    lines.push(JSON.stringify(args.determinismReport, null, 2));
  }

  let exportContentJson = args.contentJson;
  try {
    const parsed = JSON.parse(args.contentJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const withReport =
        args.determinismReport === undefined
          ? (parsed as Record<string, unknown>)
          : {
              ...(parsed as Record<string, unknown>),
              determinismReport: args.determinismReport,
            };
      const stamp = buildScenarioVersionStamp(withReport);
      const stamped = {
        ...withReport,
        scenarioVersion: stamp.scenarioVersion,
        scenarioContentHash: stamp.contentHash,
      };
      exportContentJson = JSON.stringify(stamped, null, 2);
    }
  } catch {
    exportContentJson = args.contentJson;
  }

  lines.push("");
  lines.push("Content JSON:");
  lines.push(exportContentJson);
  return lines.join("\n");
}
