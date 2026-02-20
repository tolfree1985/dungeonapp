// verifier/verify_signature.js
// Deterministic external signature verifier for DungeonPP release pipeline.
// Emits only:
//   EXTERNAL_VERIFY_OK
//   EXTERNAL_VERIFY_FAILED
//
// No timestamps, no stack traces, no nondeterministic output.

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

function mustGetArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.log("EXTERNAL_VERIFY_FAILED");
    process.exit(1);
  }
  return process.argv[idx + 1];
}

function main() {
  const filePath = path.resolve(mustGetArg("--file"));
  const sigPath = path.resolve(mustGetArg("--sig"));
  const pubPath = path.resolve(mustGetArg("--pub"));

  let dataBuf, sigBuf, pubKeyPem;

  try {
    // Raw deterministic reads (no encoding conversions unless needed)
    dataBuf = fs.readFileSync(filePath);
    const sigTxt = fs.readFileSync(sigPath, "utf8").trim();
    sigBuf = Buffer.from(sigTxt, "base64");
    pubKeyPem = fs.readFileSync(pubPath, "utf8");
  } catch (_err) {
    console.log("EXTERNAL_VERIFY_FAILED");
    process.exit(1);
  }

  let ok = false;

  try {
    // Ed25519 verification is deterministic. Hash parameter = null.
    ok = crypto.verify(
      null,
      dataBuf,
      { key: pubKeyPem, dsaEncoding: "ieee-p1363" },
      sigBuf
    );
  } catch (_err) {
    console.log("EXTERNAL_VERIFY_FAILED");
    process.exit(1);
  }

  if (ok) {
    console.log("EXTERNAL_VERIFY_OK");
    process.exit(0);
  } else {
    console.log("EXTERNAL_VERIFY_FAILED");
    process.exit(1);
  }
}

main();
