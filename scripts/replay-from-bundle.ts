import fs from "node:fs";
import { buildSupportManifestFromBundle, serializeSupportManifest } from "../src/lib/support/supportManifest";

function stableStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry) => normalize(entry));
    }
    if (input && typeof input === "object") {
      const src = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const keys = Object.keys(src).sort();
      for (const key of keys) {
        out[key] = normalize(src[key]);
      }
      return out;
    }
    return input;
  };

  return JSON.stringify(normalize(value));
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq < 0) {
      out[arg.slice(2)] = "true";
      continue;
    }
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function readBundle(args: Record<string, string>): any {
  const jsonArg = args["bundle-json"];
  const pathArg = args["bundle-path"];

  if (jsonArg) {
    return JSON.parse(jsonArg);
  }

  if (pathArg) {
    return JSON.parse(fs.readFileSync(pathArg, "utf8"));
  }

  throw new Error("Missing --bundle-path or --bundle-json");
}

function isSeqContiguous(turnIndexes: number[]): boolean {
  if (turnIndexes.length === 0) return false;
  const start = turnIndexes[0];
  for (let i = 0; i < turnIndexes.length; i++) {
    if (turnIndexes[i] !== start + i) return false;
  }
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = readBundle(args);
  const turnLimitArg = args.turn;
  const turnLimit = turnLimitArg && /^-?\d+$/.test(turnLimitArg) ? Number(turnLimitArg) : undefined;

  const manifest = await buildSupportManifestFromBundle(bundle, { turnLimit });
  if (manifest.replay.turnCount === 0) {
    throw new Error("No replayable turns/events in bundle");
  }

  const bundleId = args["bundle-id"] ?? "(none)";
  const perTurn = [...manifest.perTurn].sort((a, b) => a.turnIndex - b.turnIndex);
  const contiguous = isSeqContiguous(perTurn.map((row) => row.turnIndex));
  const ledgerCount = manifest.telemetry.totalLedgerEntries;
  const deltaCount = manifest.telemetry.totalStateDeltas;

  console.log(`BUNDLE_ID ${bundleId}`);
  console.log(`TURNS ${manifest.replay.turnCount}`);
  console.log(`INVARIANT_SEQ_CONTIGUOUS ${contiguous ? "PASS" : "FAIL"}`);
  console.log(`INVARIANT_LEDGER_COUNT ${ledgerCount}`);
  console.log(`INVARIANT_DELTA_COUNT ${deltaCount}`);
  console.log(`FINAL_STATE_HASH ${manifest.replay.finalStateHash}`);
  console.log("REPLAY COMPLETE");
  console.log(`TELEMETRY_VERSION ${manifest.replay.telemetryVersion}`);
  console.log("TELEMETRY");
  console.log(`TURN_COUNT: ${manifest.replay.turnCount}`);
  console.log(`TOTAL_LEDGER_ENTRIES: ${manifest.telemetry.totalLedgerEntries}`);
  console.log(`TOTAL_STATE_DELTAS: ${manifest.telemetry.totalStateDeltas}`);
  console.log(`MAX_DELTA_PER_TURN: ${manifest.telemetry.maxDeltaPerTurn}`);
  console.log(`AVG_DELTA_PER_TURN: ${manifest.telemetry.avgDeltaPerTurn}`);
  console.log(`MAX_LEDGER_PER_TURN: ${manifest.telemetry.maxLedgerPerTurn}`);
  console.log(`FINAL_STATE_HASH: ${manifest.replay.finalStateHash}`);
  console.log("PER_TURN_TELEMETRY");
  perTurn.forEach((row) => {
    console.log(
      `TURN_INDEX: ${row.turnIndex} DELTA_COUNT: ${row.deltaCount} LEDGER_COUNT: ${row.ledgerCount} HAS_RESOLUTION: ${row.hasResolution}`,
    );
  });
  if (args["telemetry-json"] === "true") {
    console.log(
      `TELEMETRY_JSON ${stableStringify({
        telemetryVersion: manifest.replay.telemetryVersion,
        turnCount: manifest.replay.turnCount,
        totalLedgerEntries: manifest.telemetry.totalLedgerEntries,
        totalStateDeltas: manifest.telemetry.totalStateDeltas,
        maxDeltaPerTurn: manifest.telemetry.maxDeltaPerTurn,
        avgDeltaPerTurn: manifest.telemetry.avgDeltaPerTurn,
        maxLedgerPerTurn: manifest.telemetry.maxLedgerPerTurn,
        finalStateHash: manifest.replay.finalStateHash,
        perTurn,
      })}`,
    );
  }
  if (args["manifest-json"] === "true") {
    console.log(`SUPPORT_MANIFEST_JSON ${serializeSupportManifest(manifest)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
