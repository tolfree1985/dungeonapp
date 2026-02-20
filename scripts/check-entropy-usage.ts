import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ViolationKind =
  | "ENTROPY_USAGE_VIOLATION"
  | "NETWORK_USAGE_VIOLATION"
  | "UNSTABLE_JSON_STRINGIFY_USAGE";

type Violation = {
  kind: ViolationKind;
  file: string;
  line: number;
};

type Rule = {
  regex: RegExp;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const EXCLUDED_PREFIXES = [
  ".next/",
  "coverage/",
  "dist/",
  "fixtures/",
  "node_modules/",
  "src/generated/",
  "scripts/test-",
];

const EXCLUDED_FILES = new Set([
  "scripts/check-entropy-usage.ts",
  "scripts/test-boundary-lock.ts",
]);

const ALLOWED_ENTROPY_FILES = new Set([
  "app/api/turn/route.ts",
  "src/app/scenarios/page.tsx",
  "src/lib/api/routeLogging.ts",
  "src/lib/api/softRateLimit.ts",
  "src/lib/billing/enforce.ts",
  "src/lib/billing/monthKey.ts",
  "src/lib/billing/policy.ts",
  "src/lib/roll2d6.ts",
]);

const ALLOWED_NETWORK_FILES = new Set([
  "src/app/creator/page.tsx",
  "src/app/scenarios/page.tsx",
  "src/components/SupportDashboard.tsx",
]);

const STRINGIFY_ENFORCED_PREFIXES = [
  "src/lib/determinism",
  "src/lib/game/",
  "src/lib/scenario/",
  "src/lib/support/",
];

const STRINGIFY_ENFORCED_FILES = new Set([
  "scripts/build-support-package.ts",
  "scripts/replay-from-bundle.ts",
  "scripts/run-golden-replays.ts",
  "scripts/run-release-gate.ts",
  "scripts/run-stress-replays.ts",
  "scripts/run-tag-release.ts",
  "src/lib/determinism.ts",
]);

const ALLOWED_STRINGIFY_SNIPPETS: Record<string, string[]> = {
  "scripts/replay-from-bundle.ts": ["JSON.stringify(normalize(value))"],
  "scripts/run-release-gate.ts": ["RELEASE_GATE_REPORT_JSON ${JSON.stringify(report)}"],
  "scripts/run-tag-release.ts": ["TAG_RELEASE_REPORT_JSON ${JSON.stringify(report)}"],
  "src/lib/determinism.ts": ["JSON.stringify(canonicalize(value))"],
  "src/lib/determinism/envelope.ts": ["JSON.stringify(value)", "JSON.stringify(k)"],
  "src/lib/game/engine.ts": ["JSON.stringify(sortKeys(value))"],
  "src/lib/game/hash.ts": ["JSON.stringify(canonicalize(value))"],
  "src/lib/game/replay.ts": ["JSON.stringify(normalized)", "JSON.stringify(entry)"],
  "src/lib/scenario/scenarioShare.ts": ["JSON.stringify(ordered)"],
  "src/lib/scenario/scenarioVersion.ts": ["JSON.stringify(normalizeScenarioForHash("],
  "src/lib/support/buildSupportTurnReproBlockText.ts": ["JSON.stringify(normalize(value), null, 2)"],
  "src/lib/support/sessionMetrics.ts": ["JSON.stringify(ordered)"],
  "src/lib/support/supportManifest.ts": [
    "JSON.stringify(stableNormalize(value))",
    "JSON.stringify(buildOrderedManifest(manifest))",
  ],
  "src/lib/support/supportPackage.ts": ["JSON.stringify(ordered)"],
};

const ENTROPY_RULES: Rule[] = [
  { regex: /Date\.now/ },
  { regex: /new Date\(/ },
  { regex: /performance\.now/ },
  { regex: /Math\.random/ },
  { regex: /crypto\.random/ },
  { regex: /setTimeout/ },
  { regex: /setInterval/ },
  { regex: /process\.hrtime/ },
  { regex: /\buuid\b/ },
  { regex: /\bnanoid\b/ },
];

const NETWORK_RULES: Rule[] = [{ regex: /\bfetch\(/ }, { regex: /\baxios\b/ }, { regex: /\bnode-fetch\b/ }];

function listTrackedFiles(): string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`BOUNDARY_LOCK_LIST_FILES_FAILED: ${(result.stderr ?? "").trim()}`);
  }
  const files = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !EXCLUDED_FILES.has(line))
    .filter((line) => !EXCLUDED_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .filter((line) => SOURCE_EXTENSIONS.has(path.extname(line)))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return files;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function isStringifyEnforcedFile(file: string): boolean {
  if (STRINGIFY_ENFORCED_FILES.has(file)) return true;
  return STRINGIFY_ENFORCED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isAllowedStringifyLine(file: string, line: string): boolean {
  const snippets = ALLOWED_STRINGIFY_SNIPPETS[file] ?? [];
  return snippets.some((snippet) => line.includes(snippet));
}

function collectViolations(files: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (isCommentLine(line)) continue;
      const lineNo = i + 1;

      for (const rule of ENTROPY_RULES) {
        if (!rule.regex.test(line)) continue;
        if (ALLOWED_ENTROPY_FILES.has(file)) continue;
        violations.push({ kind: "ENTROPY_USAGE_VIOLATION", file, line: lineNo });
        break;
      }

      for (const rule of NETWORK_RULES) {
        if (!rule.regex.test(line)) continue;
        if (ALLOWED_NETWORK_FILES.has(file)) continue;
        violations.push({ kind: "NETWORK_USAGE_VIOLATION", file, line: lineNo });
        break;
      }

      if (line.includes("JSON.stringify(") && isStringifyEnforcedFile(file) && !isAllowedStringifyLine(file, line)) {
        violations.push({ kind: "UNSTABLE_JSON_STRINGIFY_USAGE", file, line: lineNo });
      }
    }
  }

  violations.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });

  return violations;
}

function main(): void {
  const files = listTrackedFiles();
  const violations = collectViolations(files);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.log(`${violation.kind} ${violation.file}:${String(violation.line)}`);
    }
    process.exit(1);
  }

  console.log("BOUNDARY_LOCK_OK");
}

main();
