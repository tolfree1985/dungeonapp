import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mustGetArg } from "../rc/_cli";

type EntryArgs = {
  registryDir: string;
  distDir: string; // dist-modules/<name>/<version>
  moduleName: string;
  moduleVersion: string;
  signingKey: string; // private key
  pubKey: string; // public key
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function stableJSONObject(obj: Record<string, unknown>): string {
  const normalize = (value: any): any => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(normalize);
    const result: Record<string, unknown> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        result[key] = normalize(value[key]);
      });
    return result;
  };
  return JSON.stringify(normalize(obj), null, 2) + "\n";
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function signFile(input: string, key: string, out: string) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/rc/sign_file.ts", "--file", input, "--key", key, "--out", out],
    { stdio: "inherit" }
  );
}

function verifySignature(file: string, sig: string, pub: string) {
  execFileSync(
    process.execPath,
    ["verifier/verify_signature.js", "--file", file, "--sig", sig, "--pub", pub],
    { stdio: "inherit" }
  );
}

function ensureDir(target: string) {
  fs.mkdirSync(target, { recursive: true });
}

function readFileText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function parseSha256File(contents: string): string {
  const trimmed = contents.trim();
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(trimmed);
  if (!match) throw new Error(`BAD_SHA256_FORMAT ${trimmed}`);
  return match[1].toLowerCase();
}

function writeImmutable(pathName: string, data: Buffer) {
  if (fs.existsSync(pathName)) {
    const existing = fs.readFileSync(pathName);
    if (!existing.equals(data)) {
      throw new Error(`IMMUTABLE_MISMATCH ${pathName}`);
    }
    return false;
  }
  fs.writeFileSync(pathName, data);
  return true;
}

export function write_registry_entry(args: EntryArgs) {
  const { registryDir, distDir, moduleName, moduleVersion, signingKey, pubKey } = args;
  const tar = path.join(distDir, "module.tar.gz");
  const tarSig = path.join(distDir, "module.tar.gz.sig");
  const sha = path.join(distDir, "module.tar.gz.sha256");
  const shaSig = path.join(distDir, "module.tar.gz.sha256.sig");

  assert(fs.existsSync(tar), "MISSING_TARBALL");
  assert(fs.existsSync(tarSig), "MISSING_TARBALL_SIG");
  assert(fs.existsSync(sha), "MISSING_SHA");
  assert(fs.existsSync(shaSig), "MISSING_SHA_SIG");

  verifySignature(tar, tarSig, pubKey);
  verifySignature(sha, shaSig, pubKey);

  const tarBytes = fs.readFileSync(tar);
  const computedTarSha = sha256(tarBytes);
  const declaredSha = parseSha256File(readFileText(sha));
  assert(declaredSha === computedTarSha, "SHA_MISMATCH");

  const entry = {
    moduleName,
    moduleVersion,
    artifact: {
      tar: {
        path: path.posix.join("dist-modules", moduleName, moduleVersion, "module.tar.gz"),
        sha256: computedTarSha,
        sig: path.posix.join("dist-modules", moduleName, moduleVersion, "module.tar.gz.sig"),
      },
      sha256File: {
        path: path.posix.join("dist-modules", moduleName, moduleVersion, "module.tar.gz.sha256"),
        sig: path.posix.join("dist-modules", moduleName, moduleVersion, "module.tar.gz.sha256.sig"),
      },
    },
    generatedAt: null,
    schemaVersion: 1,
  };

  const body = Buffer.from(stableJSONObject(entry), "utf8");
  const entryHash = sha256(body);

  const moduleRegistryDir = path.join(registryDir, moduleName);
  ensureDir(moduleRegistryDir);
  const entryPath = path.join(moduleRegistryDir, `${moduleVersion}.json`);
  const entrySigPath = path.join(moduleRegistryDir, `${moduleVersion}.json.sig`);

  const wrote = writeImmutable(entryPath, body);
  if (wrote) {
    signFile(entryPath, signingKey, entrySigPath);
  }
  verifySignature(entryPath, entrySigPath, pubKey);

  console.log("REGISTRY_ENTRY_OK");
  return { entryPath, entrySigPath, entryHash };
}

function main() {
  const registryDir = mustGetArg("--registry");
  const distDir = mustGetArg("--dist");
  const moduleName = mustGetArg("--name");
  const moduleVersion = mustGetArg("--version");
  const pubKey = mustGetArg("--pub");
  const signingKey = mustGetArg("--key");

  write_registry_entry({ registryDir, distDir, moduleName, moduleVersion, pubKey, signingKey });
}

if (process.argv[1].endsWith("write_registry_entry.ts")) {
  main();
}
