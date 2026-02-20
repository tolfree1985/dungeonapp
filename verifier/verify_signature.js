const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

function mustGetArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required ${flag}`);
    process.exit(1);
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
  const filePath = path.resolve(mustGetArg("--file"));
  const sigPath = path.resolve(mustGetArg("--sig"));
  const pubPath = path.resolve(mustGetArg("--pub"));

  assert(fs.existsSync(filePath), `file missing: ${filePath}`);
  assert(fs.existsSync(sigPath), `signature missing: ${sigPath}`);
  assert(fs.existsSync(pubPath), `public key missing: ${pubPath}`);

  const data = fs.readFileSync(filePath);
  const signature = fs.readFileSync(sigPath, "utf8");
  const pubKey = fs.readFileSync(pubPath, "utf8");
  const verifier = crypto.createVerify("sha512");
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(pubKey, signature, "base64");
  if (!ok) {
    console.error("Signature verification failed");
    process.exit(1);
  }
  console.log("EXTERNAL_VERIFY_OK");
}

setTimeout(main, 0);
