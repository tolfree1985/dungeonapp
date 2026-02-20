import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runScript(script: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    encoding: "utf8",
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function extractManifestJson(stdout: string): string {
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("ARTIFACT_MANIFEST_JSON "));
  assert(line, "expected ARTIFACT_MANIFEST_JSON marker");
  return line.slice("ARTIFACT_MANIFEST_JSON ".length);
}

function createSyntheticArtifacts(rootDir: string): void {
  const nextDir = path.join(rootDir, ".next");
  const publicDir = path.join(rootDir, "public");
  fs.mkdirSync(path.join(nextDir, "static"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(nextDir, "BUILD_ID"), "deterministic-build", "utf8");
  fs.writeFileSync(path.join(nextDir, "static", "app.js"), "console.log('artifact');\n", "utf8");
  fs.writeFileSync(path.join(publicDir, "assets", "logo.txt"), "logo-v1\n", "utf8");
}

function main(): void {
  const isGateMode = process.argv.includes("--gate");
  const buildScript = path.join(process.cwd(), "scripts", "build-artifact-manifest.ts");
  const verifyScript = path.join(process.cwd(), "scripts", "verify-artifact-manifest.ts");

  if (isGateMode) {
    const args = ["--artifact-dirs=.next,public", "--ensure-build"];
    const manifestRun = runScript(buildScript, args);
    assert.equal(
      manifestRun.status,
      0,
      `artifact manifest generation failed in gate mode: ${manifestRun.stderr || manifestRun.stdout}`,
    );
    const manifestJson = extractManifestJson(manifestRun.stdout);
    const verifyRun = runScript(verifyScript, [`--artifact-dirs=.next,public`, `--manifest-json=${manifestJson}`]);
    assert.equal(
      verifyRun.status,
      0,
      `artifact manifest verify failed in gate mode: ${verifyRun.stderr || verifyRun.stdout}`,
    );
    assert(verifyRun.stdout.includes("ARTIFACT_VERIFY_OK"), "expected ARTIFACT_VERIFY_OK in gate mode");
    console.log("ARTIFACT MANIFEST GATE OK");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-manifest-"));
  createSyntheticArtifacts(tempDir);
  const commonArgs = [`--root=${tempDir}`, "--artifact-dirs=.next,public"];

  const runA = runScript(buildScript, commonArgs);
  assert.equal(runA.status, 0, `artifact manifest run A failed: ${runA.stderr || runA.stdout}`);

  const runB = runScript(buildScript, commonArgs);
  assert.equal(runB.status, 0, `artifact manifest run B failed: ${runB.stderr || runB.stdout}`);

  assert.equal(runA.stdout, runB.stdout, "expected artifact manifest output stability across two runs");

  const manifestJson = extractManifestJson(runA.stdout);
  const manifest = JSON.parse(manifestJson) as {
    artifactVersion: number;
    files: Array<{ path: string; bytes: number; sha256: string }>;
    manifestHash: string;
  };
  assert.equal(manifest.artifactVersion, 1, "expected artifactVersion 1");
  assert(Array.isArray(manifest.files) && manifest.files.length >= 1, "expected manifest files");
  assert(typeof manifest.manifestHash === "string" && manifest.manifestHash.length === 64, "expected manifest hash");

  const verifyRun = runScript(verifyScript, [...commonArgs, `--manifest-json=${manifestJson}`]);
  assert.equal(verifyRun.status, 0, `artifact manifest verify failed: ${verifyRun.stderr || verifyRun.stdout}`);
  assert(verifyRun.stdout.includes("ARTIFACT_VERIFY_OK"), "expected ARTIFACT_VERIFY_OK");

  assert(!runA.stdout.includes("/Users/"), "expected manifest output without absolute unix paths");
  assert(!runA.stdout.includes("C:\\"), "expected manifest output without absolute windows paths");
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|random|seed|Date\.now|performance\.now/i.test(runA.stdout),
    "expected manifest output without entropy tokens",
  );

  console.log("ARTIFACT MANIFEST OK");
}

main();
