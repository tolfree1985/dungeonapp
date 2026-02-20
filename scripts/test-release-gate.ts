import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ReleaseGateReport = {
  steps: Array<{ name: string; status: "pass" | "fail" }>;
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

function runGate(scriptPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--test-mode"], {
    encoding: "utf8",
    env: { ...process.env, RELEASE_GATE_TEST_MODE: "1" },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseReport(stdout: string): ReleaseGateReport {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("RELEASE_GATE_REPORT_JSON "));
  assert(line, "expected RELEASE_GATE_REPORT_JSON marker");
  const payload = line.slice("RELEASE_GATE_REPORT_JSON ".length);
  return JSON.parse(payload) as ReleaseGateReport;
}

function main(): void {
  const scriptPath = path.join(process.cwd(), "scripts", "run-release-gate.ts");

  const runA = runGate(scriptPath);
  assert.equal(runA.status, 0, `release gate failed on first run: ${runA.stderr || runA.stdout}`);

  const runB = runGate(scriptPath);
  assert.equal(runB.status, 0, `release gate failed on second run: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected byte-stable release gate output across runs");
  assert(runA.stdout.includes("RELEASE_GATE_BEGIN"), "expected RELEASE_GATE_BEGIN");
  assert(runA.stdout.includes("RELEASE_TAG_READY"), "expected RELEASE_TAG_READY");
  assert(runA.stdout.includes("RELEASE_GATE_END"), "expected RELEASE_GATE_END");

  const report = parseReport(runA.stdout);
  assert(Array.isArray(report.steps), "expected report steps array");
  assert(report.steps.length >= 1, "expected at least one release-gate step");
  assert(report.steps.every((step) => step.status === "pass"), "expected all release-gate test steps to pass");
  assert(typeof report.goldenFixtureCount === "number", "expected goldenFixtureCount number");
  assert(typeof report.stressFixtureCount === "number", "expected stressFixtureCount number");
  assert(typeof report.versions.supportManifestVersion === "number", "expected supportManifestVersion number");
  assert(typeof report.versions.supportPackageVersion === "number", "expected supportPackageVersion number");
  assert(typeof report.versions.telemetryVersion === "number", "expected telemetryVersion number");
  assert(typeof report.versions.scenarioVersion === "number", "expected scenarioVersion number");
  assert(typeof report.versions.scenarioShareVersion === "number", "expected scenarioShareVersion number");

  const forbidden = [
    "/Users/",
    "C:\\",
    "timestamp",
    "duration",
    "ms",
    "seconds",
    "random",
    "seed",
    "Date.now",
    "performance.now",
  ];
  for (const token of forbidden) {
    assert(!runA.stdout.includes(token), `expected deterministic output without forbidden token: ${token}`);
  }

  console.log("RELEASE GATE OK");
}

main();
