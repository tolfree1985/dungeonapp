import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import type { RcBundleManifest } from "./_rc_bundle_types";
import { sha256Bytes } from "./_hash";
import { mustGetArg } from "./_cli";
import { buildSupportManifestFromBundle, serializeSupportManifest } from "../../src/lib/support/supportManifest";

type SupportManifestLike = {
  scenarioContentHash?: string;
  [k: string]: unknown;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isDirectory(pathName: string): boolean {
  return existsSync(pathName) && statSync(pathName).isDirectory();
}

function loadJson<T>(pathName: string): T {
  return JSON.parse(readFileSync(pathName, "utf8")) as T;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function toPosix(pathName: string): string {
  return pathName.replace(/\\/g, "/");
}

function walkFiles(dir: string): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  const root = dir;

  const walk = (current: string) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push({
        rel: toPosix(relative(root, abs)),
        abs,
      });
    }
  };

  walk(root);
  return out;
}

function readStringPath(source: unknown, paths: string[][]): string {
  for (const pathParts of paths) {
    let current: unknown = source;
    for (const part of pathParts) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[part];
    }
    if (typeof current === "string" && current.trim().length > 0) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return "";
}

function findBundleJsonInDir(bundleDir: string): string | null {
  const candidates = walkFiles(bundleDir)
    .filter((entry) => entry.rel.toLowerCase().endsWith(".json"))
    .map((entry) => entry.abs)
    .sort(compareText);
  if (candidates.length === 0) return null;
  const bundleNamed = candidates.find((abs) => abs.toLowerCase().endsWith("/bundle.json") || abs.toLowerCase().endsWith("\\bundle.json"));
  return bundleNamed ?? candidates[0];
}

function verifyFileHash(bundleDir: string, rel: string, expectedSha: string, expectedBytes: number): void {
  const abs = join(bundleDir, rel);
  assert(existsSync(abs), `Bundle missing file: ${rel}`);
  const buf = readFileSync(abs);
  const sha = sha256Bytes(buf);
  assert(sha === expectedSha, `Hash mismatch for ${rel}: expected=${expectedSha} got=${sha}`);
  assert(buf.length === expectedBytes, `Size mismatch for ${rel}: expected=${expectedBytes} got=${buf.length}`);
}

async function main(): Promise<void> {
  const bundleDir = mustGetArg("--bundle");

  const manifestPath = join(bundleDir, "manifest.json");
  const supportPath = join(bundleDir, "support_manifest.json");
  const originalBundleDir = join(bundleDir, "originalBundle");

  assert(existsSync(manifestPath), "RC bundle missing manifest.json");
  assert(existsSync(supportPath), "RC bundle missing support_manifest.json");
  assert(isDirectory(originalBundleDir), "RC bundle missing originalBundle/");

  const manifest = loadJson<RcBundleManifest>(manifestPath);
  assert(manifest.rcBundleVersion === 1, `Unsupported rcBundleVersion: ${String((manifest as any).rcBundleVersion)}`);

  for (const [rel, meta] of Object.entries(manifest.files)) {
    verifyFileHash(bundleDir, rel, meta.sha256, meta.bytes);
  }

  const bundleJsonPath = findBundleJsonInDir(originalBundleDir);
  assert(!!bundleJsonPath, "No JSON bundle found under originalBundle/");
  const bundleJson = loadJson<unknown>(bundleJsonPath);

  const recordedSupport = loadJson<SupportManifestLike>(supportPath);
  const rebuiltSupport = (await buildSupportManifestFromBundle(bundleJson)) as unknown as SupportManifestLike;

  const recordedSupportOrdered = JSON.parse(serializeSupportManifest(recordedSupport as any));
  const rebuiltSupportOrdered = JSON.parse(serializeSupportManifest(rebuiltSupport as any));
  assert(
    JSON.stringify(recordedSupportOrdered) === JSON.stringify(rebuiltSupportOrdered),
    "support_manifest.json mismatch with rebuilt support manifest",
  );

  const supportScenarioHash = typeof recordedSupport.scenarioContentHash === "string" ? recordedSupport.scenarioContentHash : "";
  assert(!!supportScenarioHash, "support_manifest.json missing scenarioContentHash");
  assert(
    manifest.scenarioContentHash === supportScenarioHash,
    `manifest.scenarioContentHash mismatch: manifest=${manifest.scenarioContentHash} support=${supportScenarioHash}`,
  );

  const scenarioIdFromBundle = readStringPath(bundleJson, [["scenarioId"], ["scenario", "id"]]) || "unknown";
  assert(
    manifest.scenarioId === scenarioIdFromBundle,
    `manifest.scenarioId mismatch: manifest=${manifest.scenarioId} bundle=${scenarioIdFromBundle}`,
  );

  const replayScript = join(process.cwd(), "scripts", "replay-from-bundle.ts");
  assert(existsSync(replayScript), "Missing scripts/replay-from-bundle.ts (expected existing harness entrypoint)");

  const res = spawnSync(process.execPath, ["--import", "tsx", replayScript, `--bundle-path=${bundleJsonPath}`], {
    stdio: "inherit",
    env: process.env,
  });

  assert(res.status === 0, `replay-from-bundle failed with exit code ${String(res.status)}`);
  process.stdout.write("RC_BUNDLE_VERIFY_OK\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
