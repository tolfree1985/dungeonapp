import { SUPPORT_PACKAGE_VERSION } from "../support/supportPackage";
import { SUPPORT_MANIFEST_VERSION, TELEMETRY_VERSION } from "../support/supportManifest";
import { SCENARIO_VERSION, computeScenarioContentHash } from "./scenarioVersion";

export const SCENARIO_SHARE_VERSION = 1 as const;

export type ScenarioSharePackageV1 = {
  shareVersion: typeof SCENARIO_SHARE_VERSION;
  scenarioVersion: typeof SCENARIO_VERSION;
  scenarioContentHash: string;
  engineCompat: {
    telemetryVersion: typeof TELEMETRY_VERSION;
    supportManifestVersion: typeof SUPPORT_MANIFEST_VERSION;
    supportPackageVersion: typeof SUPPORT_PACKAGE_VERSION;
  };
  scenario: Record<string, unknown>;
};

export type ScenarioShareCompatibility = {
  blocked: boolean;
  warning: boolean;
  marker: "SHARE_COMPAT_BLOCKED" | "SHARE_COMPAT_WARNING" | "";
  issues: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function toVersionNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function majorOf(value: number): number {
  return Math.trunc(value);
}

const SHARE_EXCLUDED_SCENARIO_KEYS = new Set([
  "determinismReport",
  "editorState",
  "editorUi",
  "editorMetadata",
  "uiMetadata",
  "_editor",
  "scenarioVersion",
  "scenarioContentHash",
]);

function canonicalizeScenarioContent(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalizeScenarioContent(entry));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value)
      .filter((key) => !SHARE_EXCLUDED_SCENARIO_KEYS.has(key))
      .sort(compareText);
    for (const key of keys) {
      out[key] = canonicalizeScenarioContent(value[key]);
    }
    return out;
  }
  return null;
}

export function buildScenarioSharePackage(scenarioJson: unknown): ScenarioSharePackageV1 {
  const canonicalScenario = canonicalizeScenarioContent(scenarioJson);
  const scenario = isRecord(canonicalScenario) ? canonicalScenario : {};
  const scenarioContentHash = computeScenarioContentHash(scenario);
  return {
    shareVersion: SCENARIO_SHARE_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    scenarioContentHash,
    engineCompat: {
      telemetryVersion: TELEMETRY_VERSION,
      supportManifestVersion: SUPPORT_MANIFEST_VERSION,
      supportPackageVersion: SUPPORT_PACKAGE_VERSION,
    },
    scenario,
  };
}

export function serializeScenarioSharePackage(pkg: ScenarioSharePackageV1): string {
  const ordered = {
    shareVersion: pkg.shareVersion,
    scenarioVersion: pkg.scenarioVersion,
    scenarioContentHash: pkg.scenarioContentHash,
    engineCompat: {
      telemetryVersion: pkg.engineCompat.telemetryVersion,
      supportManifestVersion: pkg.engineCompat.supportManifestVersion,
      supportPackageVersion: pkg.engineCompat.supportPackageVersion,
    },
    scenario: canonicalizeScenarioContent(pkg.scenario),
  };
  return JSON.stringify(ordered);
}

export function parseScenarioSharePackage(raw: string): {
  pkg: ScenarioSharePackageV1 | null;
  marker: "SHARE_IMPORT_BLOCKED" | "";
  issues: string[];
} {
  const text = raw.trim();
  if (!text) {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: ["empty_input"],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: ["invalid_json"],
    };
  }

  if (!isRecord(parsed)) {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: ["invalid_shape"],
    };
  }

  const shareVersion = toVersionNumber(parsed.shareVersion);
  const scenarioVersion = toVersionNumber(parsed.scenarioVersion);
  const scenarioContentHash =
    typeof parsed.scenarioContentHash === "string" ? parsed.scenarioContentHash.trim().toLowerCase() : "";
  const engineCompat = isRecord(parsed.engineCompat) ? parsed.engineCompat : null;
  const scenario = canonicalizeScenarioContent(parsed.scenario);

  const issues: string[] = [];
  if (shareVersion !== SCENARIO_SHARE_VERSION) issues.push("shareVersion_mismatch");
  if (scenarioVersion !== SCENARIO_VERSION) issues.push("scenarioVersion_mismatch");
  if (!/^[a-f0-9]{64}$/.test(scenarioContentHash)) issues.push("scenarioContentHash_invalid");
  if (!engineCompat) issues.push("engineCompat_missing");
  if (!isRecord(scenario)) issues.push("scenario_missing");

  if (issues.length > 0 || !engineCompat || !isRecord(scenario)) {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: issues.sort(compareText),
    };
  }

  const telemetryVersion = toVersionNumber(engineCompat.telemetryVersion);
  const supportManifestVersion = toVersionNumber(engineCompat.supportManifestVersion);
  const supportPackageVersion = toVersionNumber(engineCompat.supportPackageVersion);
  if (
    telemetryVersion == null ||
    supportManifestVersion == null ||
    supportPackageVersion == null
  ) {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: ["engineCompat_invalid"],
    };
  }

  const pkg: ScenarioSharePackageV1 = {
    shareVersion: SCENARIO_SHARE_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    scenarioContentHash,
    engineCompat: {
      telemetryVersion: telemetryVersion as typeof TELEMETRY_VERSION,
      supportManifestVersion: supportManifestVersion as typeof SUPPORT_MANIFEST_VERSION,
      supportPackageVersion: supportPackageVersion as typeof SUPPORT_PACKAGE_VERSION,
    },
    scenario,
  };

  const recomputedHash = computeScenarioContentHash(pkg.scenario);
  if (recomputedHash !== pkg.scenarioContentHash) {
    return {
      pkg: null,
      marker: "SHARE_IMPORT_BLOCKED",
      issues: ["scenarioContentHash_mismatch"],
    };
  }

  return { pkg, marker: "", issues: [] };
}

export function evaluateScenarioShareCompatibility(
  engineCompat: ScenarioSharePackageV1["engineCompat"],
): ScenarioShareCompatibility {
  const issues: string[] = [];
  const local = {
    telemetryVersion: TELEMETRY_VERSION,
    supportManifestVersion: SUPPORT_MANIFEST_VERSION,
    supportPackageVersion: SUPPORT_PACKAGE_VERSION,
  };

  const majorMismatch =
    majorOf(engineCompat.telemetryVersion) !== majorOf(local.telemetryVersion) ||
    majorOf(engineCompat.supportManifestVersion) !== majorOf(local.supportManifestVersion) ||
    majorOf(engineCompat.supportPackageVersion) !== majorOf(local.supportPackageVersion);

  if (engineCompat.telemetryVersion !== local.telemetryVersion) {
    issues.push("telemetryVersion");
  }
  if (engineCompat.supportManifestVersion !== local.supportManifestVersion) {
    issues.push("supportManifestVersion");
  }
  if (engineCompat.supportPackageVersion !== local.supportPackageVersion) {
    issues.push("supportPackageVersion");
  }

  if (majorMismatch) {
    return {
      blocked: true,
      warning: false,
      marker: "SHARE_COMPAT_BLOCKED",
      issues: issues.sort(compareText),
    };
  }
  if (issues.length > 0) {
    return {
      blocked: false,
      warning: true,
      marker: "SHARE_COMPAT_WARNING",
      issues: issues.sort(compareText),
    };
  }
  return {
    blocked: false,
    warning: false,
    marker: "",
    issues: [],
  };
}
