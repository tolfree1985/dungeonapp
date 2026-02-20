import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mustGetArg } from "../rc/_cli";

function stableStringify(value: unknown): string {
  const normalize = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(normalize);
    const out: Record<string, unknown> = {};
    Object.keys(v)
      .sort()
      .forEach((key) => {
        out[key] = normalize(v[key]);
      });
    return out;
  };
  return JSON.stringify(normalize(value), null, 2) + "\n";
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function signFile(file: string, key: string, out: string) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/rc/sign_file.ts", "--file", file, "--key", key, "--out", out],
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

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function listSorted(dir: string): string[] {
  return fs.readdirSync(dir).filter((name) => !name.startsWith(".")).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function build_registry_index(args: {
  registryDir: string;
  pubKey: string;
  signingKey?: string;
  sign?: boolean;
}) {
  const { registryDir, pubKey, signingKey, sign = Boolean(signingKey) } = args;
  ensureDir(registryDir);
  const modules = listSorted(registryDir).filter((name) => fs.statSync(path.join(registryDir, name)).isDirectory());

  const catalog: Record<string, { versions: Record<string, { sha256: string; path: string; sig: string }> }> = {};

  for (const mod of modules) {
    const moduleDir = path.join(registryDir, mod);
    const versions = listSorted(moduleDir).filter((file) => file.endsWith(".json") && file !== "index.json");
    const versionMap: Record<string, { sha256: string; path: string; sig: string }> = {};
    for (const file of versions) {
      const version = file.replace(/\.json$/, "");
      const jsonPath = path.join(moduleDir, file);
      const sigPath = path.join(moduleDir, `${version}.json.sig`);
      if (!fs.existsSync(sigPath)) throw new Error(`MISSING_SIG ${sigPath}`);
      verifySignature(jsonPath, sigPath, pubKey);
      const bytes = fs.readFileSync(jsonPath);
      versionMap[version] = {
        sha256: sha256(bytes),
        path: path.posix.join("registry", mod, file),
        sig: path.posix.join("registry", mod, `${version}.json.sig`),
      };
    }
    catalog[mod] = { versions: versionMap };
  }

  const index = {
    schemaVersion: 1,
    generatedAt: null,
    modules: catalog,
  };
  const bytes = Buffer.from(stableStringify(index), "utf8");
  const indexPath = path.join(registryDir, "index.json");
  const sigPath = path.join(registryDir, "index.json.sig");
  const wrote = !fs.existsSync(indexPath);
  if (wrote) {
    fs.writeFileSync(indexPath, bytes);
  } else {
    const existing = fs.readFileSync(indexPath);
    if (!existing.equals(bytes)) throw new Error("IMMUTABLE_INDEX_MISMATCH");
  }
  if (sign) {
    if (!signingKey) throw new Error("SIGNING_KEY_REQUIRED");
    if (wrote || !fs.existsSync(sigPath)) {
      signFile(indexPath, signingKey, sigPath);
    }
    verifySignature(indexPath, sigPath, pubKey);
  }
  console.log("REGISTRY_INDEX_OK");
  return { indexPath, sigPath: sign ? sigPath : undefined, sha256: sha256(bytes) };
}

function main() {
  const registryDir = mustGetArg("--registry");
  const pubKey = mustGetArg("--pub");
  const signingKey = process.argv.includes("--sign-index") ? mustGetArg("--key") : undefined;
  build_registry_index({ registryDir, pubKey, signingKey, sign: Boolean(signingKey) });
}

if (process.argv[1].endsWith("build_registry_index.ts")) {
  main();
}
