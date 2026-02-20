import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256Bytes } from "./rc/_hash";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

function runNodeScript(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function loadFirstGoldenOriginalBundle(root: string): unknown {
  const indexPath = path.join(root, "fixtures", "golden", "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as GoldenIndex;
  assert.equal(index.version, 1, "expected fixtures/golden/index.json version=1");
  assert(Array.isArray(index.fixtures), "expected fixtures/golden/index.json fixtures[]");
  assert(index.fixtures.length > 0, "expected at least one golden fixture");

  const fixtureName = index.fixtures[0];
  const fixturePath = path.join(root, "fixtures", "golden", fixtureName);
  const fixtureJson = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { originalBundle?: unknown };
  assert(fixtureJson.originalBundle !== undefined, "expected fixture to include originalBundle");
  return fixtureJson.originalBundle;
}

function buildAndSmoke(root: string, bundlePath: string, outDir: string): string {
  const buildScript = path.join(root, "scripts", "rc", "rc_bundle_build.ts");
  const smokeScript = path.join(root, "scripts", "rc", "rc_bundle_smoke.ts");

  const buildRes = runNodeScript(["--import", "tsx", buildScript, "--bundle", bundlePath, "--out", outDir]);
  assert.equal(buildRes.status, 0, `rc_bundle_build failed: ${buildRes.stderr || buildRes.stdout}`);
  assert(buildRes.stdout.includes("RC_BUNDLE_BUILD_OK"), "expected RC_BUNDLE_BUILD_OK marker");

  const smokeRes = runNodeScript(["--import", "tsx", smokeScript, "--bundle", outDir]);
  assert.equal(smokeRes.status, 0, `rc_bundle_smoke failed: ${smokeRes.stderr || smokeRes.stdout}`);
  assert(smokeRes.stdout.includes("RC_BUNDLE_SMOKE_OK"), "expected RC_BUNDLE_SMOKE_OK marker");

  const manifestBytes = fs.readFileSync(path.join(outDir, "manifest.json"));
  return sha256Bytes(manifestBytes);
}

function main(): void {
  const root = process.cwd();
  const originalBundle = loadFirstGoldenOriginalBundle(root);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-bundle-test-"));

  try {
    const bundlePath = path.join(tempDir, "bundle.json");
    fs.writeFileSync(bundlePath, JSON.stringify(originalBundle), "utf8");

    const outA = path.join(tempDir, "out-a");
    const outB = path.join(tempDir, "out-b");

    const digestA = buildAndSmoke(root, bundlePath, outA);
    const digestB = buildAndSmoke(root, bundlePath, outB);

    assert.equal(digestA, digestB, "expected stable manifest.json digest across repeated builds");
    console.log("RC BUNDLE TEST OK");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
