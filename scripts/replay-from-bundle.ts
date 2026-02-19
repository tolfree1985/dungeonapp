import fs from "node:fs";
import {
  SUPPORT_MANIFEST_VERSION,
  TELEMETRY_VERSION,
  buildSupportManifestFromBundle,
  hashSupportManifest,
  serializeSupportManifest,
} from "../src/lib/support/supportManifest";
import { SUPPORT_PACKAGE_VERSION, type DriftSeverity, type SupportPackageV1 } from "../src/lib/support/supportPackage";

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

function asSupportPackageV1(value: unknown): SupportPackageV1 | null {
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
  if (!isRecord(manifest) || !isRecord(replay) || !isRecord(drift) || !isRecord(integrity) || !isRecord(runbook)) {
    return null;
  }
  if (!("originalBundle" in value)) return null;
  return value as SupportPackageV1;
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
  derived: SupportPackageV1["manifest"]["perTurn"],
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

function classifyDriftSeverity(bundle: unknown, manifest: SupportPackageV1["manifest"]): DriftSeverity {
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

function readBundle(args: Record<string, string>): { bundle: unknown; supportPackage: SupportPackageV1 | null } {
  const supportPackagePath = args["support-package-path"];
  if (supportPackagePath) {
    const supportPackageJson = JSON.parse(fs.readFileSync(supportPackagePath, "utf8"));
    const supportPackage = asSupportPackageV1(supportPackageJson);
    if (!supportPackage) {
      throw new Error("Invalid support package JSON");
    }
    if (supportPackage.packageVersion !== SUPPORT_PACKAGE_VERSION) {
      throw new Error("SUPPORT_PACKAGE_VERSION_MISMATCH");
    }
    if (supportPackage.manifest.manifestVersion !== SUPPORT_MANIFEST_VERSION) {
      throw new Error("SUPPORT_MANIFEST_VERSION_MISMATCH");
    }
    return { bundle: supportPackage.originalBundle, supportPackage };
  }

  const jsonArg = args["bundle-json"];
  const pathArg = args["bundle-path"];

  if (jsonArg) {
    return { bundle: JSON.parse(jsonArg), supportPackage: null };
  }

  if (pathArg) {
    return { bundle: JSON.parse(fs.readFileSync(pathArg, "utf8")), supportPackage: null };
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
  const { bundle, supportPackage } = readBundle(args);
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
    const manifestHashMatch = supportPackage.manifestHash === manifestHash;
    const finalStateHashMatch = supportPackage.manifest.replay.finalStateHash === manifest.replay.finalStateHash;
    const telemetryMatch =
      supportPackage.replay.telemetry.totalLedgerEntries === manifest.telemetry.totalLedgerEntries &&
      supportPackage.replay.telemetry.totalStateDeltas === manifest.telemetry.totalStateDeltas &&
      supportPackage.replay.telemetry.maxDeltaPerTurn === manifest.telemetry.maxDeltaPerTurn &&
      supportPackage.replay.telemetry.avgDeltaPerTurn === manifest.telemetry.avgDeltaPerTurn &&
      supportPackage.replay.telemetry.maxLedgerPerTurn === manifest.telemetry.maxLedgerPerTurn;
    const computedDriftSeverity = classifyDriftSeverity(supportPackage.originalBundle, manifest);

    console.log("REPRO_PACK_VALIDATION");
    console.log(`PACKAGE_VERSION: ${supportPackage.packageVersion}`);
    console.log(`MANIFEST_HASH_MATCH: ${manifestHashMatch}`);
    console.log(`FINAL_STATE_HASH_MATCH: ${finalStateHashMatch}`);
    console.log(`TELEMETRY_MATCH: ${telemetryMatch}`);
    console.log(`DRIFT_SEVERITY: ${computedDriftSeverity}`);
    if (supportPackage.drift.severity !== computedDriftSeverity) {
      console.log("DRIFT_PARITY_MISMATCH");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
