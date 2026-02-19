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

  console.log("GOLDEN REPLAYS OK");
}

main();
