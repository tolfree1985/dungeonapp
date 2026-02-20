import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mustGetArg } from "./_cli";
import { RcProvenance } from "./_provenance_types";
import { computeManifestSha256, computeSupportManifestSha256 } from "./_provenance_types";
import { computeArtifactDigest } from "./_artifact_digest";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

async function main() {
  const artifactDir = mustGetArg("--artifact");
  const commitSha = mustGetArg("--commit");

  const provPath = join(artifactDir, "provenance.json");
  assert(existsSync(provPath), `Missing provenance.json in artifact: ${provPath}`);

  const provenance = loadJson<RcProvenance>(provPath);
  assert(
    provenance.commitSha === commitSha,
    `commitSha mismatch: provenance=${provenance.commitSha} expected=${commitSha}`
  );

  const manifestPath = join(artifactDir, "manifest.json");
  const supportPath = join(artifactDir, "support_manifest.json");
  assert(existsSync(manifestPath), "Artifact missing manifest.json");
  assert(existsSync(supportPath), "Artifact missing support_manifest.json");

  const manifestSha = computeManifestSha256(manifestPath);
  const supportSha = computeSupportManifestSha256(supportPath);
  const artifactDigest = computeArtifactDigest(artifactDir);
  assert(
    provenance.rcArtifactDigest === artifactDigest,
    "provenance digest mismatch when generating release record"
  );

  const record = {
    releaseRecordVersion: 1,
    commitSha,
    tagName: provenance.tagName ?? null,
    rcArtifactDigest: artifactDigest,
    manifestSha256: manifestSha,
    supportManifestSha256: supportSha,
    createdAtIso: provenance.createdAtIso,
    provenanceFile: "provenance.json",
  };

  const ordered = {
    releaseRecordVersion: record.releaseRecordVersion,
    commitSha: record.commitSha,
    tagName: record.tagName,
    rcArtifactDigest: record.rcArtifactDigest,
    manifestSha256: record.manifestSha256,
    supportManifestSha256: record.supportManifestSha256,
    createdAtIso: record.createdAtIso,
    provenanceFile: record.provenanceFile,
  };

  const outPath = join(artifactDir, "release_record.json");
  writeFileSync(outPath, `${JSON.stringify(ordered, Object.keys(ordered).sort(), 2)}\n`, "utf8");
  process.stdout.write("RC_RELEASE_RECORD_OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
