import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSupportManifestFromBundle, serializeSupportManifest } from "../../src/lib/support/supportManifest";
import { mustGetArg } from "./_cli";
import type { RcBundleManifest } from "./_rc_bundle_types";
import { sha256Bytes } from "./_hash";

type SupportManifestLike = {
  scenarioContentHash?: string;
  [k: string]: unknown;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function toPosix(pathName: string): string {
  return pathName.replace(/\\/g, "/");
}

function isDirectory(pathName: string): boolean {
  return existsSync(pathName) && statSync(pathName).isDirectory();
}

function loadJson<T>(pathName: string): T {
  return JSON.parse(readFileSync(pathName, "utf8")) as T;
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

function findBundleJsonInDir(bundleDir: string): string | null {
  const candidates = walkFiles(bundleDir)
    .filter((entry) => entry.rel.toLowerCase().endsWith(".json"))
    .map((entry) => entry.abs)
    .sort(compareText);
  if (candidates.length === 0) return null;
  const bundleNamed = candidates.find(
    (abs) => abs.toLowerCase().endsWith("/bundle.json") || abs.toLowerCase().endsWith("\\bundle.json"),
  );
  return bundleNamed ?? candidates[0];
}

function verifyFileHash(bundleDir: string, rel: string, expectedSha: string, expectedBytes: number): void {
  const abs = join(bundleDir, rel);
  assert(existsSync(abs), `Bundle missing file: ${rel}`);
  const bytes = readFileSync(abs);
  const actualSha = sha256Bytes(bytes);
  assert(actualSha === expectedSha, `Hash mismatch for ${rel}: expected=${expectedSha} got=${actualSha}`);
  assert(bytes.length === expectedBytes, `Size mismatch for ${rel}: expected=${expectedBytes} got=${bytes.length}`);
}

async function main(): Promise<void> {
  const bundleDir = mustGetArg("--bundle");

  const manifestPath = join(bundleDir, "manifest.json");
  const supportManifestPath = join(bundleDir, "support_manifest.json");
  const originalBundleDir = join(bundleDir, "originalBundle");

  assert(existsSync(manifestPath), "RC bundle missing manifest.json");
  assert(existsSync(supportManifestPath), "RC bundle missing support_manifest.json");
  assert(isDirectory(originalBundleDir), "RC bundle missing originalBundle/");

  const manifest = loadJson<RcBundleManifest>(manifestPath);
  assert(manifest.rcBundleVersion === 1, `Unsupported rcBundleVersion: ${String((manifest as { rcBundleVersion?: unknown }).rcBundleVersion)}`);

  for (const [rel, meta] of Object.entries(manifest.files)) {
    verifyFileHash(bundleDir, rel, meta.sha256, meta.bytes);
  }

  const sourceBundleJsonPath = findBundleJsonInDir(originalBundleDir);
  assert(!!sourceBundleJsonPath, "No JSON bundle found under originalBundle/");
  const sourceBundleJson = loadJson<unknown>(sourceBundleJsonPath);

  const recordedSupportManifest = loadJson<SupportManifestLike>(supportManifestPath);
  const rebuiltSupportManifest = await buildSupportManifestFromBundle(sourceBundleJson);

  const recordedCanonical = JSON.parse(serializeSupportManifest(recordedSupportManifest as any));
  const rebuiltCanonical = JSON.parse(serializeSupportManifest(rebuiltSupportManifest));

  assert(
    JSON.stringify(recordedCanonical) === JSON.stringify(rebuiltCanonical),
    "support_manifest.json mismatch with rebuilt support manifest",
  );

  const supportScenarioHash =
    typeof recordedSupportManifest.scenarioContentHash === "string" && recordedSupportManifest.scenarioContentHash.length > 0
      ? recordedSupportManifest.scenarioContentHash
      : "";
  assert(!!supportScenarioHash, "support_manifest.json missing scenarioContentHash");
  assert(
    manifest.scenarioContentHash === supportScenarioHash,
    `manifest.scenarioContentHash mismatch: manifest=${manifest.scenarioContentHash} support=${supportScenarioHash}`,
  );

  process.stdout.write("RC_BUNDLE_SMOKE_OK\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
