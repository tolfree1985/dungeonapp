import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

type FixtureSummary = {
  turns: number;
  ledgerEntries: number;
  packageBytes: number;
};

type FixtureResult =
  | {
      ok: true;
      fixtureName: string;
      summary: FixtureSummary;
    }
  | {
      ok: false;
      fixtureName: string;
      summary: FixtureSummary;
      markers: string[];
      excerptLines: string[];
    };

const MAX_SUPPORT_PACKAGE_BYTES = 2_000_000;
const MAX_TURNS = 500;
const MAX_LEDGER_ENTRIES_TOTAL = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseGoldenIndex(indexPath: string): GoldenIndex {
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Partial<GoldenIndex>;
  if (parsed.version !== 1) {
    throw new Error("STRESS_INDEX_INVALID version");
  }
  if (!Array.isArray(parsed.fixtures) || parsed.fixtures.some((name) => typeof name !== "string")) {
    throw new Error("STRESS_INDEX_INVALID fixtures");
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
      throw new Error(`STRESS_INDEX_INVALID duplicate=${fixtureName}`);
    }
    seen.add(fixtureName);
    if (fixtureName.includes("/") || fixtureName.includes("\\")) {
      throw new Error(`STRESS_INDEX_INVALID path_segment=${fixtureName}`);
    }
    const fixturePath = path.join(goldenDir, fixtureName);
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`STRESS_INDEX_INVALID missing=${fixtureName}`);
    }
  }
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function readFixtureSummary(fixturePath: string): FixtureSummary {
  const bytes = fs.readFileSync(fixturePath);
  const packageBytes = bytes.length;

  let turns = 0;
  let ledgerEntries = 0;
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (isRecord(parsed) && isRecord(parsed.manifest)) {
      const manifest = parsed.manifest;
      if (isRecord(manifest.replay)) {
        turns = toInt(manifest.replay.turnCount) ?? turns;
      }
      if (isRecord(manifest.telemetry)) {
        ledgerEntries = toInt(manifest.telemetry.totalLedgerEntries) ?? ledgerEntries;
      }
      if (Array.isArray(manifest.perTurn)) {
        if (turns === 0) {
          turns = manifest.perTurn.length;
        }
        if (ledgerEntries === 0) {
          ledgerEntries = manifest.perTurn.reduce((sum, row) => {
            if (!isRecord(row)) return sum;
            return sum + (toInt(row.ledgerCount) ?? 0);
          }, 0);
        }
      }
    }
  } catch {
    // replay step will surface invalid fixture content deterministically.
  }

  return {
    turns,
    ledgerEntries,
    packageBytes,
  };
}

function collectFailureMarkers(text: string): string[] {
  const markerPattern =
    /(REPRO_PACK_|DRIFT_|DELTA_|LEDGER_|STYLE_LOCK_|INVARIANT_|GOLDEN_|STRESS_|MISMATCH|VIOLATION|FAILED|ERROR|INVALID|MISSING)/;
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

function readSectionLines(output: string, marker: string, maxLines = 6): string[] {
  const lines = output.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trim() === marker);
  if (idx < 0) {
    return [`${marker} (missing)`];
  }
  const out: string[] = [];
  for (let i = idx; i < lines.length && out.length < maxLines; i++) {
    const value = lines[i].trim();
    if (!value) continue;
    out.push(value);
  }
  return out;
}

function buildFailureExcerpt(output: string, markers: string[]): string[] {
  const out: string[] = [];
  out.push(`FIRST_FAIL_MARKER ${markers[0] ?? "UNKNOWN"}`);
  const sections = [
    "REPRO_PACK_SUMMARY",
    "DIFFICULTY_STATE",
    "CAUSAL_COVERAGE:",
    "MEMORY_STABILITY",
    "STYLE_STABILITY",
    "CAP_SNAPSHOT",
  ];
  for (const section of sections) {
    out.push(...readSectionLines(output, section));
  }
  return out;
}

function runFixture(replayScriptPath: string, fixtureName: string, fixturePath: string): FixtureResult {
  const summary = readFixtureSummary(fixturePath);
  const markers: string[] = [];

  if (summary.packageBytes > MAX_SUPPORT_PACKAGE_BYTES) {
    markers.push(
      `STRESS_SIZE_VIOLATION fixture=${fixtureName} packageBytes=${summary.packageBytes} max=${MAX_SUPPORT_PACKAGE_BYTES}`,
    );
  }
  if (summary.turns > MAX_TURNS) {
    markers.push(`STRESS_TURN_LIMIT_VIOLATION fixture=${fixtureName} turns=${summary.turns} max=${MAX_TURNS}`);
  }
  if (summary.ledgerEntries > MAX_LEDGER_ENTRIES_TOTAL) {
    markers.push(
      `STRESS_SIZE_VIOLATION fixture=${fixtureName} ledgerEntries=${summary.ledgerEntries} max=${MAX_LEDGER_ENTRIES_TOTAL}`,
    );
  }

  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", replayScriptPath, `--support-package-path=${fixturePath}`],
    { encoding: "utf8" },
  );

  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  const combinedOutput = `${stdout}\n${stderr}`;

  if (child.status !== 0) {
    markers.push(`STRESS_REPLAY_FAILED fixture=${fixtureName} exit_code=${String(child.status)}`);
  }

  if (markers.length === 0) {
    return {
      ok: true,
      fixtureName,
      summary,
    };
  }

  const allMarkers = [...markers, ...collectFailureMarkers(combinedOutput)];
  return {
    ok: false,
    fixtureName,
    summary,
    markers: allMarkers,
    excerptLines: buildFailureExcerpt(stdout, allMarkers),
  };
}

function main(): void {
  const root = process.cwd();
  const goldenDir = path.join(root, "fixtures", "golden");
  const indexPath = path.join(goldenDir, "index.json");
  const replayScriptPath = path.join(root, "scripts", "replay-from-bundle.ts");
  const index = parseGoldenIndex(indexPath);
  assertGoldenIndex(index, goldenDir);

  console.log("STRESS_MODE SEQUENTIAL");

  let passCount = 0;
  let failCount = 0;

  for (const fixtureName of index.fixtures) {
    const fixturePath = path.join(goldenDir, fixtureName);
    const result = runFixture(replayScriptPath, fixtureName, fixturePath);
    if (result.ok) {
      console.log(
        `STRESS_OK ${result.fixtureName} TURNS=${result.summary.turns} PACKAGE_BYTES=${result.summary.packageBytes}`,
      );
      passCount += 1;
    } else {
      console.error(`STRESS_FAIL ${result.fixtureName}`);
      console.error("STRESS_FAILURE_EXCERPT_BEGIN");
      for (const line of result.excerptLines) {
        console.error(line);
      }
      console.error("STRESS_FAILURE_EXCERPT_END");
      for (const marker of result.markers) {
        console.error(`MARKER ${marker}`);
      }
      failCount += 1;
    }
  }

  const total = index.fixtures.length;
  console.log(`STRESS_SUMMARY TOTAL=${total} PASS=${passCount} FAIL=${failCount}`);
  if (failCount > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("STRESS_FAIL RUN");
  for (const marker of collectFailureMarkers(message)) {
    console.error(`MARKER ${marker}`);
  }
  process.exit(1);
}
