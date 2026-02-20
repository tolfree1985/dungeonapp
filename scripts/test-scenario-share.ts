import assert from "node:assert/strict";
import {
  SCENARIO_SHARE_VERSION,
  buildScenarioSharePackage,
  evaluateScenarioShareCompatibility,
  parseScenarioSharePackage,
  serializeScenarioSharePackage,
} from "../src/lib/scenario/scenarioShare";
import { SCENARIO_VERSION, computeScenarioContentHash } from "../src/lib/scenario/scenarioVersion";
import { validateScenarioDeterminism } from "../src/lib/scenario/validateScenarioDeterminism";

function assertKeyOrder(serialized: string): void {
  const keys = ["\"shareVersion\"", "\"scenarioVersion\"", "\"scenarioContentHash\"", "\"engineCompat\"", "\"scenario\""];
  let lastIndex = -1;
  for (const key of keys) {
    const idx = serialized.indexOf(key);
    assert(idx > lastIndex, `expected key order to include ${key}`);
    lastIndex = idx;
  }
}

function main() {
  const scenario = {
    version: "1",
    id: "scenario_share_seed",
    title: "Scenario Share Seed",
    summary: "Deterministic scenario share package test.",
    initialState: { stats: { health: 10 }, flags: { toneLock: "locked" } },
    start: { sceneId: "scene_start", prompt: "Begin." },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "set", path: "stats.health", before: 10, after: 9 }],
        ledgerAdds: [{ id: "l0", message: "health adjusted", because: "combat", kind: "complication" }],
      },
    ],
    determinismReport: { ephemeral: true },
    editorState: { selection: "ignored" },
  };

  const pkg = buildScenarioSharePackage(scenario);
  assert.equal(pkg.shareVersion, SCENARIO_SHARE_VERSION, "expected scenario share version constant");
  assert.equal(pkg.scenarioVersion, SCENARIO_VERSION, "expected scenario version constant in share package");
  assert.equal(
    pkg.scenarioContentHash,
    computeScenarioContentHash(pkg.scenario),
    "expected share package hash to match canonical scenario content hash",
  );
  assert(!("determinismReport" in pkg.scenario), "expected determinismReport to be excluded from shared scenario");
  assert(!("editorState" in pkg.scenario), "expected editorState to be excluded from shared scenario");

  const serialized = serializeScenarioSharePackage(pkg);
  assertKeyOrder(serialized);

  const parsed = parseScenarioSharePackage(serialized);
  assert.equal(parsed.marker, "", "expected deterministic share package parse success marker");
  assert(parsed.pkg, "expected parsed share package payload");
  assert.equal(
    parsed.pkg?.scenarioContentHash,
    pkg.scenarioContentHash,
    "expected parsed share hash to match built package hash",
  );

  const tampered = JSON.stringify({ ...pkg, scenarioContentHash: "0".repeat(64) });
  const tamperedParsed = parseScenarioSharePackage(tampered);
  assert.equal(
    tamperedParsed.marker,
    "SHARE_IMPORT_BLOCKED",
    "expected tampered hash package to be blocked during import parse",
  );
  assert(
    tamperedParsed.issues.includes("scenarioContentHash_mismatch"),
    "expected hash mismatch issue marker",
  );

  const warningCompat = evaluateScenarioShareCompatibility({
    ...(pkg.engineCompat as any),
    telemetryVersion: 1.1,
  });
  assert.equal(warningCompat.marker, "SHARE_COMPAT_WARNING", "expected warning marker for minor version mismatch");

  const blockedCompat = evaluateScenarioShareCompatibility({
    ...(pkg.engineCompat as any),
    supportManifestVersion: 2,
  });
  assert.equal(blockedCompat.marker, "SHARE_COMPAT_BLOCKED", "expected blocked marker for major version mismatch");

  const invalidScenario = {
    version: "1",
    id: "scenario_share_invalid",
    title: "Invalid Share",
    summary: "invalid",
    initialState: { stats: { health: 10 } },
    start: { sceneId: "scene_start", prompt: "Begin." },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "set", path: "stats.health", before: 10, after: 9.5 }],
        ledgerAdds: [{ id: "l0", message: "invalid float mutation" }],
      },
    ],
  };
  const invalidPkg = buildScenarioSharePackage(invalidScenario);
  const invalidParsed = parseScenarioSharePackage(serializeScenarioSharePackage(invalidPkg));
  assert(invalidParsed.pkg, "expected invalid package to parse structurally");
  const determinism = validateScenarioDeterminism(invalidParsed.pkg?.scenario);
  assert.equal(determinism.valid, false, "expected invalid scenario to fail determinism validation");
  assert(
    determinism.errors.includes("SCENARIO_FLOAT_STAT_MUTATION"),
    "expected float stat mutation marker for import gating",
  );

  console.log("SCENARIO SHARE OK");
}

main();
