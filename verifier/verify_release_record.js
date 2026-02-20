const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { loadJson } = require("./loadJson");
const { hashFile, computeDirectoryDigest } = require("./digest");

function mustGetArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`Missing required ${flag}`);
  }
  return process.argv[idx + 1];
}

function optionalArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function assert(cond, message) {
  if (!cond) {
    console.error(message);
    process.exit(1);
  }
}

function main() {
  const artifactDir = path.resolve(mustGetArg("--artifact"));
  const recordPath = path.resolve(optionalArg("--record") ?? path.join(artifactDir, "release_record.json"));
  const commitSha = mustGetArg("--commit");
  const expectedTag = optionalArg("--tag");
  const expectedDigest = optionalArg("--expected-digest");

  assert(fsExists(recordPath), `release record missing: ${recordPath}`);

  const record = loadJson(recordPath);
  assert(record.releaseRecordVersion === 1, "unsupported releaseRecordVersion");
  assert(record.commitSha === commitSha, "release record commit mismatch");
  if (expectedTag) {
    assert(record.tagName === expectedTag, "release record tag mismatch");
  }
  if (expectedDigest) {
    assert(record.rcArtifactDigest === expectedDigest, "release record digest mismatch");
  }

  const manifestPath = path.join(artifactDir, "manifest.json");
  const supportPath = path.join(artifactDir, "support_manifest.json");
  assert(fsExists(manifestPath), "manifest.json missing");
  assert(fsExists(supportPath), "support_manifest.json missing");

  const manifestDigest = hashFile(manifestPath);
  const supportDigest = hashFile(supportPath);
  const artifactDigest = computeDirectoryDigest(artifactDir);

  assert(record.rcArtifactDigest === artifactDigest, "release record artifact digest mismatch");
  assert(record.manifestSha256 === manifestDigest, "release record manifest digest mismatch");
  assert(record.supportManifestSha256 === supportDigest, "release record support manifest digest mismatch");

  const provPath = path.join(artifactDir, record.provenanceFile);
  assert(fsExists(provPath), "provenance file missing from release record");

  const verifyArgs = [
    path.join(__dirname, "verify_provenance.js"),
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

  assert(verify.status === 0, "verify_provenance failed while validating release record");

  console.log("VERIFY_RELEASE_RECORD_OK");
}

function fsExists(p) {
  try {
    require("fs").accessSync(p);
    return true;
  } catch (err) {
    return false;
  }
}

main();
