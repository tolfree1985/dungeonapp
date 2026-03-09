import fs from "node:fs";
import crypto from "node:crypto";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  buildSupportManifestFromBundle,
  hashSupportManifest,
  serializeSupportManifest,
} from "../src/lib/support/supportManifest";
import { SUPPORT_PACKAGE_VERSION, type DriftSeverity, type SupportPackageV1 } from "../src/lib/support/supportPackage";
import {
  deriveCapSnapshot,
  explainCapReason,
  classifyConsequence,
  classifyFailForwardSignal,
  replayStateFromTurnJsonWithGuardSummary,
  type ConsequenceSummary,
} from "../src/lib/game/replay";
import { deriveSessionMetrics, serializeSessionMetrics } from "../src/lib/support/sessionMetrics";

type ReplaySupportPackage = Omit<SupportPackageV1, "drift"> & {
  drift?: SupportPackageV1["drift"];
};
type ReplayEvent = { seq: number; turnJson: any };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function extractEvents(bundle: unknown, turnLimit?: number): ReplayEvent[] {
  const root = isRecord(bundle) ? bundle : {};
  const rawEvents = Array.isArray(root.events) ? root.events : Array.isArray(root.turns) ? root.turns : [];
  const mapped = rawEvents.map((raw: any, index: number) => ({
    seq: asSeq(raw?.seq ?? raw?.turnIndex, index),
    turnJson: toTurnJson(raw),
  }));
  mapped.sort((a, b) => a.seq - b.seq);
  if (typeof turnLimit === "number" && Number.isInteger(turnLimit)) {
    return mapped.filter((event) => event.seq <= turnLimit);
  }
  return mapped;
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

function asReplaySupportPackage(value: unknown): ReplaySupportPackage | null {
  if (!isRecord(value)) return null;
  const packageVersion = value.packageVersion;
  const manifestHash = value.manifestHash;
  const manifest = value.manifest;
  const replay = value.replay;
  const drift = value.drift;
  const integrity = value.integrity;
  const runbook = value.runbook;

  if (typeof packageVersion !== "number") return null;
  if (typeof manifestHash !== "string") return null;
  if (!isRecord(manifest) || !isRecord(replay) || !isRecord(integrity) || !isRecord(runbook)) {
    return null;
  }
  if (!isRecord(manifest.replay) || !isRecord(manifest.telemetry) || !Array.isArray(manifest.perTurn)) return null;
  if (typeof manifest.manifestVersion !== "number") return null;
  if (!isRecord(replay.telemetry) || !Array.isArray(replay.perTurn)) return null;
  if (typeof replay.finalStateHash !== "string") return null;
  if (typeof integrity.manifestHashMatches !== "boolean") return null;
  if (typeof integrity.replayFinalStateMatchesManifest !== "boolean") return null;
  if (typeof integrity.telemetryConsistent !== "boolean") return null;
  if (drift !== undefined && (!isRecord(drift) || typeof drift.severity !== "string")) return null;
  if (!("originalBundle" in value)) return null;
  return value as ReplaySupportPackage;
}

function readPath(value: unknown, pathParts: string[]): unknown {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function readPathNumber(value: unknown, candidates: string[][]): number | null {
  for (const candidate of candidates) {
    const current = readPath(value, candidate);
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (typeof current === "string" && current.trim().length > 0) {
      const n = Number(current.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function readPathString(value: unknown, candidates: string[][]): string {
  for (const candidate of candidates) {
    const current = readPath(value, candidate);
    if (typeof current === "string" && current.trim().length > 0) return current.trim();
  }
  return "";
}

type PerTurnRefRow = {
  turnIndex: number;
  deltaCount: number;
  ledgerCount: number;
  hasResolution: boolean;
};

function readPathPerTurn(value: unknown, candidates: string[][]): PerTurnRefRow[] {
  for (const candidate of candidates) {
    const current = readPath(value, candidate);
    if (!Array.isArray(current)) continue;
    const rows: PerTurnRefRow[] = [];
    current.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const turnIndexRaw = entry.turnIndex ?? entry.TURN_INDEX ?? index;
      const deltaCountRaw = entry.deltaCount ?? entry.DELTA_COUNT ?? 0;
      const ledgerCountRaw = entry.ledgerCount ?? entry.LEDGER_COUNT ?? 0;
      const hasResolutionRaw = entry.hasResolution ?? entry.HAS_RESOLUTION ?? false;

      const turnIndex = Number.isFinite(Number(turnIndexRaw)) ? Math.trunc(Number(turnIndexRaw)) : index;
      const deltaCount = Number.isFinite(Number(deltaCountRaw)) ? Math.max(0, Math.trunc(Number(deltaCountRaw))) : 0;
      const ledgerCount = Number.isFinite(Number(ledgerCountRaw)) ? Math.max(0, Math.trunc(Number(ledgerCountRaw))) : 0;
      const hasResolution =
        typeof hasResolutionRaw === "boolean"
          ? hasResolutionRaw
          : typeof hasResolutionRaw === "string"
            ? hasResolutionRaw.trim().toLowerCase() === "true"
            : false;
      rows.push({ turnIndex, deltaCount, ledgerCount, hasResolution });
    });
    rows.sort((a, b) => a.turnIndex - b.turnIndex);
    return rows;
  }
  return [];
}

function findFirstPerTurnDrift(
  derived: ReplaySupportPackage["manifest"]["perTurn"],
  reference: PerTurnRefRow[],
): { turnIndex: number | null; metric: string } | null {
  if (reference.length === 0) return null;
  const maxLen = Math.max(derived.length, reference.length);
  for (let i = 0; i < maxLen; i++) {
    const d = i < derived.length ? derived[i] : null;
    const r = i < reference.length ? reference[i] : null;
    const turnIndex = d?.turnIndex ?? r?.turnIndex ?? null;
    if (!d || !r) return { turnIndex, metric: "missing_turn" };
    if (d.deltaCount !== r.deltaCount) return { turnIndex, metric: "delta_count" };
    if (d.ledgerCount !== r.ledgerCount) return { turnIndex, metric: "ledger_count" };
    if (d.hasResolution !== r.hasResolution) return { turnIndex, metric: "has_resolution" };
  }
  return null;
}

function classifyDriftSeverity(bundle: unknown, manifest: ReplaySupportPackage["manifest"]): DriftSeverity {
  const refHash = readPathString(bundle, [
    ["telemetry", "finalStateHash"],
    ["telemetry", "FINAL_STATE_HASH"],
    ["replayTelemetry", "finalStateHash"],
    ["debug", "telemetry", "finalStateHash"],
  ]);
  const refTurnCount = readPathNumber(bundle, [
    ["telemetry", "turnCount"],
    ["telemetry", "TURN_COUNT"],
    ["replayTelemetry", "turnCount"],
    ["debug", "telemetry", "turnCount"],
  ]);
  const refPerTurn = readPathPerTurn(bundle, [
    ["telemetry", "perTurn"],
    ["telemetry", "PER_TURN_TELEMETRY"],
    ["replayTelemetry", "perTurn"],
    ["debug", "telemetry", "perTurn"],
  ]);

  const hashDrift = !!refHash && refHash !== manifest.replay.finalStateHash;
  const structuralDrift = refTurnCount != null && refTurnCount !== manifest.replay.turnCount;
  const perTurnDrift = findFirstPerTurnDrift(manifest.perTurn, refPerTurn);

  if (hashDrift) return "HASH_DRIFT";
  if (structuralDrift) return "STRUCTURAL_DRIFT";
  if (perTurnDrift) return "PER_TURN_DRIFT";
  return "NONE";
}

function readBundle(args: Record<string, string>): {
  bundle: unknown;
  supportPackage: ReplaySupportPackage | null;
  supportPackageSourceHash: string | null;
} {
  const supportPackagePath = args["support-package-path"];
  if (supportPackagePath) {
    const supportPackageBytes = fs.readFileSync(supportPackagePath);
    const supportPackageSourceHash = crypto.createHash("sha256").update(supportPackageBytes).digest("hex");
    const supportPackageJson = JSON.parse(supportPackageBytes.toString("utf8"));
    const supportPackage = asReplaySupportPackage(supportPackageJson);
    if (!supportPackage) {
      throw new Error("Invalid support package JSON");
    }
    if (supportPackage.packageVersion !== SUPPORT_PACKAGE_VERSION) {
      throw new Error("SUPPORT_PACKAGE_VERSION_MISMATCH");
    }
    if (supportPackage.manifest.manifestVersion !== SUPPORT_MANIFEST_VERSION) {
      throw new Error("SUPPORT_MANIFEST_VERSION_MISMATCH");
    }
    return { bundle: supportPackage.originalBundle, supportPackage, supportPackageSourceHash };
  }

  const jsonArg = args["bundle-json"];
  const pathArg = args["bundle-path"];

  if (jsonArg) {
    return { bundle: JSON.parse(jsonArg), supportPackage: null, supportPackageSourceHash: null };
  }

  if (pathArg) {
    return { bundle: JSON.parse(fs.readFileSync(pathArg, "utf8")), supportPackage: null, supportPackageSourceHash: null };
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
  const { bundle, supportPackage, supportPackageSourceHash } = readBundle(args);
  const turnLimitArg = args.turn;
  const turnLimit = turnLimitArg && /^-?\d+$/.test(turnLimitArg) ? Number(turnLimitArg) : undefined;

  const manifest = await buildSupportManifestFromBundle(bundle, { turnLimit });
  if (manifest.replay.turnCount === 0) {
    throw new Error("No replayable turns/events in bundle");
  }

  const bundleId = args["bundle-id"] ?? "(none)";
  const perTurn = [...manifest.perTurn].sort((a, b) => a.turnIndex - b.turnIndex);
  const replayEvents = extractEvents(bundle, turnLimit);
  const guardSummary = replayStateFromTurnJsonWithGuardSummary(replayEvents);
  const failForwardSignalByTurn = new Map<number, string>();
  const consequenceByTurn = new Map<number, ReturnType<typeof classifyConsequence>>();
  const capSnapshotByTurn = new Map<number, ReturnType<typeof deriveCapSnapshot>>();
  const emptyConsequence: ConsequenceSummary = { riskLevel: "LOW", costTypes: [], escalation: "NONE" };
  for (const event of replayEvents) {
    const signal = classifyFailForwardSignal(event.turnJson);
    if (signal) {
      failForwardSignalByTurn.set(event.seq, signal);
    }
    consequenceByTurn.set(event.seq, classifyConsequence(event.turnJson));
    capSnapshotByTurn.set(event.seq, deriveCapSnapshot(event.turnJson));
  }
  const contiguous = isSeqContiguous(perTurn.map((row) => row.turnIndex));
  const ledgerCount = manifest.telemetry.totalLedgerEntries;
  const deltaCount = manifest.telemetry.totalStateDeltas;
  const sessionMetrics = deriveSessionMetrics(replayEvents, guardSummary);

  console.log(`BUNDLE_ID ${bundleId}`);
  console.log(`TURNS ${manifest.replay.turnCount}`);
  console.log(`INVARIANT_SEQ_CONTIGUOUS ${contiguous ? "PASS" : "FAIL"}`);
  console.log(`INVARIANT_LEDGER_COUNT ${ledgerCount}`);
  console.log(`INVARIANT_DELTA_COUNT ${deltaCount}`);
  console.log(`FINAL_STATE_HASH ${manifest.replay.finalStateHash}`);
  console.log("REPLAY COMPLETE");
  console.log(`REPLAY_GUARD_SUMMARY ${guardSummary.guardSummary.join(",")}`);
  console.log(`FAIL_FORWARD_SIGNAL: ${guardSummary.failForwardSignal}`);
  console.log(`FAIL_FORWARD_CHECK: ${guardSummary.failForwardCheck}`);
  console.log("CAUSAL_COVERAGE:");
  console.log(`  totalDeltas: ${guardSummary.causalCoverage.totalDeltas}`);
  console.log(`  explainedDeltas: ${guardSummary.causalCoverage.explainedDeltas}`);
  console.log(`  unexplainedDeltas: ${guardSummary.causalCoverage.unexplainedDeltas}`);
  console.log(`  coverageRatio: ${guardSummary.causalCoverage.coverageRatio}`);
  console.log("CONSEQUENCE_SUMMARY");
  console.log(`RISK_LEVEL: ${guardSummary.consequenceSummary.riskLevel}`);
  console.log(`COST_TYPES: ${guardSummary.consequenceSummary.costTypes.join(",")}`);
  console.log(`ESCALATION: ${guardSummary.consequenceSummary.escalation}`);
  console.log("STYLE_STABILITY");
  console.log(`toneStable: ${guardSummary.styleStability.toneStable}`);
  console.log(`genreStable: ${guardSummary.styleStability.genreStable}`);
  console.log(`pacingStable: ${guardSummary.styleStability.pacingStable}`);
  console.log(`driftCount: ${guardSummary.styleStability.driftCount}`);
  console.log("MEMORY_STABILITY");
  console.log(`cardsTriggered: ${guardSummary.memoryStability.cardsTriggered}`);
  console.log(`cardsApplied: ${guardSummary.memoryStability.cardsApplied}`);
  console.log(`memoryHash: ${guardSummary.memoryStability.memoryHash}`);
  console.log("DIFFICULTY_STATE");
  console.log(`momentum: ${guardSummary.difficultyState.momentum}`);
  console.log(`tier: ${guardSummary.difficultyState.tier}`);
  console.log("DIFFICULTY_CURVE");
  console.log(`momentumCurve: ${guardSummary.difficultyState.curve.join(",")}`);
  console.log(`finalTier: ${guardSummary.difficultyState.tier}`);
  const latestTurnIndex = perTurn.length > 0 ? perTurn[perTurn.length - 1].turnIndex : null;
  const latestCapSnapshot =
    latestTurnIndex == null ? null : capSnapshotByTurn.get(latestTurnIndex) ?? deriveCapSnapshot({});
  if (latestCapSnapshot) {
    console.log("CAP_SNAPSHOT");
    console.log(`OUTPUT_CHAR_LIMIT: ${latestCapSnapshot.outputCharLimit}`);
    console.log(`MAX_OPTIONS: ${latestCapSnapshot.maxOptions}`);
    console.log(`MAX_LEDGER_ENTRIES: ${latestCapSnapshot.maxLedgerEntries}`);
    console.log(`MAX_DELTA_COUNT: ${latestCapSnapshot.maxDeltaCount}`);
    console.log(`CAP_REASON: ${latestCapSnapshot.capReason}`);
    console.log(`CAP_EXPLANATION: ${explainCapReason(latestCapSnapshot)}`);
  }
  console.log("SESSION_METRICS");
  console.log(`SESSION_METRICS_JSON ${serializeSessionMetrics(sessionMetrics)}`);

  console.log(`TELEMETRY_VERSION ${TELEMETRY_VERSION}`);
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
    const consequence = consequenceByTurn.get(row.turnIndex) ?? emptyConsequence;
    console.log(
      `TURN_INDEX: ${row.turnIndex} DELTA_COUNT: ${row.deltaCount} LEDGER_COUNT: ${row.ledgerCount} HAS_RESOLUTION: ${row.hasResolution} FAIL_FORWARD_SIGNAL: ${failForwardSignalByTurn.get(row.turnIndex) ?? ""} RISK_LEVEL: ${consequence.riskLevel} COST_TYPES: ${consequence.costTypes.join(",")} ESCALATION: ${consequence.escalation}`,
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
        perTurn: perTurn.map((row) => ({
          ...row,
          failForwardSignal: failForwardSignalByTurn.get(row.turnIndex) ?? "",
          riskLevel: (consequenceByTurn.get(row.turnIndex) ?? emptyConsequence).riskLevel,
          costTypes: (consequenceByTurn.get(row.turnIndex) ?? emptyConsequence).costTypes,
          escalation: (consequenceByTurn.get(row.turnIndex) ?? emptyConsequence).escalation,
        })),
      })}`,
    );
  }

  const manifestJson = serializeSupportManifest(manifest);
  const manifestHash = await hashSupportManifest(manifest);
  if (args["manifest-json"] === "true") {
    if (manifest.manifestVersion !== SUPPORT_MANIFEST_VERSION) {
      throw new Error("SUPPORT_MANIFEST_VERSION_MISMATCH");
    }
    console.log(`SUPPORT_MANIFEST_JSON ${manifestJson}`);
  }
  console.log(`MANIFEST_HASH ${manifestHash}`);

  if (supportPackage) {
    if (!supportPackageSourceHash) {
      throw new Error("SUPPORT_PACKAGE_SOURCE_HASH_MISSING");
    }
    const manifestHashMatch = supportPackage.manifestHash === manifestHash;
    const finalStateHashMatch = supportPackage.manifest.replay.finalStateHash === manifest.replay.finalStateHash;
    const telemetryMatch =
      supportPackage.replay.telemetry.totalLedgerEntries === manifest.telemetry.totalLedgerEntries &&
      supportPackage.replay.telemetry.totalStateDeltas === manifest.telemetry.totalStateDeltas &&
      supportPackage.replay.telemetry.maxDeltaPerTurn === manifest.telemetry.maxDeltaPerTurn &&
      supportPackage.replay.telemetry.avgDeltaPerTurn === manifest.telemetry.avgDeltaPerTurn &&
      supportPackage.replay.telemetry.maxLedgerPerTurn === manifest.telemetry.maxLedgerPerTurn;
    const computedDriftSeverity = classifyDriftSeverity(supportPackage.originalBundle, manifest);
    const driftBlockMissing = !supportPackage.drift;
    const driftParityMismatch = !driftBlockMissing && supportPackage.drift?.severity !== computedDriftSeverity;

    console.log(`REPRO_PACK_SOURCE_HASH ${supportPackageSourceHash}`);
    console.log("REPRO_PACK_VALIDATION");
    console.log(`PACKAGE_VERSION: ${supportPackage.packageVersion}`);
    console.log(`MANIFEST_HASH_MATCH: ${manifestHashMatch}`);
    console.log(`FINAL_STATE_HASH_MATCH: ${finalStateHashMatch}`);
    console.log(`TELEMETRY_MATCH: ${telemetryMatch}`);
    console.log(`DRIFT_SEVERITY: ${computedDriftSeverity}`);
    if (driftBlockMissing) {
      console.log("DRIFT_BLOCK_MISSING");
    }
    if (driftParityMismatch) {
      console.log("DRIFT_PARITY_MISMATCH");
    }

    console.log("REPRO_PACK_SUMMARY");
    console.log(`PACKAGE_VERSION: ${supportPackage.packageVersion}`);
    console.log(`MANIFEST_VERSION: ${supportPackage.manifest.manifestVersion}`);
    console.log(`MANIFEST_HASH: ${manifestHash}`);
    console.log(`FINAL_STATE_HASH: ${manifest.replay.finalStateHash}`);
    console.log(`DRIFT_SEVERITY: ${computedDriftSeverity}`);

    const validationPass =
      manifestHashMatch && finalStateHashMatch && telemetryMatch && !driftParityMismatch;
    if (!validationPass) {
      console.error("REPRO_PACK_VALIDATION_FAILED");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("FAIL_FORWARD_VIOLATION")) {
    console.log("FAIL_FORWARD_CHECK: FAIL");
  }
  if (message.includes("FAIL_FORWARD_LOW_STAKES_VIOLATION")) {
    console.log("FAIL_FORWARD_CHECK: FAIL");
  }
  console.error(message);
  process.exit(1);
});
