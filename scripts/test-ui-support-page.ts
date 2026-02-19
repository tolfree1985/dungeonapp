import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const pagePath = path.join(process.cwd(), "src", "app", "support", "page.tsx");
  const dashboardPath = path.join(process.cwd(), "src", "components", "SupportDashboard.tsx");
  const reproCliPath = path.join(process.cwd(), "src", "lib", "support", "buildDeterministicReproCliText.ts");
  const shareBlockPath = path.join(process.cwd(), "src", "lib", "support", "buildSupportShareBlockText.ts");

  const pageSource = fs.readFileSync(pagePath, "utf8");
  const dashboardSource = fs.readFileSync(dashboardPath, "utf8");
  const reproCliSource = fs.readFileSync(reproCliPath, "utf8");
  const shareBlockSource = fs.readFileSync(shareBlockPath, "utf8");

  assert(pageSource.includes("SupportDashboard"), "Expected support page to render SupportDashboard");
  assert(pageSource.includes("supportEnabled"), "Expected dev/admin support guard");
  assert(pageSource.includes("runbookSectionChecks"), "Expected runbook cross-check data wiring");

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
  assert(dashboardSource.includes("Copy deterministic repro CLI block"), 'Expected repro CLI copy control');
  assert(reproCliSource.includes("scripts/replay-from-bundle.ts"), 'Expected deterministic replay CLI contract text');
  assert(dashboardSource.includes("Structured Timeline Viewer"), 'Expected timeline viewer section');
  assert(dashboardSource.includes("Minimal Repro Mode"), 'Expected minimal repro mode toggle');
  assert(dashboardSource.includes("inventory"), 'Expected consequence delta highlighter signal');
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
  assert(dashboardSource.includes("Runbook Cross-Check Widget"), 'Expected runbook cross-check widget');
  assert(
    dashboardSource.includes("Bundle Size + Field Count Inspector"),
    'Expected bundle size and field count inspector',
  );

  console.log("UI SUPPORT PAGE OK");
}

main();
