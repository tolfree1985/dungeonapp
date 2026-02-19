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

function runGoldenHarness(scriptPath: string): { status: number | null; stdout: string; stderr: string } {
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
  const testScript = path.join(root, "scripts", "run-golden-replays.ts");
  const indexPath = path.join(root, "fixtures", "golden", "index.json");
  const index = parseGoldenIndex(indexPath);

  const checkIndex = spawnSync(process.execPath, ["--import", "tsx", testScript, "--check-index"], {
    encoding: "utf8",
  });
  assert.equal(checkIndex.status, 0, `--check-index failed: ${checkIndex.stderr || checkIndex.stdout}`);
  assert(checkIndex.stdout.includes(`GOLDEN_INDEX_OK count=${index.fixtures.length}`), "expected GOLDEN_INDEX_OK output");

  const listA = spawnSync(process.execPath, ["--import", "tsx", testScript, "--list"], {
    encoding: "utf8",
  });
  assert.equal(listA.status, 0, `--list failed on first run: ${listA.stderr || listA.stdout}`);
  const listB = spawnSync(process.execPath, ["--import", "tsx", testScript, "--list"], {
    encoding: "utf8",
  });
  assert.equal(listB.status, 0, `--list failed on second run: ${listB.stderr || listB.stdout}`);
  assert.equal(listA.stdout, listB.stdout, "expected stable fixture list output");
  for (const fixtureName of index.fixtures) {
    assert(listA.stdout.includes(`GOLDEN_FIXTURE ${fixtureName}`), `expected fixture in --list output: ${fixtureName}`);
  }

  const runA = runGoldenHarness(testScript);
  assert.equal(runA.status, 0, `run-golden-replays failed on first run: ${runA.stderr || runA.stdout}`);

  const runB = runGoldenHarness(testScript);
  assert.equal(runB.status, 0, `run-golden-replays failed on second run: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected stable golden replay output across runs");

  let lastPos = -1;
  for (const fixtureName of index.fixtures) {
    const marker = `GOLDEN_OK ${fixtureName} `;
    const pos = runA.stdout.indexOf(marker);
    assert(pos >= 0, `expected fixture success marker: ${marker}`);
    assert(pos > lastPos, `expected deterministic fixture output order for ${fixtureName}`);
    lastPos = pos;
  }
  assert(
    runA.stdout.includes(`GOLDEN_SUMMARY TOTAL=${index.fixtures.length} PASS=${index.fixtures.length} FAIL=0`),
    "expected deterministic GOLDEN_SUMMARY line",
  );
  assert(!runA.stdout.includes("/Users/"), "expected no absolute unix path in output");
  assert(!runA.stdout.includes("C:\\"), "expected no absolute windows path in output");

  console.log("GOLDEN REPLAYS OK");
}

main();
