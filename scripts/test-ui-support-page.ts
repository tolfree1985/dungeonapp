import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

  console.log("UI SUPPORT PAGE OK");
}

main();
