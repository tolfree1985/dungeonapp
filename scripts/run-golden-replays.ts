import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateScenarioDeterminism } from "../src/lib/scenario/validateScenarioDeterminism";
import { computeScenarioContentHash } from "../src/lib/scenario/scenarioVersion";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

type CliArgs = {
  list: boolean;
  checkIndex: boolean;
  noParallel: boolean;
};

type FixtureRunResult =
  | {
      ok: true;
      fixtureName: string;
      manifestHash: string;
      finalStateHash: string;
      memoryHash: string;
    }
  | {
      ok: false;
      fixtureName: string;
      markers: string[];
      excerptLines: string[];
    };

function parseArgs(argv: string[]): CliArgs {
  const explicitParallel = argv.includes("--parallel");
  return {
    list: argv.includes("--list"),
    checkIndex: argv.includes("--check-index"),
    noParallel: argv.includes("--no-parallel") || !explicitParallel,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseGoldenIndex(indexPath: string): GoldenIndex {
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Partial<GoldenIndex>;
  if (parsed.version !== 1) {
    throw new Error("GOLDEN_INDEX_INVALID version");
  }
  if (!Array.isArray(parsed.fixtures) || parsed.fixtures.some((name) => typeof name !== "string")) {
    throw new Error("GOLDEN_INDEX_INVALID fixtures");
  }
  return {
    version: parsed.version,
    fixtures: parsed.fixtures,
  };
}

function assertGoldenIndex(index: GoldenIndex, goldenDir: string): void {
  const seen = new Set<string>();
  for (const fixtureName of index.fixtures) {
    if (seen.has(fixtureName)) {
      throw new Error(`GOLDEN_INDEX_INVALID duplicate=${fixtureName}`);
    }
    seen.add(fixtureName);
    if (fixtureName.includes("/") || fixtureName.includes("\\")) {
      throw new Error(`GOLDEN_INDEX_INVALID path_segment=${fixtureName}`);
    }
    const fixturePath = path.join(goldenDir, fixtureName);
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`GOLDEN_INDEX_INVALID missing=${fixtureName}`);
    }
  }
}

function parseSummary(output: string): { manifestHash: string; finalStateHash: string } {
  const lines = output.split(/\r?\n/);
  const summaryStart = lines.findIndex((line) => line.trim() === "REPRO_PACK_SUMMARY");
  if (summaryStart < 0) {
    throw new Error("REPRO_PACK_SUMMARY_MISSING");
  }
  const summaryLines = lines.slice(summaryStart);
  const manifestHashLine = summaryLines.find((line) => line.startsWith("MANIFEST_HASH: "));
  const finalStateHashLine = summaryLines.find((line) => line.startsWith("FINAL_STATE_HASH: "));
  if (!manifestHashLine || !finalStateHashLine) {
    throw new Error("REPRO_PACK_SUMMARY_FIELDS_MISSING");
  }
  return {
    manifestHash: manifestHashLine.replace("MANIFEST_HASH: ", "").trim(),
    finalStateHash: finalStateHashLine.replace("FINAL_STATE_HASH: ", "").trim(),
  };
}

function validateFixtureSchema(fixtureName: string, fixturePath: string): string[] {
  const markers: string[] = [];
  if (!fixtureName.endsWith(".support.json")) {
    markers.push(`GOLDEN_FIXTURE_INVALID file_extension=${fixtureName}`);
    return markers;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (!isRecord(parsed)) {
      markers.push("GOLDEN_FIXTURE_INVALID payload=not_object");
      return markers;
    }
    if (typeof parsed.packageVersion !== "number") {
      markers.push("GOLDEN_FIXTURE_INVALID field=packageVersion");
    }
    if (typeof parsed.manifestHash !== "string" || parsed.manifestHash.trim().length === 0) {
      markers.push("GOLDEN_FIXTURE_INVALID field=manifestHash");
    }
    if (!isRecord(parsed.manifest)) {
      markers.push("GOLDEN_FIXTURE_INVALID field=manifest");
    }
    if (!("originalBundle" in parsed)) {
      markers.push("GOLDEN_FIXTURE_INVALID field=originalBundle");
    }
  } catch {
    markers.push("GOLDEN_FIXTURE_INVALID parse_error");
  }
  return markers;
}

function readScenarioMetadataFromFixture(fixturePath: string): unknown | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.originalBundle)) return null;
    const originalBundle = parsed.originalBundle;
    if (isRecord(originalBundle.scenario)) return originalBundle.scenario;
    if (isRecord(originalBundle.scenarioJson)) return originalBundle.scenarioJson;
    if (typeof originalBundle.scenarioJson === "string") {
      const maybe = JSON.parse(originalBundle.scenarioJson);
      return isRecord(maybe) ? maybe : null;
    }
    if (isRecord(originalBundle.scenarioContent)) return originalBundle.scenarioContent;
    return null;
  } catch {
    return null;
  }
}

function readExpectedScenarioContentHashFromFixture(fixturePath: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (!isRecord(parsed)) return "";

    const fromManifest =
      isRecord(parsed.manifest) && typeof parsed.manifest.scenarioContentHash === "string"
        ? parsed.manifest.scenarioContentHash.trim()
        : "";
    if (fromManifest) return fromManifest;

    const fromBundle =
      isRecord(parsed.originalBundle) && typeof parsed.originalBundle.scenarioContentHash === "string"
        ? parsed.originalBundle.scenarioContentHash.trim()
        : "";
    if (fromBundle) return fromBundle;

    return "";
  } catch {
    return "";
  }
}

function normalizePath(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function hasStyleLockFieldsInScenario(scenarioMetadata: unknown): boolean {
  if (!isRecord(scenarioMetadata)) return false;
  const s = scenarioMetadata as any;

  const initialFlags = [
    isRecord(s.initialState) && isRecord(s.initialState.flags) ? s.initialState.flags : null,
    isRecord(s.initialState) && isRecord(s.initialState.world) && isRecord(s.initialState.world.flags)
      ? s.initialState.world.flags
      : null,
  ];
  for (const flags of initialFlags) {
    if (!flags) continue;
    if ("toneLock" in flags || "genreLock" in flags || "pacingLock" in flags) {
      return true;
    }
  }

  const rawTurns = Array.isArray(s.turns)
    ? s.turns
    : Array.isArray(s.events)
      ? s.events
      : Array.isArray(s.scriptedTurns)
        ? s.scriptedTurns
        : [];
  for (const turn of rawTurns) {
    const source = isRecord(turn) ? turn : {};
    const turnJson = isRecord(source.turnJson) ? source.turnJson : {};
    const deltas = Array.isArray(source.stateDeltas)
      ? source.stateDeltas
      : Array.isArray(source.deltas)
        ? source.deltas
        : Array.isArray(turnJson.deltas)
          ? turnJson.deltas
          : [];
    for (const delta of deltas) {
      if (!isRecord(delta)) continue;
      if (typeof delta.key === "string" && (delta.key === "toneLock" || delta.key === "genreLock" || delta.key === "pacingLock")) {
        return true;
      }
      const path = normalizePath(delta.path);
      if (!path) continue;
      const normalized = path.startsWith("/") ? path.slice(1) : path;
      if (
        normalized === "flags.toneLock" ||
        normalized === "flags.genreLock" ||
        normalized === "flags.pacingLock" ||
        normalized === "world.flags.toneLock" ||
        normalized === "world.flags.genreLock" ||
        normalized === "world.flags.pacingLock"
      ) {
        return true;
      }
    }
  }
  return false;
}

function collectFailureMarkers(text: string): string[] {
  const markerPattern =
    /(REPRO_PACK_|DRIFT_|DELTA_|LEDGER_|STYLE_LOCK_|INVARIANT_|GOLDEN_|MISMATCH|VIOLATION|FAILED|ERROR|INVALID|MISSING)/;
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (markerPattern.test(trimmed)) {
      out.push(trimmed);
    }
  }
  if (out.length === 0) {
    return ["NO_FAILURE_MARKER"];
  }
  return out;
}

function parseGuardSummary(stdout: string): string[] | null {
  const line = stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("REPLAY_GUARD_SUMMARY "));
  if (!line) return null;
  return line
    .replace(/^REPLAY_GUARD_SUMMARY\s+/, "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function parseCausalCoverage(stdout: string): {
  totalDeltas: number;
  explainedDeltas: number;
  unexplainedDeltas: number;
  coverageRatio: number;
} | null {
  const lines = stdout.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trim() === "CAUSAL_COVERAGE:");
  if (markerIndex < 0) return null;
  const window = lines.slice(markerIndex, markerIndex + 6);
  const readValue = (prefix: string): number | null => {
    const line = window.find((entry) => entry.trim().startsWith(prefix));
    if (!line) return null;
    const raw = line.trim().slice(prefix.length).trim();
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
  };
  const totalDeltas = readValue("totalDeltas:");
  const explainedDeltas = readValue("explainedDeltas:");
  const unexplainedDeltas = readValue("unexplainedDeltas:");
  const coverageRatioLine = window.find((entry) => entry.trim().startsWith("coverageRatio:"));
  const coverageRatioRaw = coverageRatioLine ? coverageRatioLine.trim().slice("coverageRatio:".length).trim() : "";
  const coverageRatio = coverageRatioRaw.length > 0 ? Number(coverageRatioRaw) : Number.NaN;
  if (
    totalDeltas == null ||
    explainedDeltas == null ||
    unexplainedDeltas == null ||
    !Number.isFinite(coverageRatio)
  ) {
    return null;
  }
  return { totalDeltas, explainedDeltas, unexplainedDeltas, coverageRatio };
}

function parsePerTurnTelemetryRows(stdout: string): Array<{
  turnIndex: number;
  deltaCount: number;
  ledgerCount: number;
  hasResolution: boolean;
  failForwardSignal: string;
  riskLevel: string;
  costTypes: string;
  escalation: string;
}> {
  const rows: Array<{
    turnIndex: number;
    deltaCount: number;
    ledgerCount: number;
    hasResolution: boolean;
    failForwardSignal: string;
    riskLevel: string;
    costTypes: string;
    escalation: string;
  }> = [];
  const pattern =
    /^TURN_INDEX:\s+(-?\d+)\s+DELTA_COUNT:\s+(\d+)\s+LEDGER_COUNT:\s+(\d+)\s+HAS_RESOLUTION:\s+(true|false)\s+FAIL_FORWARD_SIGNAL:\s*(.*?)\s+RISK_LEVEL:\s*(LOW|MODERATE|HIGH)\s+COST_TYPES:\s*(.*?)\s+ESCALATION:\s*(NONE|MINOR|MAJOR)$/;
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    rows.push({
      turnIndex: Number(match[1]),
      deltaCount: Number(match[2]),
      ledgerCount: Number(match[3]),
      hasResolution: match[4] === "true",
      failForwardSignal: (match[5] ?? "").trim(),
      riskLevel: (match[6] ?? "").trim(),
      costTypes: (match[7] ?? "").trim(),
      escalation: (match[8] ?? "").trim(),
    });
  }
  rows.sort((a, b) => a.turnIndex - b.turnIndex);
  return rows;
}

function parseStyleStability(stdout: string): {
  toneStable: boolean;
  genreStable: boolean;
  pacingStable: boolean;
  driftCount: number;
} | null {
  const lines = stdout.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trim() === "STYLE_STABILITY");
  if (markerIndex < 0) return null;
  const window = lines.slice(markerIndex, markerIndex + 6);
  const readBoolean = (prefix: string): boolean | null => {
    const line = window.find((entry) => entry.trim().startsWith(prefix));
    if (!line) return null;
    const raw = line.trim().slice(prefix.length).trim();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  };
  const readNumber = (prefix: string): number | null => {
    const line = window.find((entry) => entry.trim().startsWith(prefix));
    if (!line) return null;
    const raw = line.trim().slice(prefix.length).trim();
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
  };
  const toneStable = readBoolean("toneStable:");
  const genreStable = readBoolean("genreStable:");
  const pacingStable = readBoolean("pacingStable:");
  const driftCount = readNumber("driftCount:");
  if (toneStable == null || genreStable == null || pacingStable == null || driftCount == null) {
    return null;
  }
  return { toneStable, genreStable, pacingStable, driftCount };
}

function parseMemoryStability(stdout: string): {
  cardsTriggered: number;
  cardsApplied: number;
  memoryHash: string;
} | null {
  const lines = stdout.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trim() === "MEMORY_STABILITY");
  if (markerIndex < 0) return null;
  const window = lines.slice(markerIndex, markerIndex + 5);
  const readNumber = (prefix: string): number | null => {
    const line = window.find((entry) => entry.trim().startsWith(prefix));
    if (!line) return null;
    const raw = line.trim().slice(prefix.length).trim();
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
  };
  const cardsTriggered = readNumber("cardsTriggered:");
  const cardsApplied = readNumber("cardsApplied:");
  const memoryHashLine = window.find((entry) => entry.trim().startsWith("memoryHash:"));
  const memoryHash = memoryHashLine ? memoryHashLine.trim().slice("memoryHash:".length).trim() : "";
  if (
    cardsTriggered == null ||
    cardsApplied == null ||
    !/^[a-f0-9]{64}$/.test(memoryHash)
  ) {
    return null;
  }
  return { cardsTriggered, cardsApplied, memoryHash };
}

function parseDifficultyState(stdout: string): {
  momentum: number;
  tier: "CALM" | "TENSE" | "DANGEROUS" | "CRITICAL";
} | null {
  const lines = stdout.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trim() === "DIFFICULTY_STATE");
  if (markerIndex < 0) return null;
  const window = lines.slice(markerIndex, markerIndex + 4);
  const momentumLine = window.find((entry) => entry.trim().startsWith("momentum:"));
  const tierLine = window.find((entry) => entry.trim().startsWith("tier:"));
  const momentumRaw = momentumLine ? momentumLine.trim().slice("momentum:".length).trim() : "";
  const tierRaw = tierLine ? tierLine.trim().slice("tier:".length).trim() : "";
  if (!/^-?\d+$/.test(momentumRaw)) return null;
  if (tierRaw !== "CALM" && tierRaw !== "TENSE" && tierRaw !== "DANGEROUS" && tierRaw !== "CRITICAL") {
    return null;
  }
  return {
    momentum: Number(momentumRaw),
    tier: tierRaw,
  };
}

function parseDifficultyCurve(stdout: string): {
  momentumCurve: string;
  finalTier: "CALM" | "TENSE" | "DANGEROUS" | "CRITICAL";
} | null {
  const lines = stdout.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => line.trim() === "DIFFICULTY_CURVE");
  if (markerIndex < 0) return null;
  const window = lines.slice(markerIndex, markerIndex + 4);
  const curveLine = window.find((entry) => entry.trim().startsWith("momentumCurve:"));
  const finalTierLine = window.find((entry) => entry.trim().startsWith("finalTier:"));
  const momentumCurve = curveLine ? curveLine.trim().slice("momentumCurve:".length).trim() : "";
  const finalTier = finalTierLine ? finalTierLine.trim().slice("finalTier:".length).trim() : "";
  if (finalTier !== "CALM" && finalTier !== "TENSE" && finalTier !== "DANGEROUS" && finalTier !== "CRITICAL") {
    return null;
  }
  const curvePattern = /^$|^\d+(,\d+)*$/;
  if (!curvePattern.test(momentumCurve)) return null;
  return {
    momentumCurve,
    finalTier,
  };
}

function isFailureResolution(source: unknown): boolean {
  if (!isRecord(source)) return false;
  const resolution = isRecord(source.resolution) ? source.resolution : null;
  const candidates = [
    resolution?.tier,
    resolution?.outcome,
    resolution?.band,
    source.outcome,
    source.tier,
    source.band,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === "fail" || normalized === "failure" || normalized === "fail-forward") return true;
    if (normalized.includes("fail")) return true;
    if (normalized === "2-6") return true;
  }
  if (resolution && typeof resolution.total === "number" && Number.isFinite(resolution.total)) {
    return resolution.total <= 6;
  }
  return false;
}

function getFailureTurnIndexesFromFixture(fixturePath: string): number[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.originalBundle)) return [];
    const bundle = parsed.originalBundle;
    const rawEvents = Array.isArray(bundle.events) ? bundle.events : Array.isArray(bundle.turns) ? bundle.turns : [];
    const indexes = rawEvents
      .map((raw, idx) => {
        if (!isRecord(raw)) return null;
        const turnIndexRaw = raw.turnIndex ?? raw.seq ?? idx;
        const turnIndex =
          typeof turnIndexRaw === "number" && Number.isInteger(turnIndexRaw)
            ? turnIndexRaw
            : typeof turnIndexRaw === "string" && /^-?\d+$/.test(turnIndexRaw.trim())
              ? Number(turnIndexRaw.trim())
              : idx;
        const source = isRecord(raw.turnJson) ? raw.turnJson : raw;
        return isFailureResolution(source) ? turnIndex : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    return indexes;
  } catch {
    return [];
  }
}

function isGuardOrderValid(guards: string[]): boolean {
  const required = [
    "TURN_MONOTONICITY",
    "LEDGER_CONSISTENCY",
    "FAIL_FORWARD_INVARIANT",
    "DELTA_SHAPE",
    "DELTA_NAMESPACE",
    "DELTA_ORDER",
    "DELTA_APPLY_IDEMPOTENCY",
    "STYLE_LOCK_INVARIANT",
    "MEMORY_STABILITY",
    "CAUSAL_COVERAGE",
    "REPLAY_STATE_INVARIANT",
  ];
  let last = -1;
  for (const name of required) {
    const idx = guards.indexOf(name);
    if (idx < 0 || idx <= last) return false;
    last = idx;
  }
  return true;
}

function buildFailureExcerpt(stdout: string, markers: string[]): string[] {
  const out: string[] = [];
  out.push(`FIRST_FAIL_MARKER ${markers[0] ?? "UNKNOWN"}`);

  const lines = stdout.split(/\r?\n/);
  const summaryPrefixes = [
    "REPRO_PACK_SUMMARY",
    "PACKAGE_VERSION:",
    "MANIFEST_VERSION:",
    "MANIFEST_HASH:",
    "FINAL_STATE_HASH:",
    "DRIFT_SEVERITY:",
  ];
  for (const prefix of summaryPrefixes) {
    const line = lines.find((entry) => entry.startsWith(prefix));
    if (line) out.push(line);
  }

  const driftTurnLine = lines.find((entry) => entry.startsWith("FIRST_DRIFT_TURN_INDEX"));
  if (driftTurnLine) out.push(driftTurnLine);
  const driftMetricLine = lines.find((entry) => entry.startsWith("FIRST_DRIFT_METRIC"));
  if (driftMetricLine) out.push(driftMetricLine);
  return out;
}

function runFixture(replayScriptPath: string, fixtureName: string, fixturePath: string): FixtureRunResult {
  const schemaMarkers = validateFixtureSchema(fixtureName, fixturePath);
  if (schemaMarkers.length > 0) {
    return {
      ok: false,
      fixtureName,
      markers: schemaMarkers,
      excerptLines: buildFailureExcerpt("", schemaMarkers),
    };
  }
  const scenarioMetadata = readScenarioMetadataFromFixture(fixturePath);
  const expectedScenarioContentHash = readExpectedScenarioContentHashFromFixture(fixturePath);
  const hasStyleLockFields = hasStyleLockFieldsInScenario(scenarioMetadata);
  const failureTurnIndexes = getFailureTurnIndexesFromFixture(fixturePath);
  if (scenarioMetadata) {
    const scenarioValidation = validateScenarioDeterminism(scenarioMetadata);
    if (!scenarioValidation.valid) {
      const markers = ["GOLDEN_SCENARIO_INVALID", ...scenarioValidation.errors];
      return {
        ok: false,
        fixtureName,
        markers,
        excerptLines: buildFailureExcerpt("", markers),
      };
    }
    if (expectedScenarioContentHash) {
      const actualScenarioHash = computeScenarioContentHash(scenarioMetadata);
      if (actualScenarioHash !== expectedScenarioContentHash) {
        const markers = ["GOLDEN_SCENARIO_HASH_MISMATCH"];
        return {
          ok: false,
          fixtureName,
          markers,
          excerptLines: buildFailureExcerpt("", markers),
        };
      }
    }
  }

  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", replayScriptPath, `--support-package-path=${fixturePath}`],
    { encoding: "utf8" },
  );
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const combinedOutput = `${stdout}\n${stderr}`;

  const regressionMarkers: string[] = [];
  if (child.status !== 0) {
    regressionMarkers.push(`GOLDEN_REGRESSION exit_code=${String(child.status)}`);
  }
  if (!stdout.includes("REPRO_PACK_VALIDATION")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=REPRO_PACK_VALIDATION");
  }
  if (!stdout.includes("REPRO_PACK_SUMMARY")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=REPRO_PACK_SUMMARY");
  }
  if (!stdout.includes("MANIFEST_HASH_MATCH: true")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=MANIFEST_HASH_MATCH_TRUE");
  }
  if (!stdout.includes("FINAL_STATE_HASH_MATCH: true")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=FINAL_STATE_HASH_MATCH_TRUE");
  }
  if (!stdout.includes("TELEMETRY_MATCH: true")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=TELEMETRY_MATCH_TRUE");
  }
  if (!stdout.includes("DRIFT_SEVERITY: NONE")) {
    regressionMarkers.push("GOLDEN_REGRESSION missing=DRIFT_SEVERITY_NONE");
  }
  if (stdout.includes("DRIFT_BLOCK_MISSING")) {
    regressionMarkers.push("GOLDEN_REGRESSION unexpected=DRIFT_BLOCK_MISSING");
  }
  if (hasStyleLockFields && (combinedOutput.includes("STYLE_LOCK_VIOLATION") || combinedOutput.includes("STYLE_LOCK_DRIFT_VIOLATION"))) {
    regressionMarkers.push("GOLDEN_STYLE_LOCK_REGRESSION");
  }
  if (combinedOutput.includes("STYLE_OVERRIDE_MISSING_LEDGER")) {
    regressionMarkers.push("GOLDEN_STYLE_LOCK_REGRESSION marker=STYLE_OVERRIDE_MISSING_LEDGER");
  }
  const styleStability = parseStyleStability(stdout);
  if (!styleStability) {
    regressionMarkers.push("GOLDEN_STYLE_LOCK_REGRESSION missing=STYLE_STABILITY");
  } else if (styleStability.driftCount !== 0) {
    regressionMarkers.push(`GOLDEN_STYLE_LOCK_REGRESSION driftCount=${String(styleStability.driftCount)}`);
  }
  if (combinedOutput.includes("STORY_CARD_NON_DETERMINISTIC_TRIGGER")) {
    regressionMarkers.push("GOLDEN_MEMORY_REGRESSION marker=STORY_CARD_NON_DETERMINISTIC_TRIGGER");
  }
  if (combinedOutput.includes("STORY_CARD_ORDER_UNSTABLE")) {
    regressionMarkers.push("GOLDEN_MEMORY_REGRESSION marker=STORY_CARD_ORDER_UNSTABLE");
  }
  if (combinedOutput.includes("MEMORY_MUTATION_VIOLATION")) {
    regressionMarkers.push("GOLDEN_MEMORY_REGRESSION marker=MEMORY_MUTATION_VIOLATION");
  }
  const memoryStability = parseMemoryStability(stdout);
  if (!memoryStability) {
    regressionMarkers.push("GOLDEN_MEMORY_REGRESSION missing=MEMORY_STABILITY");
  }
  if (combinedOutput.includes("DIFFICULTY_MOMENTUM_REGRESSION")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_REGRESSION marker=DIFFICULTY_MOMENTUM_REGRESSION");
  }
  if (combinedOutput.includes("DIFFICULTY_SPIKE_VIOLATION")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_CURVE_REGRESSION marker=DIFFICULTY_SPIKE_VIOLATION");
  }
  if (combinedOutput.includes("DIFFICULTY_COOLDOWN_INVALID")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_CURVE_REGRESSION marker=DIFFICULTY_COOLDOWN_INVALID");
  }
  if (combinedOutput.includes("DIFFICULTY_CAP_VIOLATION")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_REGRESSION marker=DIFFICULTY_CAP_VIOLATION");
  }
  if (!stdout.includes("DIFFICULTY_STATE")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_REGRESSION missing=DIFFICULTY_STATE");
  }
  const difficultyState = parseDifficultyState(stdout);
  if (!difficultyState) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_REGRESSION missing=DIFFICULTY_FIELDS");
  }
  if (!stdout.includes("DIFFICULTY_CURVE")) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_CURVE_REGRESSION missing=DIFFICULTY_CURVE");
  }
  const difficultyCurve = parseDifficultyCurve(stdout);
  if (!difficultyCurve) {
    regressionMarkers.push("GOLDEN_DIFFICULTY_CURVE_REGRESSION missing=DIFFICULTY_CURVE_FIELDS");
  }
  if (combinedOutput.includes("DELTA_WITHOUT_LEDGER_EXPLANATION")) {
    regressionMarkers.push("GOLDEN_CAUSAL_REGRESSION marker=DELTA_WITHOUT_LEDGER_EXPLANATION");
  }
  if (combinedOutput.includes("LEDGER_WITHOUT_DELTA_MUTATION")) {
    regressionMarkers.push("GOLDEN_CAUSAL_REGRESSION marker=LEDGER_WITHOUT_DELTA_MUTATION");
  }
  if (combinedOutput.includes("FAIL_FORWARD_LOW_STAKES_VIOLATION")) {
    regressionMarkers.push("GOLDEN_CONSEQUENCE_REGRESSION marker=FAIL_FORWARD_LOW_STAKES_VIOLATION");
  }
  if (!stdout.includes("CONSEQUENCE_SUMMARY")) {
    regressionMarkers.push("GOLDEN_CONSEQUENCE_REGRESSION missing=CONSEQUENCE_SUMMARY");
  }
  if (!stdout.includes("RISK_LEVEL:")) {
    regressionMarkers.push("GOLDEN_CONSEQUENCE_REGRESSION missing=RISK_LEVEL");
  }
  if (!stdout.includes("COST_TYPES:")) {
    regressionMarkers.push("GOLDEN_CONSEQUENCE_REGRESSION missing=COST_TYPES");
  }
  if (!stdout.includes("ESCALATION:")) {
    regressionMarkers.push("GOLDEN_CONSEQUENCE_REGRESSION missing=ESCALATION");
  }
  const consequenceRows = parsePerTurnTelemetryRows(stdout);
  for (const row of consequenceRows) {
    if (!row.riskLevel) {
      regressionMarkers.push(`GOLDEN_CONSEQUENCE_REGRESSION turn=${row.turnIndex} reason=missing_risk_level`);
    }
    if (!row.escalation) {
      regressionMarkers.push(`GOLDEN_CONSEQUENCE_REGRESSION turn=${row.turnIndex} reason=missing_escalation`);
    }
  }
  if (combinedOutput.includes("LEDGER_TOO_BROAD_EXPLANATION")) {
    regressionMarkers.push("GOLDEN_CAUSAL_PRECISION_REGRESSION marker=LEDGER_TOO_BROAD_EXPLANATION");
  }
  const causalCoverage = parseCausalCoverage(stdout);
  if (!causalCoverage) {
    regressionMarkers.push("GOLDEN_CAUSAL_REGRESSION missing=CAUSAL_COVERAGE");
  } else if (causalCoverage.unexplainedDeltas > 0) {
    regressionMarkers.push(
      `GOLDEN_CAUSAL_REGRESSION unexplainedDeltas=${String(causalCoverage.unexplainedDeltas)}`,
    );
  } else if (causalCoverage.coverageRatio !== 1) {
    regressionMarkers.push(
      `GOLDEN_CAUSAL_PRECISION_REGRESSION coverageRatio=${String(causalCoverage.coverageRatio)}`,
    );
  }
  if (failureTurnIndexes.length > 0) {
    if (!stdout.includes("FAIL_FORWARD_CHECK: PASS")) {
      regressionMarkers.push("GOLDEN_FAIL_FORWARD_REGRESSION missing=FAIL_FORWARD_CHECK_PASS");
    }
    if (!stdout.includes("FAIL_FORWARD_SIGNAL: ")) {
      regressionMarkers.push("GOLDEN_FAIL_FORWARD_REGRESSION missing=FAIL_FORWARD_SIGNAL");
    }
    if (combinedOutput.includes("FAIL_FORWARD_VIOLATION")) {
      regressionMarkers.push("GOLDEN_FAIL_FORWARD_REGRESSION marker=FAIL_FORWARD_VIOLATION");
    }
    const perTurnRows = consequenceRows;
    const failureSignals: string[] = [];
    for (const failureTurnIndex of failureTurnIndexes) {
      const row = perTurnRows.find((entry) => entry.turnIndex === failureTurnIndex);
      if (!row || row.deltaCount <= 0) {
        regressionMarkers.push(
          `GOLDEN_FAIL_FORWARD_REGRESSION turn=${failureTurnIndex} reason=delta_count`,
        );
      }
      if (!row || row.ledgerCount <= 0) {
        regressionMarkers.push(
          `GOLDEN_FAIL_FORWARD_REGRESSION turn=${failureTurnIndex} reason=ledger_count`,
        );
      }
      if (!row || row.failForwardSignal.length === 0) {
        regressionMarkers.push(
          `GOLDEN_FAIL_FORWARD_REGRESSION turn=${failureTurnIndex} reason=missing_signal`,
        );
      } else {
        failureSignals.push(row.failForwardSignal);
      }
      if (!row || row.riskLevel.length === 0) {
        regressionMarkers.push(
          `GOLDEN_CONSEQUENCE_REGRESSION turn=${failureTurnIndex} reason=missing_risk_level`,
        );
      } else if (row.riskLevel === "LOW") {
        regressionMarkers.push(
          `GOLDEN_CONSEQUENCE_REGRESSION turn=${failureTurnIndex} reason=low_risk_failure`,
        );
      }
      if (!row || row.escalation.length === 0) {
        regressionMarkers.push(
          `GOLDEN_CONSEQUENCE_REGRESSION turn=${failureTurnIndex} reason=missing_escalation`,
        );
      } else if (row.escalation !== "MINOR" && row.escalation !== "MAJOR") {
        regressionMarkers.push(
          `GOLDEN_CONSEQUENCE_REGRESSION turn=${failureTurnIndex} reason=invalid_escalation`,
        );
      }
    }
    const uniqueSignals = [...new Set(failureSignals)].sort();
    if (failureSignals.length > 1 && uniqueSignals.length === 1) {
      console.log(
        `GOLDEN_WARN_LOW_FAIL_FORWARD_DIVERSITY fixture=${fixtureName} signal=${uniqueSignals[0]}`,
      );
    }
  }
  const guardSummary = parseGuardSummary(stdout);
  if (!guardSummary || !isGuardOrderValid(guardSummary)) {
    regressionMarkers.push("GOLDEN_GUARD_SUMMARY_MISSING");
  }

  if (regressionMarkers.length === 0 && memoryStability && difficultyState && difficultyCurve) {
    const childSecond = spawnSync(
      process.execPath,
      ["--import", "tsx", replayScriptPath, `--support-package-path=${fixturePath}`],
      { encoding: "utf8" },
    );
    if (childSecond.status !== 0) {
      regressionMarkers.push(`GOLDEN_MEMORY_REGRESSION second_run_exit_code=${String(childSecond.status)}`);
    } else {
      const secondStability = parseMemoryStability(childSecond.stdout ?? "");
      if (!secondStability || secondStability.memoryHash !== memoryStability.memoryHash) {
        regressionMarkers.push("GOLDEN_MEMORY_REGRESSION memory_hash_unstable");
      }
      const secondDifficultyState = parseDifficultyState(childSecond.stdout ?? "");
      if (
        !secondDifficultyState ||
        secondDifficultyState.momentum !== difficultyState.momentum ||
        secondDifficultyState.tier !== difficultyState.tier
      ) {
        regressionMarkers.push("GOLDEN_DIFFICULTY_REGRESSION difficulty_state_unstable");
      }
      const secondDifficultyCurve = parseDifficultyCurve(childSecond.stdout ?? "");
      if (
        !secondDifficultyCurve ||
        secondDifficultyCurve.momentumCurve !== difficultyCurve.momentumCurve ||
        secondDifficultyCurve.finalTier !== difficultyCurve.finalTier
      ) {
        regressionMarkers.push("GOLDEN_DIFFICULTY_CURVE_REGRESSION curve_unstable");
      }
    }
  }

  if (regressionMarkers.length > 0) {
    const markers = [...regressionMarkers, ...collectFailureMarkers(`${stdout}\n${stderr}`)];
    return {
      ok: false,
      fixtureName,
      markers,
      excerptLines: buildFailureExcerpt(stdout, markers),
    };
  }

  try {
    const summary = parseSummary(stdout);
    return {
      ok: true,
      fixtureName,
      manifestHash: summary.manifestHash,
      finalStateHash: summary.finalStateHash,
      memoryHash: memoryStability?.memoryHash ?? "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fixtureName,
      markers: ["GOLDEN_REGRESSION summary_parse", ...collectFailureMarkers(message)],
      excerptLines: buildFailureExcerpt(stdout, ["GOLDEN_REGRESSION summary_parse"]),
    };
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const goldenDir = path.join(root, "fixtures", "golden");
  const indexPath = path.join(goldenDir, "index.json");
  const replayScriptPath = path.join(root, "scripts", "replay-from-bundle.ts");
  const index = parseGoldenIndex(indexPath);
  assertGoldenIndex(index, goldenDir);

  if (args.list) {
    for (const fixtureName of index.fixtures) {
      console.log(`GOLDEN_FIXTURE ${fixtureName}`);
    }
    return;
  }

  if (args.checkIndex) {
    console.log(`GOLDEN_INDEX_OK count=${index.fixtures.length}`);
    return;
  }
  if (!args.noParallel) {
    throw new Error("GOLDEN_MODE_INVALID parallel_not_supported");
  }
  console.log(`GOLDEN_ENV NODE=${process.versions.node}`);
  console.log("GOLDEN_MODE SEQUENTIAL");

  let passCount = 0;
  let failCount = 0;

  for (const fixtureName of index.fixtures) {
    const fixturePath = path.join(goldenDir, fixtureName);
    const result = runFixture(replayScriptPath, fixtureName, fixturePath);
    if (result.ok) {
      console.log(
        `GOLDEN_OK ${result.fixtureName} MANIFEST_HASH=${result.manifestHash} FINAL_STATE_HASH=${result.finalStateHash} MEMORY_HASH=${result.memoryHash}`,
      );
      passCount += 1;
    } else {
      console.error(`GOLDEN_FAIL ${result.fixtureName}`);
      console.error("GOLDEN_FAILURE_EXCERPT_BEGIN");
      for (const line of result.excerptLines) {
        console.error(line);
      }
      console.error("GOLDEN_FAILURE_EXCERPT_END");
      for (const marker of result.markers) {
        console.error(`MARKER ${marker}`);
      }
      failCount += 1;
    }
  }

  const total = index.fixtures.length;
  console.log(`GOLDEN_SUMMARY TOTAL=${total} PASS=${passCount} FAIL=${failCount}`);
  if (failCount > 0) {
    process.exit(1);
  }
  console.log(`GOLDEN_REPLAYS_OK count=${passCount}`);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`GOLDEN_FAIL RUN`);
  for (const marker of collectFailureMarkers(message)) {
    console.error(`MARKER ${marker}`);
  }
  process.exit(1);
}
