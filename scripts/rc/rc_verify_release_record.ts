import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mustGetArg } from "./_cli";
import { computeDirectoryDigest } from "./_artifact_digest";
import { computeManifestDigests } from "./_provenance_types";
import type { RcReleaseRecord } from "./_release_record_types";

function optionalArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const artifactDir = mustGetArg("--artifact");
  const recordPath = optionalArg("--record") ?? join(artifactDir, "release_record.json");
  const commitSha = mustGetArg("--commit");
  const expectedTag = optionalArg("--tag");
  const expectedDigest = optionalArg("--expected-digest");

  assert(existsSync(artifactDir), `artifact dir missing: ${artifactDir}`);
  assert(existsSync(recordPath), `release record missing: ${recordPath}`);

  const record = loadJson<RcReleaseRecord>(recordPath);
  assert(record.releaseRecordVersion === 1, `unsupported releaseRecordVersion: ${record.releaseRecordVersion}`);
  assert(record.commitSha === commitSha, "release record commit mismatch");
  if (expectedTag) {
    assert(record.tagName === expectedTag, "release record tag mismatch");
  }
  if (expectedDigest) {
    assert(record.rcArtifactDigest === expectedDigest, "release record digest mismatch");
  }

  const artifactDigest = computeDirectoryDigest(artifactDir);
  const { manifestDigest, supportManifestDigest } = computeManifestDigests(artifactDir);
  assert(record.rcArtifactDigest === artifactDigest, "release record artifact digest mismatch");
  assert(record.manifestSha256 === manifestDigest, "release record manifest digest mismatch");
  assert(record.supportManifestSha256 === supportManifestDigest, "release record support manifest digest mismatch");

  const provenancePath = join(artifactDir, record.provenanceFile);
  assert(existsSync(provenancePath), "provenance reference missing from release record");

  const verifyArgs = [
    "--import",
    "tsx",
    "scripts/rc/rc_verify_provenance.ts",
    "--artifact",
    artifactDir,
    "--commit",
    commitSha,
    "--expected-digest",
    record.rcArtifactDigest,
  ];
  if (record.tagName) {
    verifyArgs.push("--tag", record.tagName);
  }
  const verify = spawnSync(process.execPath, verifyArgs, {
    stdio: "inherit",
    env: process.env,
  });

  assert(verify.status === 0, "rc_verify_provenance failed while validating release record");

  console.log("RELEASE_RECORD_VERIFY_OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
