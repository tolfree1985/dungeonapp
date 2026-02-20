import { spawnSync } from "node:child_process";

type TagReleaseReport = {
  tag: string;
  commitCount: number;
  lastTag: string | null;
  gateReady: boolean;
  dryRun: boolean;
  applied: boolean;
};

function parseArgs(argv: string[]): { dryRun: boolean; apply: boolean; testMode: boolean } {
  return {
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply"),
    testMode: argv.includes("--test-mode"),
  };
}

function run(command: string, args: string[], extraEnv?: Record<string, string>): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...(extraEnv ?? {}) },
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
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

function emitFailure(marker: string, gateOutput?: string): never {
  console.log(marker);
  console.log("TAG_RELEASE_FAILURE_EXCERPT_BEGIN");
  console.log(marker);
  if (gateOutput && gateOutput.length > 0) {
    console.log(`GATE_FIRST_FAIL_MARKER ${findFirstFailMarker(gateOutput)}`);
  }
  console.log("TAG_RELEASE_FAILURE_EXCERPT_END");
  process.exit(1);
}

function getLastReleaseTag(): string | null {
  const tags = run("git", ["tag", "--list", "release-*", "--sort=creatordate"]);
  if (!tags.ok) return null;
  const list = tags.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return list.length > 0 ? list[list.length - 1] : null;
}

function buildNextTag(lastTag: string | null): string {
  if (!lastTag) return "release-1";
  const match = /^release-(\d+)$/.exec(lastTag);
  if (!match) return "release-1";
  const next = Number(match[1]) + 1;
  return `release-${next}`;
}

function getReleaseNotes(lastTag: string | null): string[] {
  const rangeArgs = lastTag
    ? ["log", `${lastTag}..HEAD`, "--oneline", "--no-decorate"]
    : ["log", "--oneline", "--no-decorate"];
  const result = run("git", rangeArgs);
  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply && !args.dryRun;
  const dryRun = !apply;

  const status = run("git", ["status", "--porcelain"]);
  if (!status.ok) {
    emitFailure("TAG_RELEASE_BLOCKED_STATUS_CHECK_FAILED");
  }
  if (status.stdout.trim().length > 0) {
    emitFailure("TAG_RELEASE_BLOCKED_DIRTY_REPO");
  }

  let gateReady = false;
  const forceGateFail = process.env.TAG_RELEASE_FORCE_GATE_FAIL === "1";
  let gateOutput = "";
  if (!forceGateFail) {
    const gateArgs = ["--import", "tsx", "scripts/run-release-gate.ts"];
    const gateEnv: Record<string, string> = {};
    if (args.testMode || process.env.TAG_RELEASE_TEST_MODE === "1") {
      gateArgs.push("--test-mode");
      gateEnv.RELEASE_GATE_TEST_MODE = "1";
    }
    const gate = run("node", gateArgs, gateEnv);
    gateOutput = `${gate.stdout}\n${gate.stderr}`;
    gateReady = gate.ok && gate.stdout.includes("RELEASE_TAG_READY");
  }
  if (!gateReady) {
    emitFailure("TAG_RELEASE_BLOCKED_GATE_NOT_READY", gateOutput);
  }

  const lastTag = getLastReleaseTag();
  const tag = buildNextTag(lastTag);
  const releaseNotes = getReleaseNotes(lastTag);

  console.log("RELEASE_NOTES_BEGIN");
  for (const line of releaseNotes) {
    console.log(`- ${line}`);
  }
  console.log("RELEASE_NOTES_END");

  if (apply) {
    const tagResult = run("git", ["tag", tag]);
    if (!tagResult.ok) {
      emitFailure("TAG_RELEASE_BLOCKED_TAG_CREATE_FAILED");
    }
    console.log(`TAG_CREATED ${tag}`);
  } else {
    console.log(`TAG_DRY_RUN ${tag}`);
  }

  console.log(`TAG_RELEASE_SUMMARY TAG=${tag} COMMITS=${releaseNotes.length}`);
  const report: TagReleaseReport = {
    tag,
    commitCount: releaseNotes.length,
    lastTag,
    gateReady: true,
    dryRun,
    applied: apply,
  };
  console.log(`TAG_RELEASE_REPORT_JSON ${JSON.stringify(report)}`);
}

main();
