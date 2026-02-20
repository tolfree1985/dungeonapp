import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

type TagReleaseReport = {
  tag: string;
  commitCount: number;
  lastTag: string | null;
  gateReady: boolean;
  dryRun: boolean;
  applied: boolean;
};

function runTagRelease(scriptPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--dry-run", "--test-mode"], {
    encoding: "utf8",
    env: { ...process.env, TAG_RELEASE_TEST_MODE: "1", RELEASE_GATE_TEST_MODE: "1" },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseReport(stdout: string): TagReleaseReport {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("TAG_RELEASE_REPORT_JSON "));
  assert(line, "expected TAG_RELEASE_REPORT_JSON marker");
  const payload = line.slice("TAG_RELEASE_REPORT_JSON ".length);
  return JSON.parse(payload) as TagReleaseReport;
}

function main(): void {
  const scriptPath = path.join(process.cwd(), "scripts", "run-tag-release.ts");

  const runA = runTagRelease(scriptPath);
  assert.equal(runA.status, 0, `tag release failed on first run: ${runA.stderr || runA.stdout}`);

  const runB = runTagRelease(scriptPath);
  assert.equal(runB.status, 0, `tag release failed on second run: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected byte-stable tag release output across runs");
  assert(runA.stdout.includes("TAG_DRY_RUN release-"), "expected deterministic dry-run tag marker");
  assert(runA.stdout.includes("RELEASE_NOTES_BEGIN"), "expected release notes begin marker");
  assert(runA.stdout.includes("RELEASE_NOTES_END"), "expected release notes end marker");
  assert(runA.stdout.includes("TAG_RELEASE_REPORT_JSON "), "expected release report json marker");

  const report = parseReport(runA.stdout);
  assert(typeof report.tag === "string" && report.tag.startsWith("release-"), "expected release tag in report");
  assert(typeof report.commitCount === "number" && report.commitCount >= 0, "expected commitCount in report");
  assert(report.lastTag === null || typeof report.lastTag === "string", "expected nullable lastTag in report");
  assert.equal(report.gateReady, true, "expected gateReady true in dry-run report");
  assert.equal(report.dryRun, true, "expected dryRun true in report");
  assert.equal(report.applied, false, "expected applied false in dry-run report");

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

  console.log("TAG RELEASE OK");
}

main();
