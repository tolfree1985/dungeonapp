import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function verifySig(file: string, sig: string, pub: string) {
  execFileSync(
    process.execPath,
    ["verifier/verify_signature.js", "--file", file, "--sig", sig, "--pub", pub],
    { stdio: "inherit" }
  );
}

function main() {
  const repo = process.cwd();
  const moduleDir = path.join(repo, "modules", "example");
  const pubKey = path.join(repo, ".local_keys", "release_signing_key.pub.pem");

  assert(fs.existsSync(moduleDir), "moduleDir missing");
  assert(fs.existsSync(pubKey), "pub key missing");

  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/publish-module.ts",
      "--module-dir",
      moduleDir,
      "--out",
      path.join(repo, "dist-modules"),
      "--pub",
      pubKey,
      "--registry",
      path.join(repo, "registry"),
      "--key",
      path.join(repo, ".local_keys", "release_signing_key.pem"),
      "--sign-index",
    ],
    { stdio: "inherit" }
  );

  const manifest = JSON.parse(fs.readFileSync(path.join(moduleDir, "module_manifest.json"), "utf8"));
  const name = String(manifest.moduleName ?? manifest.name);
  const version = String(manifest.moduleVersion ?? manifest.version);
  assert(name && version, "manifest missing name or version");

  const dist = path.join(repo, "dist-modules", name, version);
  const registryDir = path.join(repo, "registry");

  const files = [
    path.join(dist, "module.tar.gz"),
    path.join(dist, "module.tar.gz.sig"),
    path.join(dist, "module.tar.gz.sha256"),
    path.join(dist, "module.tar.gz.sha256.sig"),
    path.join(dist, "trust_root.pub"),
  ];
  for (const file of files) {
    assert(fs.existsSync(file), `missing ${file}`);
  }

  verifySig(files[0], files[1], pubKey);
  verifySig(files[2], files[3], pubKey);

  const entryJson = path.join(registryDir, name, `${version}.json`);
  const entrySig = path.join(registryDir, name, `${version}.json.sig`);
  assert(fs.existsSync(entryJson), "registry entry missing");
  assert(fs.existsSync(entrySig), "entry signature missing");
  verifySig(entryJson, entrySig, pubKey);

  const indexJson = path.join(registryDir, "index.json");
  const indexSig = path.join(registryDir, "index.json.sig");
  assert(fs.existsSync(indexJson), "index missing");
  assert(fs.existsSync(indexSig), "index sig missing");
  verifySig(indexJson, indexSig, pubKey);

  console.log("TEST_PUBLISH_MODULE_OK");
}

main();
