import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runBoundaryLock(scriptPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath], {
    encoding: "utf8",
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function main(): void {
  const scriptPath = path.join(process.cwd(), "scripts", "check-entropy-usage.ts");

  const runA = runBoundaryLock(scriptPath);
  assert.equal(runA.status, 0, `boundary lock failed on first run: ${runA.stderr || runA.stdout}`);

  const runB = runBoundaryLock(scriptPath);
  assert.equal(runB.status, 0, `boundary lock failed on second run: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected byte-stable boundary lock output across runs");
  assert(runA.stdout.includes("BOUNDARY_LOCK_OK"), "expected BOUNDARY_LOCK_OK marker");
  assert(!runA.stdout.includes("/Users/"), "expected output without absolute unix paths");
  assert(!runA.stdout.includes("C:\\"), "expected output without absolute windows paths");
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|random|seed|Date\.now|performance\.now/i.test(runA.stdout),
    "expected deterministic boundary-lock output without entropy tokens",
  );

  console.log("BOUNDARY LOCK OK");
}

main();
