import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  assert(out.includes("TELEMETRY_VERSION 1"), "expected TELEMETRY_VERSION marker");
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
      `--bundle-json=${JSON.stringify(bundle)}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(withJson.status, 0, `replay script (--telemetry-json) failed: ${withJson.stderr || withJson.stdout}`);
  const outJson = withJson.stdout ?? "";
  assert(outJson.includes("TELEMETRY_JSON "), "expected TELEMETRY_JSON output when flag is present");
  const telemetryJsonLine =
    outJson.split(/\r?\n/).find((line) => line.startsWith("TELEMETRY_JSON ")) ?? "";
  assert(telemetryJsonLine.length > 0, "expected TELEMETRY_JSON line");
  assert(
    !/timestamp|duration|token|random|seed|Date\.now|performance\.now/i.test(telemetryJsonLine),
    "telemetry JSON should not include timing/entropy fields",
  );

  console.log("REPLAY FROM BUNDLE OK");
}

main();
