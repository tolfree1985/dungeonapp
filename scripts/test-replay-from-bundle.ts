import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

function main() {
  const scriptPath = path.join(process.cwd(), "scripts", "replay-from-bundle.ts");
  const bundle = {
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
  assert(out.includes("TELEMETRY"), "expected TELEMETRY marker");
  assert(out.includes("TURN_COUNT:"), "expected TURN_COUNT telemetry field");
  assert(out.includes("TOTAL_LEDGER_ENTRIES:"), "expected TOTAL_LEDGER_ENTRIES telemetry field");
  assert(out.includes("TOTAL_STATE_DELTAS:"), "expected TOTAL_STATE_DELTAS telemetry field");
  assert(out.includes("MAX_DELTA_PER_TURN:"), "expected MAX_DELTA_PER_TURN telemetry field");
  assert(out.includes("AVG_DELTA_PER_TURN:"), "expected AVG_DELTA_PER_TURN telemetry field");
  assert(out.includes("MAX_LEDGER_PER_TURN:"), "expected MAX_LEDGER_PER_TURN telemetry field");
  assert(out.includes("FINAL_STATE_HASH:"), "expected telemetry FINAL_STATE_HASH field");

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

  console.log("REPLAY FROM BUNDLE OK");
}

main();
