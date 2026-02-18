import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsequencesDrawer } from "../src/components/ConsequencesDrawer";

function main() {
  const longText = "x".repeat(220);
  const html = renderToStaticMarkup(
    React.createElement(ConsequencesDrawer, {
      stateDeltas: [
        { op: "set", path: "/flags/alpha", before: false, after: true },
        { op: "set", path: "/flags/bravo", before: false, after: true },
      ],
      ledgerAdds: [{ type: "clue", summary: `Found key under mat. ${longText}` }],
    })
  );

  assert(html.includes("STATE DELTAS"), "missing STATE DELTAS heading");
  assert(html.includes("CAUSAL LEDGER"), "missing CAUSAL LEDGER heading");
  assert(html.includes("/flags/alpha"), "missing expected first state delta");
  assert(html.includes("/flags/bravo"), "missing expected second state delta");
  assert(
    html.indexOf("/flags/alpha") < html.indexOf("/flags/bravo"),
    "state delta order was not preserved",
  );
  assert(html.includes("Found key under mat."), "missing expected ledger snippet");
  assert(html.includes("…(truncated)"), "missing truncation marker");

  console.log("UI CONSEQUENCES DRAWER OK");
}

main();
