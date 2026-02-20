import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SUPPORT_MANIFEST_VERSION, TELEMETRY_VERSION } from "../src/lib/support/supportManifest";
import { SUPPORT_PACKAGE_VERSION } from "../src/lib/support/supportPackage";
import { SCENARIO_VERSION } from "../src/lib/scenario/scenarioVersion";
import { SCENARIO_SHARE_VERSION } from "../src/lib/scenario/scenarioShare";

type Step = {
  name: string;
  cmd: string[];
};

type StepResult = {
  name: string;
  status: "pass" | "fail";
};

type ReleaseGateReport = {
  steps: StepResult[];
  goldenFixtureCount: number;
  stressFixtureCount: number;
  versions: {
    supportManifestVersion: number;
    supportPackageVersion: number;
    telemetryVersion: number;
    scenarioVersion: number;
    scenarioShareVersion: number;
  };
  commitHash?: string;
};

const FULL_STEPS: readonly Step[] = [
  { name: "prisma-validate", cmd: ["bash", "scripts/with-sqlite-env.sh", "npx", "prisma", "validate"] },
  { name: "typecheck", cmd: ["npx", "tsc", "--noEmit", "-p", "tsconfig.typecheck.json"] },
  { name: "boundary-lock", cmd: ["node", "--import", "tsx", "scripts/check-entropy-usage.ts"] },
  { name: "ci-billing", cmd: ["npm", "run", "ci:billing"] },
  { name: "ci-creator", cmd: ["npm", "run", "ci:creator"] },
  { name: "test-scenario-bootstrap", cmd: ["node", "--import", "tsx", "scripts/test-scenario-bootstrap.ts"] },
  { name: "validate-scenario", cmd: ["node", "--import", "tsx", "scripts/validate-scenario.ts", "scenarios"] },
  {
    name: "test-adventure-from-scenario",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-adventure-from-scenario.ts"],
  },
  {
    name: "test-route-adventure-from-scenario",
    cmd: [
      "bash",
      "scripts/with-sqlite-env.sh",
      "node",
      "--import",
      "tsx",
      "scripts/test-route-adventure-from-scenario.ts",
    ],
  },
  {
    name: "test-adventure-idempotency",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-adventure-idempotency.ts"],
  },
  { name: "test-opening-turn", cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-opening-turn.ts"] },
  {
    name: "test-replay-invariant",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-replay-invariant.ts"],
  },
  {
    name: "test-scenario-community",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-scenario-community.ts"],
  },
  {
    name: "test-route-scenario-public",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-public.ts"],
  },
  {
    name: "test-route-scenario-fork",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-fork.ts"],
  },
  {
    name: "test-route-scenario-publish",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-publish.ts"],
  },
  {
    name: "test-route-scenario-unpublish",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-unpublish.ts"],
  },
  {
    name: "test-route-scenario-mine",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-mine.ts"],
  },
  {
    name: "test-route-scenario-public-page",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-public-page.ts"],
  },
  {
    name: "test-route-scenario-mine-page",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-mine-page.ts"],
  },
  {
    name: "test-route-scenario-create-cap",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-create-cap.ts"],
  },
  {
    name: "test-route-scenario-fork-cap",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-fork-cap.ts"],
  },
  {
    name: "test-route-error-safety",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-error-safety.ts"],
  },
  {
    name: "test-rate-limit-turn",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-rate-limit-turn.ts"],
  },
  {
    name: "smoke-prod-surface",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/smoke-prod-surface.ts"],
  },
  {
    name: "test-ux-consequences",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ux-consequences.ts"],
  },
  {
    name: "test-ui-consequences-drawer",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ui-consequences-drawer.ts"],
  },
];

const TEST_STEPS: readonly Step[] = [
  { name: "prisma-validate", cmd: ["bash", "scripts/with-sqlite-env.sh", "npx", "prisma", "validate"] },
  { name: "typecheck", cmd: ["npx", "tsc", "--noEmit", "-p", "tsconfig.typecheck.json"] },
  { name: "boundary-lock", cmd: ["node", "--import", "tsx", "scripts/check-entropy-usage.ts"] },
  { name: "test-scenario-bootstrap", cmd: ["node", "--import", "tsx", "scripts/test-scenario-bootstrap.ts"] },
  { name: "validate-scenario", cmd: ["node", "--import", "tsx", "scripts/validate-scenario.ts", "scenarios"] },
  {
    name: "test-ui-consequences-drawer",
    cmd: ["bash", "scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ui-consequences-drawer.ts"],
  },
  { name: "test-golden-replays", cmd: ["node", "--import", "tsx", "scripts/test-golden-replays.ts"] },
  { name: "test-stress-replays", cmd: ["node", "--import", "tsx", "scripts/test-stress-replays.ts"] },
];

function isReleaseGateTestMode(): boolean {
  return process.argv.includes("--test-mode") || process.env.RELEASE_GATE_TEST_MODE === "1";
}

function getSteps(): readonly Step[] {
  return isReleaseGateTestMode() ? TEST_STEPS : FULL_STEPS;
}

function readFixtureCount(): number {
  const indexPath = path.join(process.cwd(), "fixtures", "golden", "index.json");
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as { fixtures?: unknown };
  if (!Array.isArray(parsed.fixtures)) {
    return 0;
  }
  return parsed.fixtures.filter((name) => typeof name === "string").length;
}

function findFirstFailMarker(output: string): string {
  const lines = output.split(/\r?\n/);
  const failPattern = /(FAIL|ERROR|VIOLATION|MISMATCH|INVALID|MISSING|REGRESSION|BLOCKED|INCOMPLETE)/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (failPattern.test(trimmed)) {
      return trimmed;
    }
  }
  return "NO_FAIL_MARKER_FOUND";
}

function readSectionSummary(output: string, marker: string): string {
  const lines = output.split(/\r?\n/);
  const hit = lines.find((line) => line.trim().startsWith(marker));
  return hit ? hit.trim() : `${marker} (missing)`;
}

function readCommitHash(): string | undefined {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const value = (result.stdout ?? "").trim();
  return /^[a-f0-9]{40}$/.test(value) ? value : undefined;
}

function runStep(step: Step): { ok: boolean; output: string } {
  const [command, ...args] = step.cmd;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    ok: result.status === 0,
    output,
  };
}

function buildReport(stepResults: StepResult[]): ReleaseGateReport {
  const fixtureCount = readFixtureCount();
  const report: ReleaseGateReport = {
    steps: stepResults,
    goldenFixtureCount: fixtureCount,
    stressFixtureCount: fixtureCount,
    versions: {
      supportManifestVersion: SUPPORT_MANIFEST_VERSION,
      supportPackageVersion: SUPPORT_PACKAGE_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      scenarioVersion: SCENARIO_VERSION,
      scenarioShareVersion: SCENARIO_SHARE_VERSION,
    },
  };
  const commitHash = readCommitHash();
  if (commitHash) {
    report.commitHash = commitHash;
  }
  return report;
}

function main(): void {
  const steps = getSteps();
  const stepResults: StepResult[] = [];

  console.log("RELEASE_GATE_BEGIN");

  for (const step of steps) {
    console.log(`RELEASE_GATE_STEP ${step.name}`);
    const result = runStep(step);
    if (!result.ok) {
      stepResults.push({ name: step.name, status: "fail" });
      console.log(`RELEASE_GATE_FAIL ${step.name}`);
      console.log("RELEASE_GATE_FAILURE_EXCERPT_BEGIN");
      console.log(`STEP_NAME ${step.name}`);
      console.log(`FIRST_FAIL_MARKER ${findFirstFailMarker(result.output)}`);
      console.log(readSectionSummary(result.output, "REPRO_PACK_SUMMARY"));
      console.log(readSectionSummary(result.output, "GOLDEN_SUMMARY"));
      console.log(readSectionSummary(result.output, "STRESS_SUMMARY"));
      console.log("RELEASE_GATE_FAILURE_EXCERPT_END");
      const report = buildReport(stepResults);
      console.log(`RELEASE_GATE_REPORT_JSON ${JSON.stringify(report)}`);
      console.log("RELEASE_GATE_END");
      process.exit(1);
    }
    stepResults.push({ name: step.name, status: "pass" });
    console.log(`RELEASE_GATE_OK ${step.name}`);
  }

  const report = buildReport(stepResults);
  console.log(`RELEASE_GATE_REPORT_JSON ${JSON.stringify(report)}`);
  console.log("RELEASE_TAG_READY");
  console.log("RELEASE_GATE_END");
}

main();
