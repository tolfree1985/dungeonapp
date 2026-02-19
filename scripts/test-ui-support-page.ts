import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const pagePath = path.join(process.cwd(), "src", "app", "support", "page.tsx");
  const dashboardPath = path.join(process.cwd(), "src", "components", "SupportDashboard.tsx");

  const pageSource = fs.readFileSync(pagePath, "utf8");
  const dashboardSource = fs.readFileSync(dashboardPath, "utf8");

  assert(pageSource.includes("SupportDashboard"), "Expected support page to render SupportDashboard");
  assert(pageSource.includes("supportEnabled"), "Expected dev/admin support guard");

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

  console.log("UI SUPPORT PAGE OK");
}

main();
