import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  assertSupportManifestConsistency,
} from "../src/lib/support/supportManifest";
import { SUPPORT_PACKAGE_VERSION } from "../src/lib/support/supportPackage";

function extractSection(output: string, startMarker: string, endMarker?: string): string {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === startMarker);
  assert(start >= 0, `missing marker: ${startMarker}`);
  const end = endMarker ? lines.findIndex((line, idx) => idx > start && line.trim() === endMarker) : -1;
  const slice = end > start ? lines.slice(start, end) : lines.slice(start);
  return slice.join("\n").trim();
}

function main() {
  const scriptPath = path.join(process.cwd(), "scripts", "replay-from-bundle.ts");
  const buildSupportPackageScriptPath = path.join(process.cwd(), "scripts", "build-support-package.ts");
  const bundle = {
    bundleId: "bundle-test-1",
    engineVersion: "engine-test",
    scenarioContentHash: "hash-test",
    adventureId: "adv-test",
    buildVersion: "build-test",
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "time.inc", by: 1 }],
        ledgerAdds: [{ kind: "time", msg: "time +1" }],
      },
      {
        turnIndex: 1,
        stateDeltas: [{ op: "flag.set", key: "dockSeen", value: true }],
        ledgerAdds: [{ kind: "flag", msg: "dockSeen true" }],
      },
      {
        turnIndex: 2,
        stateDeltas: [{ op: "inv.add", item: { id: "key", name: "Rusty Key", qty: 1 } }],
        ledgerAdds: [{ kind: "inventory", msg: "Added key" }],
      },
    ],
  };

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, `replay script failed: ${result.stderr || result.stdout}`);

  const out = result.stdout ?? "";
  assert(out.includes("REPLAY COMPLETE"), "expected REPLAY COMPLETE marker");
  assert(out.includes("FINAL_STATE_HASH"), "expected FINAL_STATE_HASH marker");
  assert(out.includes("TURNS"), "expected TURNS marker");
  assert(out.includes("INVARIANT_SEQ_CONTIGUOUS"), "expected sequence invariant marker");
  assert(out.includes("INVARIANT_LEDGER_COUNT"), "expected ledger invariant marker");
  assert(out.includes(`TELEMETRY_VERSION ${TELEMETRY_VERSION}`), "expected TELEMETRY_VERSION marker");
  assert(out.includes("TELEMETRY"), "expected TELEMETRY marker");
  assert(out.includes("TURN_COUNT:"), "expected TURN_COUNT telemetry field");
  assert(out.includes("TOTAL_LEDGER_ENTRIES:"), "expected TOTAL_LEDGER_ENTRIES telemetry field");
  assert(out.includes("TOTAL_STATE_DELTAS:"), "expected TOTAL_STATE_DELTAS telemetry field");
  assert(out.includes("MAX_DELTA_PER_TURN:"), "expected MAX_DELTA_PER_TURN telemetry field");
  assert(out.includes("AVG_DELTA_PER_TURN:"), "expected AVG_DELTA_PER_TURN telemetry field");
  assert(out.includes("MAX_LEDGER_PER_TURN:"), "expected MAX_LEDGER_PER_TURN telemetry field");
  assert(out.includes("FINAL_STATE_HASH:"), "expected telemetry FINAL_STATE_HASH field");
  assert(out.includes("PER_TURN_TELEMETRY"), "expected PER_TURN_TELEMETRY marker");
  assert(
    /TURN_INDEX:\s+\d+\s+DELTA_COUNT:\s+\d+\s+LEDGER_COUNT:\s+\d+\s+HAS_RESOLUTION:\s+(true|false)/.test(out),
    "expected at least one per-turn telemetry row",
  );
  assert(!out.includes("TELEMETRY_JSON "), "did not expect TELEMETRY_JSON without flag");
  assert(out.includes("MANIFEST_HASH "), "expected MANIFEST_HASH output in base run");

  const telemetryBlockA = extractSection(out, "TELEMETRY", "PER_TURN_TELEMETRY");
  const perTurnBlockA = extractSection(out, "PER_TURN_TELEMETRY");
  const hashLineA = (out.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();

  const telemetryValues: Record<string, number> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(
      /^(TURN_COUNT|TOTAL_LEDGER_ENTRIES|TOTAL_STATE_DELTAS|MAX_DELTA_PER_TURN|AVG_DELTA_PER_TURN|MAX_LEDGER_PER_TURN):\s+([0-9]+(?:\.[0-9]+)?)$/,
    );
    if (m) {
      telemetryValues[m[1]] = Number(m[2]);
    }
  }

  const positiveFields = [
    "TURN_COUNT",
    "TOTAL_LEDGER_ENTRIES",
    "TOTAL_STATE_DELTAS",
    "MAX_DELTA_PER_TURN",
    "AVG_DELTA_PER_TURN",
    "MAX_LEDGER_PER_TURN",
  ] as const;

  for (const field of positiveFields) {
    const value = telemetryValues[field];
    assert(Number.isFinite(value) && value > 0, `expected ${field} > 0, got ${String(value)}`);
  }

  const result2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result2.status, 0, `second replay script failed: ${result2.stderr || result2.stdout}`);
  const out2 = result2.stdout ?? "";
  const telemetryBlockB = extractSection(out2, "TELEMETRY", "PER_TURN_TELEMETRY");
  const perTurnBlockB = extractSection(out2, "PER_TURN_TELEMETRY");
  const hashLineB = (out2.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();

  assert.equal(telemetryBlockA, telemetryBlockB, "telemetry block should be stable across runs");
  assert.equal(perTurnBlockA, perTurnBlockB, "per-turn telemetry should be stable across runs");
  assert.equal(hashLineA, hashLineB, "final state hash should be stable across runs");

  const withJson = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--telemetry-json",
      "--manifest-json",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(withJson.status, 0, `replay script (--telemetry-json) failed: ${withJson.stderr || withJson.stdout}`);
  const outJson = withJson.stdout ?? "";
  assert(outJson.includes("TELEMETRY_JSON "), "expected TELEMETRY_JSON output when flag is present");
  assert(outJson.includes("SUPPORT_MANIFEST_JSON "), "expected SUPPORT_MANIFEST_JSON output when flag is present");
  assert(outJson.includes("MANIFEST_HASH "), "expected MANIFEST_HASH output when flag is present");
  const telemetryJsonLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("TELEMETRY_JSON ")) ?? "";
  assert(telemetryJsonLine.length > 0, "expected TELEMETRY_JSON line");
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|token|random|seed|Date\.now|performance\.now/i.test(telemetryJsonLine),
    "telemetry JSON should not include timing/entropy fields",
  );

  const baseHashLine = (out.split(/\r?\n/).find((line) => line.startsWith("FINAL_STATE_HASH ")) ?? "").trim();
  const baseHash = baseHashLine.split(" ")[1] ?? "";
  const manifestLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("SUPPORT_MANIFEST_JSON ")) ?? "";
  assert(manifestLine.length > 0, "expected SUPPORT_MANIFEST_JSON line");
  const manifestJsonRaw = manifestLine.replace(/^SUPPORT_MANIFEST_JSON\s+/, "");
  const manifestHashLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("MANIFEST_HASH ")) ?? "";
  assert(manifestHashLine.length > 0, "expected MANIFEST_HASH line");
  const manifestHash = manifestHashLine.replace(/^MANIFEST_HASH\s+/, "").trim();
  const expectedManifestHash = crypto.createHash("sha256").update(manifestJsonRaw).digest("hex");
  assert.equal(manifestHash, expectedManifestHash, "manifest hash should match sha256(manifest json)");

  const manifestJson = JSON.parse(manifestJsonRaw);
  assert.equal(
    manifestJson.manifestVersion,
    SUPPORT_MANIFEST_VERSION,
    "manifestVersion should match SUPPORT_MANIFEST_VERSION",
  );
  assert.equal(
    manifestJson.replay?.telemetryVersion,
    TELEMETRY_VERSION,
    "replay.telemetryVersion should match TELEMETRY_VERSION",
  );
  assert.equal(
    manifestJson.perTurn?.length,
    manifestJson.replay?.turnCount,
    "manifest perTurn length should match replay.turnCount",
  );
  assert.equal(
    manifestJson.replay?.finalStateHash,
    baseHash,
    "manifest replay.finalStateHash should match base FINAL_STATE_HASH",
  );
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|token|random|seed|Date\.now|performance\.now/i.test(manifestJsonRaw),
    "manifest json should not include timing/entropy fields",
  );

  const orderedKeys = [
    "\"manifestVersion\"",
    "\"bundleId\"",
    "\"engineVersion\"",
    "\"scenarioContentHash\"",
    "\"adventureId\"",
    "\"buildVersion\"",
    "\"replay\"",
    "\"telemetry\"",
    "\"perTurn\"",
  ];
  const keyPositions = orderedKeys.map((key) => manifestJsonRaw.indexOf(key));
  for (let i = 0; i < keyPositions.length - 1; i++) {
    assert(
      keyPositions[i] >= 0 && keyPositions[i + 1] >= 0 && keyPositions[i] < keyPositions[i + 1],
      `expected manifest key order for ${orderedKeys[i]} before ${orderedKeys[i + 1]}`,
    );
  }

  const withManifest2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    withManifest2.status,
    0,
    `second replay script (--manifest-json) failed: ${withManifest2.stderr || withManifest2.stdout}`,
  );
  const manifestLine2 =
    (withManifest2.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("SUPPORT_MANIFEST_JSON ")) ?? "";
  assert(manifestLine2.length > 0, "expected SUPPORT_MANIFEST_JSON line in second manifest run");
  assert.equal(manifestLine, manifestLine2, "manifest json output should be stable across runs");
  const manifestHashLine2 =
    (withManifest2.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("MANIFEST_HASH ")) ?? "";
  assert(manifestHashLine2.length > 0, "expected MANIFEST_HASH line in second manifest run");
  assert.equal(manifestHashLine, manifestHashLine2, "manifest hash output should be stable across runs");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-support-package-"));
  const bundlePath = path.join(tempDir, "bundle.json");
  const supportOutDir = path.join(tempDir, "support-out");
  fs.writeFileSync(bundlePath, JSON.stringify(bundle), "utf8");

  const buildSupportPackage = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      buildSupportPackageScriptPath,
      `--bundle-path=${bundlePath}`,
      `--out-dir=${supportOutDir}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    buildSupportPackage.status,
    0,
    `build-support-package failed: ${buildSupportPackage.stderr || buildSupportPackage.stdout}`,
  );
  const supportPackagePathLine =
    (buildSupportPackage.stdout ?? "").split(/\r?\n/).find((line) => line.startsWith("SUPPORT_PACKAGE_PATH ")) ?? "";
  assert(supportPackagePathLine.length > 0, "expected SUPPORT_PACKAGE_PATH from package builder");
  const supportPackagePath = supportPackagePathLine.replace(/^SUPPORT_PACKAGE_PATH\s+/, "").trim();
  assert(fs.existsSync(supportPackagePath), "expected support package file to exist");

  const replaySupportPackage = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackagePath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackage.status,
    0,
    `replay script (--support-package-path) failed: ${replaySupportPackage.stderr || replaySupportPackage.stdout}`,
  );
  const outSupportPackage = replaySupportPackage.stdout ?? "";
  assert(outSupportPackage.includes("REPRO_PACK_VALIDATION"), "expected support package validation marker");
  assert(
    outSupportPackage.includes(`PACKAGE_VERSION: ${SUPPORT_PACKAGE_VERSION}`),
    "expected package version validation line",
  );
  assert(outSupportPackage.includes("MANIFEST_HASH_MATCH: true"), "expected manifest hash parity");
  assert(outSupportPackage.includes("FINAL_STATE_HASH_MATCH: true"), "expected final state hash parity");
  assert(outSupportPackage.includes("TELEMETRY_MATCH: true"), "expected telemetry parity");
  assert(outSupportPackage.includes("DRIFT_SEVERITY: NONE"), "expected deterministic drift severity");
  assert(!outSupportPackage.includes("DRIFT_PARITY_MISMATCH"), "did not expect drift parity mismatch");

  const supportLines = outSupportPackage.split(/\r?\n/);
  const idxTelemetryVersion = supportLines.findIndex((line) => line.startsWith("TELEMETRY_VERSION "));
  const idxTelemetry = supportLines.findIndex((line) => line.trim() === "TELEMETRY");
  const idxPerTurn = supportLines.findIndex((line) => line.trim() === "PER_TURN_TELEMETRY");
  const idxManifestJson = supportLines.findIndex((line) => line.startsWith("SUPPORT_MANIFEST_JSON "));
  const idxManifestHash = supportLines.findIndex((line) => line.startsWith("MANIFEST_HASH "));
  const idxPackValidation = supportLines.findIndex((line) => line.trim() === "REPRO_PACK_VALIDATION");
  assert(
    idxTelemetryVersion >= 0 &&
      idxTelemetry >= 0 &&
      idxPerTurn >= 0 &&
      idxManifestJson >= 0 &&
      idxManifestHash >= 0 &&
      idxPackValidation >= 0,
    "expected ordered output markers in support package replay mode",
  );
  assert(
    idxTelemetryVersion < idxTelemetry &&
      idxTelemetry < idxPerTurn &&
      idxPerTurn < idxManifestJson &&
      idxManifestJson < idxManifestHash &&
      idxManifestHash < idxPackValidation,
    "expected deterministic output section ordering",
  );
  assert(
    !/timestamp|duration|\bms\b|\bseconds\b|random|seed|Date\.now|performance\.now/i.test(outSupportPackage),
    "support package replay output should not include entropy/timing tokens",
  );

  const replaySupportPackage2 = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      scriptPath,
      "--bundle-id=test-bundle",
      "--manifest-json",
      `--support-package-path=${supportPackagePath}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    replaySupportPackage2.status,
    0,
    `second replay script (--support-package-path) failed: ${replaySupportPackage2.stderr || replaySupportPackage2.stdout}`,
  );
  const validationA = extractSection(outSupportPackage, "REPRO_PACK_VALIDATION");
  const validationB = extractSection(replaySupportPackage2.stdout ?? "", "REPRO_PACK_VALIDATION");
  assert.equal(validationA, validationB, "support package validation section should be stable across runs");

  const corruptedManifest = JSON.parse(JSON.stringify(manifestJson));
  corruptedManifest.perTurn = [];
  assert.throws(
    () => assertSupportManifestConsistency(corruptedManifest),
    /SUPPORT_MANIFEST_INTEGRITY_ERROR/,
    "expected manifest consistency guard to throw on corrupted manifest",
  );

  console.log("REPLAY FROM BUNDLE OK");
}

main();
