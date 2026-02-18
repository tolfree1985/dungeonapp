import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsequencesDrawer } from "../src/components/ConsequencesDrawer";
import { ResolutionBadge } from "../src/components/ResolutionBadge";
import { buildConsequencesExplanationText } from "../src/lib/buildConsequencesExplanationText";
import { buildInspectorBundleCopyText } from "../src/lib/buildInspectorBundleCopyText";
import { buildLedgerGroupCopyText } from "../src/lib/buildLedgerGroupCopyText";
import { buildVisibleLedgerCopyText } from "../src/lib/buildVisibleLedgerCopyText";
import {
  buildTurnComparisonCopyText,
  buildTurnImpactSummaryCopyText,
} from "../src/lib/turnDiff/buildTurnDiffCopyText";

function main() {
  const longText = "x".repeat(220);
  const stateDeltas = [
    { op: "set", path: "/flags/alpha", before: false, after: true },
    { op: "set", path: "/flags/bravo", before: false, after: true },
  ] as const;
  const ledgerAdds = [
    {
      type: "clue",
      summary: `Found key under mat. ${longText}`,
      refEventId: "evt-1",
      outcome: "success",
    },
  ] as const;

  const html = renderToStaticMarkup(
    React.createElement(ConsequencesDrawer, {
      stateDeltas,
      ledgerAdds,
    })
  );
  const noOpHtml = renderToStaticMarkup(
    React.createElement(ConsequencesDrawer, {
      stateDeltas: [],
      ledgerAdds: [],
    }),
  );
  const highImpactDeltas = [
    { op: "set", path: "/flags/h0", before: false, after: true },
    { op: "set", path: "/flags/h1", before: false, after: true },
    { op: "set", path: "/flags/h2", before: false, after: true },
    { op: "set", path: "/flags/h3", before: false, after: true },
    { op: "set", path: "/flags/h4", before: false, after: true },
    { op: "set", path: "/flags/h5", before: false, after: true },
    { op: "set", path: "/flags/h6", before: false, after: true },
    { op: "set", path: "/flags/h7", before: false, after: true },
    { op: "set", path: "/flags/h8", before: false, after: true },
  ] as const;
  const highImpactHtml = renderToStaticMarkup(
    React.createElement(ConsequencesDrawer, {
      stateDeltas: highImpactDeltas,
      ledgerAdds,
    }),
  );
  const explanation = buildConsequencesExplanationText({
    stateDeltas,
    ledgerAdds,
    maxLen: 24,
  });
  const groupSummary = buildLedgerGroupCopyText(
    "Event: X",
    "ledger-group-X",
    [{ message: "m" }],
  );
  const visibleLedgerCollapsed = buildVisibleLedgerCopyText({
    filterKind: "",
    filterRuleId: "",
    pinnedFocus: false,
    basePath: "/scenarios",
    groups: [
      {
        title: "Event: X",
        anchorId: "ledger-group-X",
        state: "collapsed",
        entries: [{ message: "m", because: "b" }],
      },
    ],
  });
  const visibleLedgerPinned = buildVisibleLedgerCopyText({
    filterKind: "",
    filterRuleId: "",
    pinnedFocus: true,
    basePath: "/x?focus=1",
    groups: [
      {
        title: "Event: X",
        anchorId: "ledger-group-X",
        state: "expanded",
        entries: [{ message: "m", because: "b" }],
      },
    ],
  });
  const bundleOut = buildInspectorBundleCopyText({
    pinnedFocus: true,
    filterKind: "",
    filterRuleId: "",
    targetHash: "#ledger-group-X",
    basePath: "/x?focus=1",
    visibleGroups: [
      {
        title: "Event: X",
        anchorId: "ledger-group-X",
        state: "expanded",
        entries: [{ message: "m" }],
      },
    ],
    focusedGroup: {
      title: "Event: X",
      anchorId: "ledger-group-X",
      state: "expanded",
      entries: [{ message: "m" }],
    },
  });
  const resolutionBadgeHtml = renderToStaticMarkup(
    React.createElement(ResolutionBadge, { outcome: "mixed" }),
  );
  const impactSummary = buildTurnImpactSummaryCopyText({
    turnIndex: 2,
    impact: "Low",
    deltaCount: 2,
    ledgerCount: 1,
    added: ["inventory"],
    removed: ["status"],
    unchanged: ["health"],
  });
  const comparisonSummary = buildTurnComparisonCopyText({
    turnIndex: 2,
    added: ["inventory"],
    removed: ["status"],
    unchanged: ["health"],
  });
  const stableTurnId = "evt-123";
  const anchorId = `turn-${stableTurnId}-consequences`;
  const seeWhyHtml = renderToStaticMarkup(
    React.createElement(
      "section",
      null,
      React.createElement("a", { href: `#${anchorId}` }, "See why"),
      React.createElement(
        "div",
        { id: anchorId },
        React.createElement(ConsequencesDrawer, {
          stateDeltas,
          ledgerAdds,
          anchorId,
          detailsId: `details-turn-${stableTurnId}-consequences`,
        }),
      ),
    ),
  );

  assert(html.includes("STATE DELTAS"), "missing STATE DELTAS heading");
  assert(html.includes("CAUSAL LEDGER"), "missing CAUSAL LEDGER heading");
  assert(html.includes("Replay timeline"), 'Expected "Replay timeline" to be present');
  assert(html.includes("✓ Success"), "Expected at least one replay timeline item");
  assert(html.includes("Δ 2"), "missing delta count badge");
  assert(html.includes("⚡ 1"), "missing ledger count badge");
  assert(html.includes("/flags/alpha"), "missing expected first state delta");
  assert(html.includes("/flags/bravo"), "missing expected second state delta");
  assert(
    html.indexOf("/flags/alpha") < html.indexOf("/flags/bravo"),
    "state delta order was not preserved",
  );
  assert(html.includes("Found key under mat."), "missing expected ledger snippet");
  assert(html.includes("…(truncated)"), "missing truncation marker");
  assert(html.includes("Filter kind"), 'Expected "Filter kind" to be present');
  assert(html.includes("Filter ruleId"), 'Expected "Filter ruleId" to be present');
  assert(html.includes("Clear filters"), 'Expected "Clear filters" to be present');
  assert(html.includes("Expand all"), 'Expected "Expand all" to be present');
  assert(html.includes("Collapse all"), 'Expected "Collapse all" to be present');
  assert(html.includes("Focus mode:"), 'Expected "Focus mode:" to be present');
  assert(html.includes("Clear focus"), 'Expected "Clear focus" to be present');
  assert(
    html.includes("Ungrouped") || html.includes("Event:"),
    'Expected causal ledger group header ("Ungrouped" or "Event:") to be present',
  );
  assert(
    html.includes("Collapse") || html.includes("Expand"),
    'Expected ledger group toggle label ("Collapse" or "Expand") to be present',
  );
  assert(html.includes("Copy group link"), 'Expected "Copy group link" to be present');
  assert(html.includes("Copy group summary"), 'Expected "Copy group summary" to be present');
  assert(html.includes("Copy visible ledger"), 'Expected "Copy visible ledger" to be present');
  assert(html.includes("Copy focused view"), 'Expected "Copy focused view" to be present');
  assert(html.includes("Copy inspector bundle"), 'Expected "Copy inspector bundle" to be present');
  assert(html.includes("Turn diff"), 'Expected "Turn diff" to be present');
  assert(html.includes("Copy turn diff"), 'Expected "Copy turn diff" to be present');
  assert(html.includes("Copy all Turn Diff"), 'Expected "Copy all Turn Diff" to be present');
  assert(html.includes("Copy impact summary"), 'Expected "Copy impact summary" to be present');
  assert(html.includes("Copy previous turn keys"), 'Expected "Copy previous turn keys" to be present');
  assert(html.includes("Copy comparison"), 'Expected "Copy comparison" to be present');
  assert(html.includes("Copy turn link"), 'Expected "Copy turn link" to be present');
  assert(html.includes("No previous turn"), 'Expected "No previous turn" helper text to be present');
  assert(html.includes("Focused group: none"), 'Expected "Focused group: none" to be present');
  assert(html.includes("Clear delta filter"), 'Expected "Clear delta filter" to be present');
  assert(html.includes("id=\"turn-diff-panel\""), 'Expected turn diff panel id to be present');
  assert(html.includes("id=\"state-deltas-panel\""), 'Expected state deltas panel id to be present');
  assert(html.includes("id=\"replay-timeline-panel\""), 'Expected replay timeline panel id to be present');
  assert(html.includes("id=\"ledger-groups-panel\""), 'Expected ledger groups panel id to be present');
  assert(html.includes("aria-controls=\"ledger-groups-panel\""), 'Expected ledger control aria-controls linkage');
  assert(html.includes("aria-pressed="), "Expected at least one aria-pressed attribute");
  assert(html.includes("aria-disabled="), "Expected at least one aria-disabled attribute");
  assert(html.includes("Previous turn keys"), 'Expected "Previous turn keys" to be present');
  assert(
    html.includes("aria-describedby=\"turn-diff-status-region\""),
    'Expected Turn Diff controls to include aria-describedby="turn-diff-status-region"',
  );
  assert(
    html.includes("id=\"turn-diff-status-region\""),
    'Expected Turn Diff status region id to be present',
  );
  assert(html.includes("Added keys"), 'Expected "Added keys" to be present');
  assert(html.includes("Removed keys"), 'Expected "Removed keys" to be present');
  assert(html.includes("Unchanged keys"), 'Expected "Unchanged keys" to be present');
  assert(html.includes("Low-signal turn"), 'Expected "Low-signal turn" to be present');
  assert(noOpHtml.includes("No-op turn"), 'Expected "No-op turn" in no-op fixture');
  assert(noOpHtml.includes("No replay events"), 'Expected "No replay events" in no-op fixture');
  assert(noOpHtml.includes("Nothing to copy"), 'Expected "Nothing to copy" in no-op fixture');
  assert(!noOpHtml.includes("Low-signal turn"), 'Did not expect "Low-signal turn" in no-op fixture');
  assert(!noOpHtml.includes("High-impact turn"), 'Did not expect "High-impact turn" in no-op fixture');
  assert(highImpactHtml.includes("High-impact turn"), 'Expected "High-impact turn" in high-impact fixture');
  assert(!highImpactHtml.includes("No-op turn"), 'Did not expect "No-op turn" in high-impact fixture');
  assert(!highImpactHtml.includes("Low-signal turn"), 'Did not expect "Low-signal turn" in high-impact fixture');
  assert(html.includes("ledger-group-"), 'Expected timeline/group anchor signal ("ledger-group-") to be present');
  assert(html.includes("ledger-"), 'Expected at least one ledger anchor id ("ledger-") to be present');
  assert(html.includes("Copy entry"), 'Expected "Copy entry" to be present');
  assert(html.includes("Copy link"), 'Expected "Copy link" to be present');
  assert(html.includes(">Details<"), "missing Details expander label");
  assert(html.includes("<summary"), "missing summary element");
  assert(explanation.includes("State Deltas ("), "missing explanation state deltas section");
  assert(explanation.includes("Causal Ledger ("), "missing explanation causal ledger section");
  assert(
    groupSummary.includes("Anchor: #ledger-group-X"),
    "missing group summary anchor line",
  );
  assert(
    visibleLedgerCollapsed.includes("State: collapsed"),
    "Expected collapsed state line",
  );
  assert(
    !visibleLedgerCollapsed.includes("raw:"),
    "Collapsed group should not include entries",
  );
  assert(
    visibleLedgerPinned.includes("PinnedFocus: true"),
    "Expected pinned focus signal in visible ledger export",
  );
  assert(
    visibleLedgerPinned.includes("?focus=1#ledger-group-"),
    "Expected focus query preserved in visible ledger anchor",
  );
  for (const s of ["Inspector bundle", "==== Focused view ====", "==== Visible ledger ===="]) {
    if (!bundleOut.includes(s)) {
      throw new Error(`Expected bundle output to include: ${s}`);
    }
  }
  assert(
    explanation.indexOf("/flags/alpha") < explanation.indexOf("/flags/bravo"),
    "explanation delta order was not preserved",
  );
  assert(explanation.includes("…(truncated)"), "missing explanation truncation marker");
  assert(
    impactSummary.includes("Turn impact summary (turn 2)"),
    "missing impact summary header",
  );
  assert(impactSummary.includes("Impact: Low"), "missing impact summary impact line");
  assert(impactSummary.includes("Added: inventory"), "missing impact summary added line");
  assert(
    comparisonSummary.includes("Turn comparison (turn 2)"),
    "missing comparison summary header",
  );
  assert(
    comparisonSummary.includes("Compared to previous turn"),
    "missing comparison summary comparison line",
  );
  assert(
    comparisonSummary.includes("Removed: status"),
    "missing comparison summary removed line",
  );
  assert(resolutionBadgeHtml.includes("⚠ Success w/ cost"), "missing resolution badge text");
  assert(seeWhyHtml.includes("See why"), "missing See why text");
  assert(
    seeWhyHtml.includes(`href=\"#${anchorId}\"`),
    "missing See why href to consequences anchor",
  );
  assert(
    seeWhyHtml.includes(`id=\"${anchorId}\"`),
    "missing matching consequences drawer container id",
  );

  const drawerPath = path.join(
    process.cwd(),
    "src",
    "components",
    "ConsequencesDrawer.tsx",
  );
  const drawerSource = fs.readFileSync(drawerPath, "utf8");
  const mustInclude = [
    "hashchange",
    "ledger-highlight",
    "addEventListener(\"hashchange\"",
    "URLSearchParams",
    "sp.set(\"focus\", \"1\")",
    "get(\"focus\") === \"1\"",
  ];
  for (const signal of mustInclude) {
    if (!drawerSource.includes(signal)) {
      throw new Error(
        `Expected ConsequencesDrawer.tsx to include "${signal}" (hash-reactive highlight signal)`,
      );
    }
  }

  console.log("UI CONSEQUENCES DRAWER OK");
}

main();
