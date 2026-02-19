import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashSupportManifest } from "../src/lib/support/supportManifest";
import {
  SUPPORT_PACKAGE_VERSION,
  assertSupportPackageIntegrity,
  type SupportPackageV1,
} from "../src/lib/support/supportPackage";

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
  assert.equal(jsonA.packageVersion, SUPPORT_PACKAGE_VERSION, "expected packageVersion constant");
  assert(typeof jsonA.manifestHash === "string" && jsonA.manifestHash.length > 0, "expected manifestHash");
  assert(path.basename(runA.outPath).includes(jsonA.manifestHash), "filename should include manifest hash");

  const keyOrderTokens = [
    "\"packageVersion\":",
    "\"manifestHash\":",
    "\"manifest\":",
    "\"telemetryVersion\":",
    "\"replay\":",
    "\"drift\":",
    "\"integrity\":",
    "\"runbook\":",
    "\"originalBundle\":",
  ];
  let cursor = 0;
  for (const token of keyOrderTokens) {
    const idx = textA.indexOf(token, cursor);
    assert(idx >= 0, `expected key token in package JSON: ${token}`);
    cursor = idx + token.length;
  }

  const expectedManifestHashA = await hashSupportManifest(jsonA.manifest);
  assert.equal(jsonA.manifestHash, expectedManifestHashA, "manifestHash should match manifest");

  const { integrity: _discardedIntegrity, ...pkgWithoutIntegrityA } = jsonA as SupportPackageV1;
  const recomputedIntegrity = await assertSupportPackageIntegrity(pkgWithoutIntegrityA);
  assert.deepEqual(
    jsonA.integrity,
    recomputedIntegrity,
    "integrity block should match computed integrity from package payload",
  );

  const corruptedPackage: Omit<SupportPackageV1, "integrity"> = {
    ...pkgWithoutIntegrityA,
    replay: {
      ...pkgWithoutIntegrityA.replay,
      finalStateHash: `${pkgWithoutIntegrityA.replay.finalStateHash}-corrupt`,
    },
  };
  let integrityFailed = false;
  try {
    await assertSupportPackageIntegrity(corruptedPackage);
  } catch (err) {
    integrityFailed = true;
    assert.match(String(err), /SUPPORT_PACKAGE_INTEGRITY_ERROR:/, "expected deterministic integrity failure error");
  }
  assert(integrityFailed, "expected synthetic corrupted package to fail integrity check");

  const expectedPackageHashA = crypto.createHash("sha256").update(bytesA).digest("hex");
  assert.equal(runA.packageHash, expectedPackageHashA, "PACKAGE_HASH should match file sha256");

  fs.rmSync(runA.outPath);
  const runB = runPackager(scriptPath, bundlePath, outDir);
  assert.equal(runA.outPath, runB.outPath, "package path should be deterministic");
  assert.equal(runA.packageHash, runB.packageHash, "package hash should be deterministic");

  const bytesB = fs.readFileSync(runB.outPath);
  const textB = bytesB.toString("utf8");
  const expectedPackageHashB = crypto.createHash("sha256").update(bytesB).digest("hex");
  assert.equal(runB.packageHash, expectedPackageHashB, "run B PACKAGE_HASH should match file sha256");
  assert.equal(bytesA.compare(bytesB), 0, "package bytes should match across runs");
  assert.equal(textA, textB, "package text should match across runs");

  const entropyTokens = [
    "timestamp",
    "duration",
    "random",
    "seed",
    "Date.now",
    "performance.now",
    "new Date",
    "process.hrtime",
  ];
  for (const token of entropyTokens) {
    assert(!textA.includes(token), `package JSON should not include entropy token: ${token}`);
  }

  console.log("BUILD SUPPORT PACKAGE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
