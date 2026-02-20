import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

function parseGoldenIndex(indexPath: string): GoldenIndex {
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Partial<GoldenIndex>;
  assert.equal(parsed.version, 1, "expected fixtures/golden/index.json version=1");
  assert(Array.isArray(parsed.fixtures), "expected fixtures/golden/index.json fixtures[]");
  assert((parsed.fixtures ?? []).every((name) => typeof name === "string"), "expected fixture names as strings");
  return {
    version: parsed.version as number,
    fixtures: parsed.fixtures as string[],
  };
}

function runStress(scriptPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function main() {
  const root = process.cwd();
  const scriptPath = path.join(root, "scripts", "run-stress-replays.ts");
  const indexPath = path.join(root, "fixtures", "golden", "index.json");
  const index = parseGoldenIndex(indexPath);

  const runA = runStress(scriptPath);
  assert.equal(runA.status, 0, `run-stress-replays failed on first run: ${runA.stderr || runA.stdout}`);

  const runB = runStress(scriptPath);
  assert.equal(runB.status, 0, `run-stress-replays failed on second run: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected stable stress replay output across runs");
  assert(runA.stdout.includes("STRESS_MODE SEQUENTIAL"), "expected explicit sequential stress mode line");

  let lastPos = -1;
  for (const fixtureName of index.fixtures) {
    const marker = `STRESS_OK ${fixtureName} `;
    const pos = runA.stdout.indexOf(marker);
    assert(pos >= 0, `expected fixture stress success marker: ${marker}`);
    assert(pos > lastPos, `expected deterministic fixture output order for ${fixtureName}`);
    lastPos = pos;
  }

  assert(
    runA.stdout.includes(`STRESS_SUMMARY TOTAL=${index.fixtures.length} PASS=${index.fixtures.length} FAIL=0`),
    "expected deterministic STRESS_SUMMARY line",
  );
  assert(!runA.stdout.includes("STRESS_FAIL"), "did not expect stress failure marker in successful run");
  assert(!runA.stdout.includes("STRESS_SIZE_VIOLATION"), "did not expect size gate violation markers");
  assert(!runA.stdout.includes("STRESS_TURN_LIMIT_VIOLATION"), "did not expect turn-limit violation markers");
  assert(!runA.stdout.includes("/Users/"), "expected no absolute unix path in output");
  assert(!runA.stdout.includes("C:\\"), "expected no absolute windows path in output");

  console.log("STRESS REPLAYS OK");
}

main();
