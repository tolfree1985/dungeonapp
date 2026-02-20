import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { mustGetArg } from "./_cli";
import { RcProvenance, computeManifestSha256, computeSupportManifestSha256 } from "./_provenance_types";
import { computeDirectoryDigest } from "./_artifact_digest";

function optionalArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

function isDirectory(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

async function main(): Promise<void> {
  const artifactDir = mustGetArg("--artifact");
  const commitSha = mustGetArg("--commit");
  const expectedDigest = optionalArg("--expected-digest");
  const expectedTag = optionalArg("--tag");

  assert(existsSync(artifactDir), `artifact directory missing: ${artifactDir}`);
  assert(isDirectory(artifactDir), `artifact path not directory: ${artifactDir}`);

  const provenancePath = join(artifactDir, "provenance.json");
  assert(existsSync(provenancePath), `provenance.json missing in ${artifactDir}`);

  const provenance = loadJson<RcProvenance>(provenancePath);
  assert(provenance.rcProvenanceVersion === 1, `unsupported rcProvenanceVersion: ${provenance.rcProvenanceVersion}`);
  assert(
    provenance.commitSha === commitSha,
    `commitSha mismatch: provenance=${provenance.commitSha} expected=${commitSha}`,
  );

  const manifestPath = join(artifactDir, "manifest.json");
  const supportPath = join(artifactDir, "support_manifest.json");
  assert(existsSync(manifestPath), "artifact missing manifest.json");
  assert(existsSync(supportPath), "artifact missing support_manifest.json");

  const recomputedManifestSha = computeManifestSha256(manifestPath);
  const recomputedSupportSha = computeSupportManifestSha256(supportPath);
  const recomputedArtifactDigest = computeDirectoryDigest(artifactDir);

  assert(
    recomputedManifestSha === provenance.manifestDigest,
    `manifest digest mismatch: provenance=${provenance.manifestDigest} recomputed=${recomputedManifestSha}`,
  );
  assert(
    recomputedSupportSha === provenance.supportManifestDigest,
    `support manifest digest mismatch: provenance=${provenance.supportManifestDigest} recomputed=${recomputedSupportSha}`,
  );
  assert(
    recomputedArtifactDigest === provenance.rcArtifactDigest,
    `artifact digest mismatch: provenance=${provenance.rcArtifactDigest} recomputed=${recomputedArtifactDigest}`,
  );

  if (expectedDigest) {
    assert(
      provenance.rcArtifactDigest === expectedDigest,
      `expected digest mismatch: expected=${expectedDigest} provenance=${provenance.rcArtifactDigest}`,
    );
  }

  if (expectedTag) {
    assert(
      provenance.tag === expectedTag,
      `tag mismatch: provenance=${provenance.tag} expected=${expectedTag}`,
    );
  }

  process.stdout.write("RC_PROVENANCE_VERIFY_OK\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
