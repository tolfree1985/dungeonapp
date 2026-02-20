import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mustGetArg } from "./_cli";
import path from "node:path";

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const keyDir = mustGetArg("--out");
  ensureDir(keyDir);
  const privateKeyPath = path.join(keyDir, "release_signing_key.pem");
  const publicKeyPath = path.join(keyDir, "release_signing_key.pub.pem");
  if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
    console.log("SIGNING_KEY_EXISTS");
    return;
  }

  const gen = spawnSync("openssl", ["genpkey", "-algorithm", "Ed25519", "-out", privateKeyPath], {
    stdio: "inherit",
  });
  if (gen.status !== 0) {
    throw new Error("openssl genpkey failed");
  }

  const pub = spawnSync("openssl", ["pkey", "-in", privateKeyPath, "-pubout", "-out", publicKeyPath], {
    stdio: "inherit",
  });
  if (pub.status !== 0) {
    throw new Error("openssl pkey -pubout failed");
  }

  writeFileSync(publicKeyPath, `${readFileSync(publicKeyPath, "utf8").trim()}\n`, "utf8");
  console.log("SIGNING_KEY_GENERATED");
}

main();
