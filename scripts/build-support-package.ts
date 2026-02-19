import fs from "node:fs";
import path from "node:path";
import {
  TELEMETRY_VERSION,
  buildSupportManifestFromBundle,
  hashSupportManifest,
  serializeSupportManifest,
  sha256HexFromText,
  type SupportManifestV1,
} from "../src/lib/support/supportManifest";

type PerTurnRefRow = {
  turnIndex: number;
  deltaCount: number;
  ledgerCount: number;
  hasResolution: boolean;
};

type DriftSeverity = "NONE" | "HASH_DRIFT" | "STRUCTURAL_DRIFT" | "PER_TURN_DRIFT";

type SupportPackageV1 = {
  packageVersion: 1;
  manifest: SupportManifestV1;
  manifestHash: string;
  telemetryVersion: number;
  replay: {
    finalStateHash: string;
    telemetry: {
      totalLedgerEntries: number;
      totalStateDeltas: number;
      maxDeltaPerTurn: number;
      avgDeltaPerTurn: number;
      maxLedgerPerTurn: number;
    };
    perTurn: Array<{
      turnIndex: number;
      deltaCount: number;
      ledgerCount: number;
      hasResolution: boolean;
    }>;
  };
  drift: {
    severity: DriftSeverity;
    firstDriftTurnIndex?: number;
    firstDriftMetric?: string;
  };
  runbook: {
    build: string;
    migrate: string;
    rollback: string;
    smoke: string;
  };
  originalBundle: unknown;
};

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry));
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).sort(compareText);
    for (const key of keys) {
      out[key] = stableNormalize(value[key]);
    }
    return out;
  }
  return value;
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
  derived: SupportManifestV1["perTurn"],
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

function buildDrift(bundle: unknown, manifest: SupportManifestV1): SupportPackageV1["drift"] {
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

  const severity: DriftSeverity = hashDrift
    ? "HASH_DRIFT"
    : structuralDrift
      ? "STRUCTURAL_DRIFT"
      : perTurnDrift
        ? "PER_TURN_DRIFT"
        : "NONE";

  if (severity === "NONE") {
    return { severity: "NONE" };
  }

  if (severity === "HASH_DRIFT") {
    const turnIndex = manifest.perTurn.length > 0 ? manifest.perTurn[manifest.perTurn.length - 1].turnIndex : 0;
    return { severity, firstDriftTurnIndex: turnIndex, firstDriftMetric: "final_state_hash" };
  }

  if (severity === "STRUCTURAL_DRIFT") {
    const turnIndex = Math.min(refTurnCount ?? manifest.replay.turnCount, manifest.replay.turnCount);
    return { severity, firstDriftTurnIndex: turnIndex, firstDriftMetric: "missing_turn" };
  }

  return {
    severity,
    firstDriftTurnIndex: perTurnDrift?.turnIndex ?? 0,
    firstDriftMetric: perTurnDrift?.metric ?? "unknown",
  };
}

function buildSupportPackage(bundle: unknown, manifest: SupportManifestV1, manifestHash: string): SupportPackageV1 {
  return {
    packageVersion: 1,
    manifest,
    manifestHash,
    telemetryVersion: TELEMETRY_VERSION,
    replay: {
      finalStateHash: manifest.replay.finalStateHash,
      telemetry: {
        totalLedgerEntries: manifest.telemetry.totalLedgerEntries,
        totalStateDeltas: manifest.telemetry.totalStateDeltas,
        maxDeltaPerTurn: manifest.telemetry.maxDeltaPerTurn,
        avgDeltaPerTurn: manifest.telemetry.avgDeltaPerTurn,
        maxLedgerPerTurn: manifest.telemetry.maxLedgerPerTurn,
      },
      perTurn: manifest.perTurn.map((row) => ({
        turnIndex: row.turnIndex,
        deltaCount: row.deltaCount,
        ledgerCount: row.ledgerCount,
        hasResolution: row.hasResolution,
      })),
    },
    drift: buildDrift(bundle, manifest),
    runbook: {
      build: "docs/deploy-runbook#build",
      migrate: "docs/deploy-runbook#migrate",
      rollback: "docs/deploy-runbook#rollback",
      smoke: "docs/deploy-runbook#smoke",
    },
    originalBundle: stableNormalize(bundle),
  };
}

function serializeSupportPackage(pkg: SupportPackageV1): string {
  return JSON.stringify(pkg);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = args["bundle-path"];
  if (!bundlePath) throw new Error("Missing --bundle-path");

  const outDir = args["out-dir"] || "./support-output";
  const bundleText = fs.readFileSync(bundlePath, "utf8");
  const bundle = JSON.parse(bundleText);

  const manifest = await buildSupportManifestFromBundle(bundle);
  const manifestHash = await hashSupportManifest(manifest);
  const pkg = buildSupportPackage(bundle, manifest, manifestHash);
  const packageJson = serializeSupportPackage(pkg);
  const packageHash = await sha256HexFromText(packageJson);

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.resolve(outDir, `support-package_${manifestHash}.json`);
  fs.writeFileSync(outputPath, packageJson, "utf8");

  console.log(`SUPPORT_PACKAGE_PATH ${outputPath}`);
  console.log(`PACKAGE_HASH ${packageHash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
