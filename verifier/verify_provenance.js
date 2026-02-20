const fs = require("fs");
const path = require("path");
const { hashFile, computeDirectoryDigest } = require("./digest");
const { loadJson } = require("./loadJson");

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
  const commitSha = mustGetArg("--commit");
  const expectedDigest = optionalArg("--expected-digest");
  const expectedTag = optionalArg("--tag");

  const provPath = path.join(artifactDir, "provenance.json");
  assert(fs.existsSync(provPath), `provenance missing at ${provPath}`);

  const provenance = loadJson(provPath);
  assert(provenance.rcProvenanceVersion === 1, "unsupported rcProvenanceVersion");
  assert(provenance.commitSha === commitSha, "commitSha mismatch in provenance");

  const manifestPath = path.join(artifactDir, "manifest.json");
  const supportPath = path.join(artifactDir, "support_manifest.json");
  assert(fs.existsSync(manifestPath), "manifest.json missing");
  assert(fs.existsSync(supportPath), "support_manifest.json missing");

  const manifestDigest = hashFile(manifestPath);
  const supportDigest = hashFile(supportPath);
  const artifactDigest = computeDirectoryDigest(artifactDir);

  assert(provenance.manifestDigest === manifestDigest, "manifest digest mismatch in provenance");
  assert(provenance.supportManifestDigest === supportDigest, "support manifest digest mismatch in provenance");
  assert(provenance.rcArtifactDigest === artifactDigest, "artifact digest mismatch in provenance");

  if (expectedDigest) {
    assert(provenance.rcArtifactDigest === expectedDigest, "provenance digest diverges from expected digest");
  }

  if (expectedTag) {
    assert(provenance.tag === expectedTag, "provenance tag mismatch");
  }

  console.log("VERIFY_PROVENANCE_OK");
}

main();
