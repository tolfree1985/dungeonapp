import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type GoldenIndex = {
  version: number;
  fixtures: string[];
};

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

function collectFailureMarkers(text: string): string[] {
  const markerPattern =
    /(REPRO_PACK_|DRIFT_|DELTA_|LEDGER_|STYLE_LOCK_|INVARIANT_|MISMATCH|VIOLATION|FAILED|ERROR|INVALID|MISSING)/;
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

function runFixture(replayScriptPath: string, fixturePath: string): { stdout: string; stderr: string } {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", replayScriptPath, `--support-package-path=${fixturePath}`],
    { encoding: "utf8" },
  );
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  if (child.status !== 0) {
    const markers = collectFailureMarkers(`${stdout}\n${stderr}`);
    throw new Error(`EXIT_${String(child.status)} ${markers.join(" | ")}`);
  }
  if (!stdout.includes("REPRO_PACK_VALIDATION")) {
    throw new Error("REPRO_PACK_VALIDATION_MISSING");
  }
  if (!stdout.includes("REPRO_PACK_SUMMARY")) {
    throw new Error("REPRO_PACK_SUMMARY_MISSING");
  }
  return { stdout, stderr };
}

function main() {
  const root = process.cwd();
  const goldenDir = path.join(root, "fixtures", "golden");
  const indexPath = path.join(goldenDir, "index.json");
  const replayScriptPath = path.join(root, "scripts", "replay-from-bundle.ts");

  const index = parseGoldenIndex(indexPath);
  let passCount = 0;

  for (const fixtureName of index.fixtures) {
    if (fixtureName.includes("/") || fixtureName.includes("\\")) {
      throw new Error(`GOLDEN_FIXTURE_NAME_INVALID ${fixtureName}`);
    }
    const fixturePath = path.join(goldenDir, fixtureName);
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`GOLDEN_FIXTURE_MISSING ${fixtureName}`);
    }

    try {
      const result = runFixture(replayScriptPath, fixturePath);
      const summary = parseSummary(result.stdout);
      console.log(
        `GOLDEN_OK ${fixtureName} MANIFEST_HASH=${summary.manifestHash} FINAL_STATE_HASH=${summary.finalStateHash}`,
      );
      passCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`GOLDEN_FAIL ${fixtureName}`);
      for (const marker of collectFailureMarkers(message)) {
        console.error(`MARKER ${marker}`);
      }
      process.exit(1);
    }
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
