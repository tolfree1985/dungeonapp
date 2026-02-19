import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashSupportManifest } from "../src/lib/support/supportManifest";

function runPackager(scriptPath: string, bundlePath: string, outDir: string): { outPath: string; packageHash: string } {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      `--bundle-path=${bundlePath}`,
      `--out-dir=${outDir}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `packager failed: ${result.stderr || result.stdout}`);

  const stdout = result.stdout ?? "";
  const outPathLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("SUPPORT_PACKAGE_PATH "));
  const packageHashLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("PACKAGE_HASH "));

  assert(outPathLine, "expected SUPPORT_PACKAGE_PATH line");
  assert(packageHashLine, "expected PACKAGE_HASH line");

  return {
    outPath: outPathLine.replace(/^SUPPORT_PACKAGE_PATH\s+/, "").trim(),
    packageHash: packageHashLine.replace(/^PACKAGE_HASH\s+/, "").trim(),
  };
}

async function main() {
  const scriptPath = path.join(process.cwd(), "scripts", "build-support-package.ts");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "support-package-"));
  const bundlePath = path.join(tempDir, "bundle.json");
  const outDir = path.join(tempDir, "out");

  const bundle = {
    bundleId: "bundle-support-1",
    engineVersion: "engine-test",
    scenarioContentHash: "scenario-hash-test",
    adventureId: "adv-test",
    buildVersion: "build-test",
    turns: [
      { turnIndex: 0, stateDeltas: [{ op: "time.inc", by: 1 }], ledgerAdds: [{ kind: "time", msg: "+1" }] },
      { turnIndex: 1, stateDeltas: [{ op: "flag.set", key: "x", value: true }], ledgerAdds: [{ kind: "flag", msg: "x=true" }] },
    ],
  };

  fs.writeFileSync(bundlePath, JSON.stringify(bundle), "utf8");

  const runA = runPackager(scriptPath, bundlePath, outDir);
  assert(fs.existsSync(runA.outPath), "expected support package file to exist");

  const bytesA = fs.readFileSync(runA.outPath);
  const textA = bytesA.toString("utf8");
  const jsonA = JSON.parse(textA);
  assert.equal(jsonA.packageVersion, 1, "expected packageVersion=1");
  assert(typeof jsonA.manifestHash === "string" && jsonA.manifestHash.length > 0, "expected manifestHash");
  assert(path.basename(runA.outPath).includes(jsonA.manifestHash), "filename should include manifest hash");

  const expectedManifestHashA = await hashSupportManifest(jsonA.manifest);
  assert.equal(jsonA.manifestHash, expectedManifestHashA, "manifestHash should match manifest");

  const expectedPackageHashA = crypto.createHash("sha256").update(bytesA).digest("hex");
  assert.equal(runA.packageHash, expectedPackageHashA, "PACKAGE_HASH should match file sha256");

  fs.rmSync(runA.outPath);
  const runB = runPackager(scriptPath, bundlePath, outDir);
  assert.equal(runA.outPath, runB.outPath, "package path should be deterministic");
  assert.equal(runA.packageHash, runB.packageHash, "package hash should be deterministic");

  const bytesB = fs.readFileSync(runB.outPath);
  assert.equal(bytesA.compare(bytesB), 0, "package bytes should match across runs");

  console.log("BUILD SUPPORT PACKAGE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
