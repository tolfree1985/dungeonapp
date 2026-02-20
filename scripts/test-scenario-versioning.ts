import assert from "node:assert/strict";
import { buildScenarioDraftBundleText } from "../src/lib/buildScenarioDraftBundleText";
import {
  SCENARIO_VERSION,
  buildScenarioVersionStamp,
  computeScenarioContentHash,
} from "../src/lib/scenario/scenarioVersion";

function extractContentJson(bundleText: string): string {
  const marker = "Content JSON:\n";
  const idx = bundleText.indexOf(marker);
  assert(idx >= 0, "missing Content JSON marker");
  return bundleText.slice(idx + marker.length);
}

function main() {
  const scenarioA = {
    version: "1",
    id: "scenario_versioning_seed",
    title: "Versioning Seed",
    summary: "Deterministic scenario versioning test.",
    initialState: { stats: { health: 10 }, flags: { toneLock: "locked" } },
    start: { sceneId: "scene_start", prompt: "Begin." },
    turns: [
      {
        turnIndex: 0,
        stateDeltas: [{ op: "stats.set", path: "stats.health", before: 10, after: 9 }],
        ledgerAdds: [{ id: "l0", turnIndex: 0, message: "health -1" }],
      },
    ],
  };

  const scenarioB = {
    summary: "Deterministic scenario versioning test.",
    title: "Versioning Seed",
    id: "scenario_versioning_seed",
    turns: [
      {
        ledgerAdds: [{ message: "health -1", turnIndex: 0, id: "l0" }],
        stateDeltas: [{ before: 10, op: "stats.set", path: "stats.health", after: 9 }],
        turnIndex: 0,
      },
    ],
    start: { prompt: "Begin.", sceneId: "scene_start" },
    initialState: { flags: { toneLock: "locked" }, stats: { health: 10 } },
    version: "1",
  };

  const hashA = computeScenarioContentHash(scenarioA);
  const hashB = computeScenarioContentHash(scenarioB);
  assert.equal(hashA, hashB, "expected stable hash across reordered key layouts");
  assert(/^[a-f0-9]{64}$/.test(hashA), "expected 64-char sha256 scenario hash");

  const stampA = buildScenarioVersionStamp(scenarioA);
  const stampB = buildScenarioVersionStamp(scenarioB);
  assert.equal(stampA.scenarioVersion, SCENARIO_VERSION, "expected deterministic scenario version constant");
  assert.equal(stampB.scenarioVersion, SCENARIO_VERSION, "expected deterministic scenario version constant");
  assert.equal(stampA.contentHash, hashA, "expected stamp hash to match direct scenario content hash");
  assert.equal(stampB.contentHash, hashB, "expected stamp hash to match direct scenario content hash");

  const withDeterminismReportA = {
    ...scenarioA,
    determinismReport: { staticValidation: { status: "PASS" } },
  };
  const withDeterminismReportB = {
    ...scenarioA,
    determinismReport: { staticValidation: { status: "FAIL" }, note: "ephemeral-only" },
  };
  assert.equal(
    computeScenarioContentHash(withDeterminismReportA),
    computeScenarioContentHash(withDeterminismReportB),
    "expected determinismReport to be excluded from scenario content hash",
  );

  const withExistingStamp = {
    ...scenarioA,
    scenarioVersion: 999,
    scenarioContentHash: "not-real",
  };
  assert.equal(
    computeScenarioContentHash(scenarioA),
    computeScenarioContentHash(withExistingStamp),
    "expected scenario version/hash fields to be excluded from scenario content hash",
  );

  const bundleText = buildScenarioDraftBundleText({
    title: scenarioA.title,
    summary: scenarioA.summary,
    contentJson: JSON.stringify(scenarioA, null, 2),
    validationOk: true,
    parseError: null,
    issues: [],
    determinismReport: { staticValidation: { status: "PASS" } },
  });
  const exportedScenario = JSON.parse(extractContentJson(bundleText)) as Record<string, unknown>;
  assert.equal(exportedScenario.scenarioVersion, SCENARIO_VERSION, "expected exported scenario version stamp");
  assert.equal(
    exportedScenario.scenarioContentHash,
    computeScenarioContentHash(exportedScenario),
    "expected exported scenario hash to match deterministic scenario content hash",
  );

  console.log("SCENARIO VERSIONING OK");
}

main();
