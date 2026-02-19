import { hashSupportManifest, serializeSupportManifest, type SupportManifestV1 } from "./supportManifest";

export const SUPPORT_PACKAGE_VERSION = 1 as const;

export type DriftSeverity = "NONE" | "HASH_DRIFT" | "STRUCTURAL_DRIFT" | "PER_TURN_DRIFT";

export type SupportPackageIntegrity = {
  manifestHashMatches: boolean;
  replayFinalStateMatchesManifest: boolean;
  telemetryConsistent: boolean;
};

export type SupportPackageV1 = {
  packageVersion: typeof SUPPORT_PACKAGE_VERSION;
  manifestHash: string;
  manifest: SupportManifestV1;
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
  integrity: SupportPackageIntegrity;
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

function sortPerTurnRows(rows: SupportPackageV1["replay"]["perTurn"]): SupportPackageV1["replay"]["perTurn"] {
  return [...rows].sort((a, b) => a.turnIndex - b.turnIndex);
}

export async function computeSupportPackageIntegrity(
  pkg: Omit<SupportPackageV1, "integrity">,
): Promise<SupportPackageIntegrity> {
  const manifestHashMatches = (await hashSupportManifest(pkg.manifest)) === pkg.manifestHash;
  const replayFinalStateMatchesManifest = pkg.replay.finalStateHash === pkg.manifest.replay.finalStateHash;

  const perTurn = sortPerTurnRows(pkg.replay.perTurn);
  const manifestPerTurn = sortPerTurnRows(pkg.manifest.perTurn);
  const totalLedgerEntries = perTurn.reduce((sum, row) => sum + row.ledgerCount, 0);
  const totalStateDeltas = perTurn.reduce((sum, row) => sum + row.deltaCount, 0);
  const maxDeltaPerTurn = perTurn.reduce((max, row) => (row.deltaCount > max ? row.deltaCount : max), 0);
  const maxLedgerPerTurn = perTurn.reduce((max, row) => (row.ledgerCount > max ? row.ledgerCount : max), 0);
  const avgDeltaPerTurn = Number((totalStateDeltas / Math.max(perTurn.length, 1)).toFixed(6));

  const rowsMatch =
    perTurn.length === manifestPerTurn.length &&
    perTurn.every((row, idx) => {
      const m = manifestPerTurn[idx];
      return (
        row.turnIndex === m.turnIndex &&
        row.deltaCount === m.deltaCount &&
        row.ledgerCount === m.ledgerCount &&
        row.hasResolution === m.hasResolution
      );
    });

  const telemetryConsistent =
    rowsMatch &&
    pkg.replay.perTurn.length === pkg.manifest.replay.turnCount &&
    totalLedgerEntries === pkg.replay.telemetry.totalLedgerEntries &&
    totalStateDeltas === pkg.replay.telemetry.totalStateDeltas &&
    maxDeltaPerTurn === pkg.replay.telemetry.maxDeltaPerTurn &&
    avgDeltaPerTurn === pkg.replay.telemetry.avgDeltaPerTurn &&
    maxLedgerPerTurn === pkg.replay.telemetry.maxLedgerPerTurn &&
    pkg.replay.telemetry.totalLedgerEntries === pkg.manifest.telemetry.totalLedgerEntries &&
    pkg.replay.telemetry.totalStateDeltas === pkg.manifest.telemetry.totalStateDeltas &&
    pkg.replay.telemetry.maxDeltaPerTurn === pkg.manifest.telemetry.maxDeltaPerTurn &&
    pkg.replay.telemetry.avgDeltaPerTurn === pkg.manifest.telemetry.avgDeltaPerTurn &&
    pkg.replay.telemetry.maxLedgerPerTurn === pkg.manifest.telemetry.maxLedgerPerTurn;

  return { manifestHashMatches, replayFinalStateMatchesManifest, telemetryConsistent };
}

export async function assertSupportPackageIntegrity(
  pkg: Omit<SupportPackageV1, "integrity">,
): Promise<SupportPackageIntegrity> {
  const integrity = await computeSupportPackageIntegrity(pkg);
  const failed: string[] = [];
  if (!integrity.manifestHashMatches) failed.push("manifestHashMatches");
  if (!integrity.replayFinalStateMatchesManifest) failed.push("replayFinalStateMatchesManifest");
  if (!integrity.telemetryConsistent) failed.push("telemetryConsistent");
  if (failed.length > 0) {
    throw new Error(`SUPPORT_PACKAGE_INTEGRITY_ERROR: ${failed.join(",")}`);
  }
  return integrity;
}

export function serializeSupportPackage(pkg: SupportPackageV1): string {
  const ordered = {
    packageVersion: pkg.packageVersion,
    manifestHash: pkg.manifestHash,
    manifest: JSON.parse(serializeSupportManifest(pkg.manifest)),
    telemetryVersion: pkg.telemetryVersion,
    replay: {
      finalStateHash: pkg.replay.finalStateHash,
      telemetry: {
        totalLedgerEntries: pkg.replay.telemetry.totalLedgerEntries,
        totalStateDeltas: pkg.replay.telemetry.totalStateDeltas,
        maxDeltaPerTurn: pkg.replay.telemetry.maxDeltaPerTurn,
        avgDeltaPerTurn: pkg.replay.telemetry.avgDeltaPerTurn,
        maxLedgerPerTurn: pkg.replay.telemetry.maxLedgerPerTurn,
      },
      perTurn: sortPerTurnRows(pkg.replay.perTurn).map((row) => ({
        turnIndex: row.turnIndex,
        deltaCount: row.deltaCount,
        ledgerCount: row.ledgerCount,
        hasResolution: row.hasResolution,
      })),
    },
    drift: {
      severity: pkg.drift.severity,
      ...(pkg.drift.firstDriftTurnIndex !== undefined
        ? { firstDriftTurnIndex: pkg.drift.firstDriftTurnIndex }
        : {}),
      ...(pkg.drift.firstDriftMetric !== undefined ? { firstDriftMetric: pkg.drift.firstDriftMetric } : {}),
    },
    integrity: {
      manifestHashMatches: pkg.integrity.manifestHashMatches,
      replayFinalStateMatchesManifest: pkg.integrity.replayFinalStateMatchesManifest,
      telemetryConsistent: pkg.integrity.telemetryConsistent,
    },
    runbook: {
      build: pkg.runbook.build,
      migrate: pkg.runbook.migrate,
      rollback: pkg.runbook.rollback,
      smoke: pkg.runbook.smoke,
    },
    originalBundle: stableNormalize(pkg.originalBundle),
  };

  return JSON.stringify(ordered);
}
