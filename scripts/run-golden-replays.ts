import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

type CliArgs = {
  list: boolean;
  checkIndex: boolean;
};

type FixtureRunResult =
  | {
      ok: true;
      fixtureName: string;
      manifestHash: string;
      finalStateHash: string;
    }
  | {
      ok: false;
      fixtureName: string;
      markers: string[];
    };

function parseArgs(argv: string[]): CliArgs {
  return {
    list: argv.includes("--list"),
    checkIndex: argv.includes("--check-index"),
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

function runFixture(replayScriptPath: string, fixtureName: string, fixturePath: string): FixtureRunResult {
  const schemaMarkers = validateFixtureSchema(fixtureName, fixturePath);
  if (schemaMarkers.length > 0) {
    return { ok: false, fixtureName, markers: schemaMarkers };
  }

  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", replayScriptPath, `--support-package-path=${fixturePath}`],
    { encoding: "utf8" },
  );
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";

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

  if (regressionMarkers.length > 0) {
    return {
      ok: false,
      fixtureName,
      markers: [...regressionMarkers, ...collectFailureMarkers(`${stdout}\n${stderr}`)],
    };
  }

  try {
    const summary = parseSummary(stdout);
    return {
      ok: true,
      fixtureName,
      manifestHash: summary.manifestHash,
      finalStateHash: summary.finalStateHash,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fixtureName,
      markers: ["GOLDEN_REGRESSION summary_parse", ...collectFailureMarkers(message)],
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

  let passCount = 0;
  let failCount = 0;

  for (const fixtureName of index.fixtures) {
    const fixturePath = path.join(goldenDir, fixtureName);
    const result = runFixture(replayScriptPath, fixtureName, fixturePath);
    if (result.ok) {
      console.log(`GOLDEN_OK ${result.fixtureName} MANIFEST_HASH=${result.manifestHash} FINAL_STATE_HASH=${result.finalStateHash}`);
      passCount += 1;
    } else {
      console.error(`GOLDEN_FAIL ${result.fixtureName}`);
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
