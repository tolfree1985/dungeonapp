import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildDeterministicReproCliText } from "../src/lib/support/buildDeterministicReproCliText";
import { buildSupportShareBlockText } from "../src/lib/support/buildSupportShareBlockText";
import { buildSupportTurnReproBlockText } from "../src/lib/support/buildSupportTurnReproBlockText";
import { buildSupportCriticalAnchorsText } from "../src/lib/support/buildSupportCriticalAnchorsText";

function main() {
  const pagePath = path.join(process.cwd(), "src", "app", "support", "page.tsx");
  const dashboardPath = path.join(process.cwd(), "src", "components", "SupportDashboard.tsx");
  const reproCliPath = path.join(process.cwd(), "src", "lib", "support", "buildDeterministicReproCliText.ts");
  const shareBlockPath = path.join(process.cwd(), "src", "lib", "support", "buildSupportShareBlockText.ts");
  const turnReproPath = path.join(process.cwd(), "src", "lib", "support", "buildSupportTurnReproBlockText.ts");
  const deltaMapPath = path.join(process.cwd(), "src", "lib", "support", "deltaPathMeaningMap.ts");

  const pageSource = fs.readFileSync(pagePath, "utf8");
  const dashboardSource = fs.readFileSync(dashboardPath, "utf8");
  const reproCliSource = fs.readFileSync(reproCliPath, "utf8");
  const shareBlockSource = fs.readFileSync(shareBlockPath, "utf8");
  const turnReproSource = fs.readFileSync(turnReproPath, "utf8");
  const deltaMapSource = fs.readFileSync(deltaMapPath, "utf8");

  assert(pageSource.includes("SupportDashboard"), "Expected support page to render SupportDashboard");
  assert(pageSource.includes("supportEnabled"), "Expected dev/admin support guard");
  assert(pageSource.includes("runbookSectionChecks"), "Expected runbook cross-check data wiring");
  assert(pageSource.includes("runbookSections"), "Expected runbook sections copy wiring");
  assert(pageSource.includes("fixtureOptions"), "Expected fixture options wiring");

  assert(dashboardSource.includes("Support Dashboard"), 'Expected "Support Dashboard" heading');
  assert(dashboardSource.includes("Debug Bundles"), 'Expected "Debug Bundles" panel');
  assert(dashboardSource.includes("Reproduction Checklist"), 'Expected "Reproduction Checklist" panel');
  assert(dashboardSource.includes("Runbook"), 'Expected "Runbook" panel');
  assert(dashboardSource.includes("Issue Draft Generator"), 'Expected "Issue Draft Generator" panel');
  assert(dashboardSource.includes("bundleId"), 'Expected bundleId input label');
  assert(dashboardSource.includes("Load bundle"), 'Expected "Load bundle" control');
  assert(dashboardSource.includes("Enable redaction preview"), 'Expected redaction preview toggle');
  assert(dashboardSource.includes("Bundle JSON Pretty Viewer"), 'Expected JSON pretty viewer section');
  assert(dashboardSource.includes("Bundle Compare View"), 'Expected compare view section');
  assert(dashboardSource.includes("NOT FOUND"), 'Expected deterministic NOT FOUND runbook state');
  assert(dashboardSource.includes("Copy issue block"), 'Expected issue block copy control');
  assert(dashboardSource.includes("Determinism Integrity"), 'Expected determinism integrity panel');
  assert(
    dashboardSource.includes("GREEN: Required deterministic invariants present"),
    'Expected deterministic integrity green state text',
  );
  assert(dashboardSource.includes("Bundle Shape"), "Expected bundle shape detector panel");
  assert(dashboardSource.includes("missing-field drilldown"), "Expected missing-field drilldown control");
  assert(dashboardSource.includes("Missing required fields"), "Expected missing required fields drilldown");
  assert(dashboardSource.includes("Missing non-critical fields"), "Expected missing non-critical fields drilldown");
  assert(deltaMapSource.includes("DELTA_PATH_MEANING_MAP"), "Expected centralized delta path map");
  assert(deltaMapSource.includes("categorizeDeltaPath"), "Expected centralized delta categorizer");
  assert(dashboardSource.includes("Copy deterministic repro CLI block"), 'Expected repro CLI copy control');
  assert(reproCliSource.includes("scripts/replay-from-bundle.ts"), 'Expected deterministic replay CLI contract text');
  assert(dashboardSource.includes("Structured Timeline Viewer"), 'Expected timeline viewer section');
  assert(dashboardSource.includes("Minimal Repro Mode"), 'Expected minimal repro mode toggle');
  assert(dashboardSource.includes("Search within bundle"), "Expected deterministic bundle search control");
  assert(deltaMapSource.includes("inventory"), 'Expected consequence delta highlighter signal');
  assert(dashboardSource.includes("Turn Deep View Drawer"), "Expected turn deep view drawer");
  assert(dashboardSource.includes("Why This Changed"), "Expected why-this-changed causal panel");
  assert(dashboardSource.includes("Delta Path"), "Expected causal table delta path header");
  assert(dashboardSource.includes("Ledger Explanation(s)"), "Expected causal table ledger explanation header");
  assert(dashboardSource.includes("Highlights"), "Expected causal table highlights header");
  assert(dashboardSource.includes("MULTI_DELTA_EXPLANATION"), "Expected multi-delta ledger highlight marker");
  assert(dashboardSource.includes("MULTI_LEDGER_REFERENCES"), "Expected multi-ledger delta highlight marker");
  assert(dashboardSource.includes("UNEXPLAINED DELTA"), "Expected unexplained delta marker");
  assert(dashboardSource.includes("Copy Turn Repro Block"), "Expected copy turn repro block control");
  assert(dashboardSource.includes("Error/Anomaly Spotlight"), "Expected anomaly spotlight panel");
  assert(dashboardSource.includes("Known Good Example Bundle Fixture Viewer"), "Expected fixture viewer section");
  assert(dashboardSource.includes("Load fixture"), "Expected fixture load control");
  assert(dashboardSource.includes("Copy section {section.label}"), "Expected runbook section copy control");
  assert(dashboardSource.includes("Copy stable share block v2"), 'Expected stable share block v2 control');
  const expectedShareOrder = [
    "SUPPORT_BUNDLE_ID:",
    "ENGINE_VERSION:",
    "SCENARIO_HASH:",
    "TURN:",
  ];
  for (const label of expectedShareOrder) {
    assert(shareBlockSource.includes(label), `Expected stable share label: ${label}`);
  }
  const idx = expectedShareOrder.map((label) => shareBlockSource.indexOf(label));
  assert(idx[0] < idx[1] && idx[1] < idx[2] && idx[2] < idx[3], "Expected stable share block ordering");
  const expectedTurnReproHeaders = [
    "### Turn Repro Block",
    "Bundle ID:",
    "Turn Index:",
    "Engine Version:",
    "Scenario Hash:",
    "Adventure ID:",
    "Latest Turn Index:",
    "State Deltas:",
    "Ledger Entries:",
  ];
  for (const header of expectedTurnReproHeaders) {
    assert(turnReproSource.includes(header), `Expected turn repro header: ${header}`);
  }
  const turnHeaderIndexes = expectedTurnReproHeaders.map((label) => turnReproSource.indexOf(label));
  for (let i = 0; i < turnHeaderIndexes.length - 1; i++) {
    assert(turnHeaderIndexes[i] < turnHeaderIndexes[i + 1], "Expected fixed turn repro header ordering");
  }
  assert(dashboardSource.includes("Runbook Cross-Check Widget"), 'Expected runbook cross-check widget');
  assert(
    dashboardSource.includes("Bundle Size + Field Count Inspector"),
    'Expected bundle size and field count inspector',
  );
  assert(dashboardSource.includes("Replay Readiness"), "Expected replay readiness section");
  assert(dashboardSource.includes("Replay-Ready:"), "Expected replay-ready badge text");
  assert(dashboardSource.includes("Turn sequence integrity:"), "Expected turn sequence integrity signal");
  assert(dashboardSource.includes("FINAL_STATE_HASH:"), "Expected final state hash label");
  assert(dashboardSource.includes("Copy final state hash"), "Expected final state hash copy control");
  assert(dashboardSource.includes("STYLE STABILITY"), "Expected style stability section");
  assert(dashboardSource.includes("Tone:"), "Expected style stability tone row");
  assert(dashboardSource.includes("Genre:"), "Expected style stability genre row");
  assert(dashboardSource.includes("Pacing:"), "Expected style stability pacing row");
  assert(dashboardSource.includes("Drift Count:"), "Expected style stability drift count row");
  assert(dashboardSource.includes("DIFFICULTY"), "Expected difficulty section");
  assert(dashboardSource.includes("Momentum:"), "Expected difficulty momentum row");
  assert(dashboardSource.includes("Tier:"), "Expected difficulty tier row");
  assert(dashboardSource.includes("Momentum sparkline:"), "Expected difficulty momentum sparkline row");
  assert(dashboardSource.includes("Replay Telemetry (Derived)"), "Expected derived telemetry panel");
  assert(dashboardSource.includes("TELEMETRY_VERSION"), "Expected telemetry version marker in UI panel");
  assert(dashboardSource.includes("TELEMETRY"), "Expected telemetry marker in UI panel");
  assert(dashboardSource.includes("TURN_COUNT:"), "Expected TURN_COUNT telemetry label in UI panel");
  assert(dashboardSource.includes("TOTAL_LEDGER_ENTRIES:"), "Expected TOTAL_LEDGER_ENTRIES telemetry label");
  assert(dashboardSource.includes("TOTAL_STATE_DELTAS:"), "Expected TOTAL_STATE_DELTAS telemetry label");
  assert(dashboardSource.includes("MAX_DELTA_PER_TURN:"), "Expected MAX_DELTA_PER_TURN telemetry label");
  assert(dashboardSource.includes("AVG_DELTA_PER_TURN:"), "Expected AVG_DELTA_PER_TURN telemetry label");
  assert(dashboardSource.includes("MAX_LEDGER_PER_TURN:"), "Expected MAX_LEDGER_PER_TURN telemetry label");
  assert(dashboardSource.includes("TELEMETRY DRIFT DETECTED"), "Expected telemetry drift warning signal");
  assert(dashboardSource.includes("TURN_INDEX"), "Expected per-turn telemetry TURN_INDEX header");
  assert(dashboardSource.includes("DELTA_COUNT"), "Expected per-turn telemetry DELTA_COUNT header");
  assert(dashboardSource.includes("LEDGER_COUNT"), "Expected per-turn telemetry LEDGER_COUNT header");
  assert(dashboardSource.includes("HAS_RESOLUTION"), "Expected per-turn telemetry HAS_RESOLUTION header");
  assert(dashboardSource.includes("FAIL_FORWARD_SIGNAL"), "Expected per-turn telemetry FAIL_FORWARD_SIGNAL header");
  assert(dashboardSource.includes("RISK_LEVEL"), "Expected per-turn telemetry RISK_LEVEL header");
  assert(dashboardSource.includes("COST_TYPES"), "Expected per-turn telemetry COST_TYPES header");
  assert(dashboardSource.includes("ESCALATION"), "Expected per-turn telemetry ESCALATION header");
  assert(dashboardSource.includes("explainConsequence"), "Expected deterministic stakes reason derivation");
  assert(
    dashboardSource.includes('row.stakesReason.join("\\n")'),
    "Expected deterministic stakes reason tooltip lines in per-turn telemetry",
  );
  assert(dashboardSource.includes('row.riskLevel === "HIGH"'), "Expected high-risk row highlighting logic");
  assert(dashboardSource.includes("FIRST_DRIFT_TURN_INDEX:"), "Expected first-drift turn index signal");
  assert(dashboardSource.includes("FIRST_DRIFT_METRIC:"), "Expected first-drift metric signal");
  assert(dashboardSource.includes("DRIFT_SEVERITY:"), "Expected drift severity signal");
  assert(dashboardSource.includes("HASH_DRIFT"), "Expected drift severity taxonomy");
  assert(dashboardSource.includes("STRUCTURAL_DRIFT"), "Expected drift severity taxonomy");
  assert(dashboardSource.includes("PER_TURN_DRIFT"), "Expected drift severity taxonomy");
  assert(dashboardSource.includes("PER_TURN_TELEMETRY"), "Expected per-turn telemetry marker");
  assert(dashboardSource.includes("Copy Drift Report"), "Expected copy drift report control");
  assert(dashboardSource.includes("Canonical Manifest (V1)"), "Expected canonical manifest panel");
  assert(dashboardSource.includes("Manifest version:"), "Expected manifest version field");
  assert(dashboardSource.includes("Replay telemetryVersion:"), "Expected manifest replay telemetry version field");
  assert(dashboardSource.includes("Manifest hash:"), "Expected manifest hash field");
  assert(dashboardSource.includes("Per-turn rows:"), "Expected manifest per-turn row count field");
  assert(dashboardSource.includes("Copy Manifest JSON"), "Expected copy manifest json control");
  assert(dashboardSource.includes("Export Support Package"), "Expected export support package helper block");
  assert(dashboardSource.includes("Support package version:"), "Expected support package version helper line");
  assert(
    dashboardSource.includes("scripts/build-support-package.ts"),
    "Expected build-support-package CLI guidance",
  );
  assert(dashboardSource.includes("Import Support Package"), "Expected import support package panel");
  assert(dashboardSource.includes("Load .support.json file"), "Expected support package file load control");
  assert(dashboardSource.includes("Deterministic Empty States"), "Expected deterministic empty states section");
  assert(dashboardSource.includes("NO SUPPORT PACKAGE LOADED"), "Expected deterministic no-package empty state");
  assert(dashboardSource.includes("NO BUNDLE LOADED"), "Expected deterministic no-bundle empty state");
  assert(dashboardSource.includes("NO DIFF COMPARISON LOADED"), "Expected deterministic no-diff empty state");
  assert(dashboardSource.includes("What To Do Next"), 'Expected "What To Do Next" context strip');
  assert(dashboardSource.includes("Resolve integrity before proceeding."), "Expected integrity guidance text");
  assert(dashboardSource.includes("Inspect first drift turn."), "Expected drift guidance text");
  assert(dashboardSource.includes("Safe to generate issue draft."), "Expected green guidance text");
  assert(dashboardSource.includes("Copy all critical anchors"), "Expected copy critical anchors control");
  assert(dashboardSource.includes("MANIFEST_HASH:"), "Expected critical anchor manifest hash line");
  assert(dashboardSource.includes("PACKAGE_HASH:"), "Expected critical anchor package hash line");
  assert(dashboardSource.includes("FINAL_STATE_HASH:"), "Expected critical anchor final state hash line");
  assert(dashboardSource.includes("DRIFT_SEVERITY:"), "Expected critical anchor drift severity line");
  assert(dashboardSource.includes("Deterministic Error Surface"), "Expected deterministic error surface panel");
  assert(dashboardSource.includes("INTEGRITY FAILURE"), "Expected integrity failure label");
  assert(dashboardSource.includes("PACKAGE TAMPER DETECTED"), "Expected package tamper label");
  assert(dashboardSource.includes("INTAKE CONSISTENCY FAILURE"), "Expected intake consistency label");
  assert(dashboardSource.includes("DRIFT PARITY MISMATCH"), "Expected drift parity mismatch label");
  assert(
    dashboardSource.includes("Keyboard shortcuts: Ctrl + Shift + C (Copy Issue Draft), Ctrl + Shift + H (Copy Hash Anchors)"),
    "Expected deterministic keyboard shortcut hint text",
  );
  assert(dashboardSource.includes("Advanced Diagnostics"), "Expected advanced diagnostics panel");
  assert(dashboardSource.includes("Show advanced diagnostics"), "Expected advanced diagnostics toggle summary");
  assert(dashboardSource.includes("Per-turn telemetry"), "Expected per-turn telemetry diagnostics block");
  assert(dashboardSource.includes("Drift details"), "Expected drift details diagnostics block");
  assert(dashboardSource.includes("Raw manifest"), "Expected raw manifest diagnostics block");
  assert(dashboardSource.includes("Raw package JSON"), "Expected raw package diagnostics block");
  assert(dashboardSource.includes("Deterministic Badge Legend"), "Expected deterministic badge legend");
  assert(dashboardSource.includes("GREEN = verified"), "Expected badge legend green label");
  assert(dashboardSource.includes("YELLOW = warning"), "Expected badge legend yellow label");
  assert(dashboardSource.includes("RED = blocking failure"), "Expected badge legend red label");
  assert(dashboardSource.includes("Clear Diff Comparison"), "Expected clear diff comparison control");
  assert(dashboardSource.includes("Operator Confirmation Footer"), "Expected operator confirmation footer");
  assert(dashboardSource.includes("DETERMINISTIC VALIDATION COMPLETE"), "Expected deterministic validation complete footer text");
  assert(dashboardSource.includes("VALIDATION INCOMPLETE"), "Expected validation incomplete footer text");
  assert(dashboardSource.includes("normalizeCopyBlock"), "Expected copy block formatting guard helper");
  assert(dashboardSource.includes("Manifest Integrity Badge"), "Expected manifest integrity badge section");
  assert(dashboardSource.includes("GREEN: All true"), "Expected manifest integrity green text");
  assert(dashboardSource.includes("RED: Any false"), "Expected manifest integrity red text");
  assert(dashboardSource.includes("Structured Incident Checklist"), "Expected structured checklist section");
  assert(dashboardSource.includes("Manifest integrity verified"), "Expected checklist row: manifest integrity verified");
  assert(dashboardSource.includes("Replay telemetry consistent"), "Expected checklist row: replay telemetry consistent");
  assert(dashboardSource.includes("Drift severity reviewed"), "Expected checklist row: drift severity reviewed");
  assert(dashboardSource.includes("First drift turn inspected"), "Expected checklist row: first drift turn inspected");
  assert(dashboardSource.includes("Repro CLI validated"), "Expected checklist row: repro cli validated");
  assert(dashboardSource.includes("Package hash verified"), "Expected checklist row: package hash verified");
  assert(
    dashboardSource.includes("Deterministic Issue Draft Generator (Package-aware)"),
    "Expected package-aware issue draft section",
  );
  assert(dashboardSource.includes("### Support Package"), "Expected issue draft header: Support Package");
  assert(dashboardSource.includes("### Drift Severity:"), "Expected issue draft header: Drift Severity");
  assert(dashboardSource.includes("### First Drift:"), "Expected issue draft header: First Drift");
  assert(dashboardSource.includes("### Replay Invariants:"), "Expected issue draft header: Replay Invariants");
  assert(dashboardSource.includes("PACKAGE_VERSION:"), "Expected package summary package version line");
  assert(dashboardSource.includes("MANIFEST_HASH:"), "Expected package summary manifest hash line");
  assert(
    dashboardSource.includes("Unsupported Support Package Version"),
    "Expected strict support package version gate warning",
  );
  assert(dashboardSource.includes("Manifest Version Gate Warning"), "Expected manifest version gate warning panel");
  assert(dashboardSource.includes("Copy manifest version warning"), "Expected copy control for manifest warning block");
  assert(dashboardSource.includes("Immutable Hash Anchor Display"), "Expected immutable hash anchor panel");
  assert(dashboardSource.includes("MANIFEST_HASH_FULL:"), "Expected full manifest hash anchor line");
  assert(dashboardSource.includes("PACKAGE_HASH_FULL:"), "Expected full package hash anchor line");
  assert(dashboardSource.includes("Copy full manifest hash"), "Expected full manifest hash copy control");
  assert(dashboardSource.includes("Copy full package hash"), "Expected full package hash copy control");
  assert(dashboardSource.includes("Intake Consistency Self-Test"), "Expected intake consistency self-test panel");
  assert(dashboardSource.includes("INTAKE CONSISTENCY FAILURE"), "Expected intake consistency failure signal");

  const lowerDashboard = dashboardSource.toLowerCase();
  const entropyTokens = ["timestamp", "duration:", "durationms", "seconds", "date.now", "performance.now", "random", "seed"];
  for (const token of entropyTokens) {
    assert(!lowerDashboard.includes(token), `Expected intake UI to avoid entropy token: ${token}`);
  }

  const copyBlocks = [
    buildDeterministicReproCliText({
      bundleId: "bundle-1",
      engineVersion: "engine-1",
      scenarioContentHash: "hash-1",
    }),
    buildSupportShareBlockText({
      bundleId: "bundle-1",
      engineVersion: "engine-1",
      scenarioContentHash: "hash-1",
      turn: "3",
    }),
    buildSupportTurnReproBlockText({
      bundleId: "bundle-1",
      turnIndex: "3",
      engineVersion: "engine-1",
      scenarioContentHash: "hash-1",
      adventureId: "adv-1",
      latestTurnIndex: "3",
      stateDeltas: [{ path: "stats.hp", before: 3, after: 4 }],
      ledgerAdds: [{ kind: "test", message: "ok" }],
    }),
    buildSupportCriticalAnchorsText({
      manifestHash: "mhash",
      packageHash: "phash",
      finalStateHash: "fhash",
      driftSeverity: "NONE",
    }),
  ];

  for (const block of copyBlocks) {
    assert(block.endsWith("\n") === false, "Expected deterministic copy block with no trailing newline");
  }

  console.log("UI SUPPORT PAGE OK");
}

main();
