import fs from "node:fs";
import crypto from "node:crypto";
import { replayStateFromTurnJson } from "../src/lib/game/replay";

type ReplayEvent = { seq: number; turnJson: any };
type PerTurnTelemetryRow = {
  turnIndex: number;
  deltaCount: number;
  ledgerCount: number;
  hasResolution: boolean;
};
type ReplayTelemetry = {
  turnCount: number;
  totalLedgerEntries: number;
  totalStateDeltaCount: number;
  maxDeltaPerTurn: number;
  avgDeltaPerTurn: number;
  maxLedgerPerTurn: number;
  finalStateHash: string;
  perTurn: PerTurnTelemetryRow[];
};

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

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
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

function asSeq(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

function toTurnJson(source: any): any {
  const direct = source?.turnJson;
  if (direct && typeof direct === "object") {
    const deltas = Array.isArray(direct.deltas)
      ? direct.deltas
      : Array.isArray(source?.deltas)
        ? source.deltas
        : Array.isArray(source?.stateDeltas)
          ? source.stateDeltas
          : [];
    return { ...direct, deltas, resolution: direct?.resolution ?? source?.resolution };
  }

  const deltas = Array.isArray(source?.deltas)
    ? source.deltas
    : Array.isArray(source?.stateDeltas)
      ? source.stateDeltas
      : [];

  return {
    deltas,
    ledgerAdds: Array.isArray(source?.ledgerAdds) ? source.ledgerAdds : [],
    resolution: source?.resolution,
  };
}

function extractEvents(bundle: any): ReplayEvent[] {
  const rawEvents = Array.isArray(bundle?.events)
    ? bundle.events
    : Array.isArray(bundle?.turns)
      ? bundle.turns
      : [];

  const events = rawEvents.map((raw: any, index: number) => {
    const seq = asSeq(raw?.seq ?? raw?.turnIndex, index);
    const turnJson = toTurnJson(raw);
    return { seq, turnJson };
  });

  events.sort((a, b) => a.seq - b.seq);
  return events;
}

function isSeqContiguous(events: ReplayEvent[]): boolean {
  if (events.length === 0) return false;
  const start = events[0].seq;
  for (let i = 0; i < events.length; i++) {
    if (events[i].seq !== start + i) return false;
  }
  return true;
}

function sumLedgerAdds(events: ReplayEvent[]): number {
  return events.reduce((sum, event) => {
    const count = Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0;
    return sum + count;
  }, 0);
}

function sumDeltas(events: ReplayEvent[]): number {
  return events.reduce((sum, event) => {
    const count = Array.isArray(event?.turnJson?.deltas) ? event.turnJson.deltas.length : 0;
    return sum + count;
  }, 0);
}

function maxDeltasPerTurn(events: ReplayEvent[]): number {
  return events.reduce((max, event) => {
    const count = Array.isArray(event?.turnJson?.deltas) ? event.turnJson.deltas.length : 0;
    return count > max ? count : max;
  }, 0);
}

function maxLedgerEntriesPerTurn(events: ReplayEvent[]): number {
  return events.reduce((max, event) => {
    const count = Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0;
    return count > max ? count : max;
  }, 0);
}

function deriveTelemetry(events: ReplayEvent[], finalStateHash: string): ReplayTelemetry {
  const turnCount = events.length;
  const totalLedgerEntries = sumLedgerAdds(events);
  const totalStateDeltaCount = sumDeltas(events);
  const maxDeltaPerTurn = maxDeltasPerTurn(events);
  const maxLedgerPerTurn = maxLedgerEntriesPerTurn(events);
  const avgDeltaPerTurn = Number((totalStateDeltaCount / Math.max(turnCount, 1)).toFixed(6));
  const perTurn = events.map((event) => {
    const deltaCount = Array.isArray(event?.turnJson?.deltas) ? event.turnJson.deltas.length : 0;
    const ledgerCount = Array.isArray(event?.turnJson?.ledgerAdds) ? event.turnJson.ledgerAdds.length : 0;
    const hasResolution = event?.turnJson?.resolution !== undefined && event?.turnJson?.resolution !== null;
    return {
      turnIndex: event.seq,
      deltaCount,
      ledgerCount,
      hasResolution,
    };
  });

  return {
    turnCount,
    totalLedgerEntries,
    totalStateDeltaCount,
    maxDeltaPerTurn,
    avgDeltaPerTurn,
    maxLedgerPerTurn,
    finalStateHash,
    perTurn,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = readBundle(args);

  let events = extractEvents(bundle);
  const turnLimitArg = args.turn;
  if (turnLimitArg && /^-?\d+$/.test(turnLimitArg)) {
    const turnLimit = Number(turnLimitArg);
    events = events.filter((event) => event.seq <= turnLimit);
  }

  if (events.length === 0) {
    throw new Error("No replayable turns/events in bundle");
  }

  const state = replayStateFromTurnJson(events);
  const finalStateHash = sha256Hex(stableStringify(state));
  const telemetry = deriveTelemetry(events, finalStateHash);

  const bundleId = args["bundle-id"] ?? "(none)";
  const contiguous = isSeqContiguous(events);
  const ledgerCount = sumLedgerAdds(events);
  const deltaCount = sumDeltas(events);

  console.log(`BUNDLE_ID ${bundleId}`);
  console.log(`TURNS ${events.length}`);
  console.log(`INVARIANT_SEQ_CONTIGUOUS ${contiguous ? "PASS" : "FAIL"}`);
  console.log(`INVARIANT_LEDGER_COUNT ${ledgerCount}`);
  console.log(`INVARIANT_DELTA_COUNT ${deltaCount}`);
  console.log(`FINAL_STATE_HASH ${finalStateHash}`);
  console.log("REPLAY COMPLETE");
  console.log("TELEMETRY");
  console.log(`TURN_COUNT: ${telemetry.turnCount}`);
  console.log(`TOTAL_LEDGER_ENTRIES: ${telemetry.totalLedgerEntries}`);
  console.log(`TOTAL_STATE_DELTAS: ${telemetry.totalStateDeltaCount}`);
  console.log(`MAX_DELTA_PER_TURN: ${telemetry.maxDeltaPerTurn}`);
  console.log(`AVG_DELTA_PER_TURN: ${telemetry.avgDeltaPerTurn}`);
  console.log(`MAX_LEDGER_PER_TURN: ${telemetry.maxLedgerPerTurn}`);
  console.log(`FINAL_STATE_HASH: ${telemetry.finalStateHash}`);
  console.log("PER_TURN_TELEMETRY");
  telemetry.perTurn.forEach((row) => {
    console.log(
      `TURN_INDEX: ${row.turnIndex} DELTA_COUNT: ${row.deltaCount} LEDGER_COUNT: ${row.ledgerCount} HAS_RESOLUTION: ${row.hasResolution}`,
    );
  });
  if (args["telemetry-json"] === "true") {
    console.log(`TELEMETRY_JSON ${stableStringify(telemetry)}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
