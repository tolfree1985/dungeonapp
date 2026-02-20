const path = require("path");
const { computeDirectoryDigest } = require("./digest");

function mustGetArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`Missing required ${flag}`);
  }
  return process.argv[idx + 1];
}

function assert(cond, message) {
  if (!cond) {
    console.error(message);
    process.exit(1);
  }
}

function main() {
  const artifactDir = mustGetArg("--artifact");
  const expectedDigest = mustGetArg("--expected");
  const digest = computeDirectoryDigest(path.resolve(artifactDir));
  assert(digest === expectedDigest, `artifact digest mismatch: expected=${expectedDigest} got=${digest}`);
  console.log("VERIFY_ARTIFACT_DIGEST_OK");
}

main();
