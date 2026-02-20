import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function must(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0) throw new Error(`Missing flag: ${flag}`);
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return v;
}

function run(args: string[]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}`);
  }
}

async function main() {
  const moduleDir = must("--module-dir");
  const outRoot = must("--out");
  const pubKey = must("--pub");

  // Ensure output root directory exists
  mkdirSync(outRoot, { recursive: true });

  // 1. Validate manifest
  run([
    "--import",
    "tsx",
    "scripts/modules/validate_module_manifest.ts",
    "--module-dir",
    moduleDir,
  ]);

  // 2. Build module artifact
  run([
    "--import",
    "tsx",
    "scripts/modules/build_module_artifact.ts",
    "--module-dir",
    moduleDir,
    "--out",
    outRoot,
  ]);

  // 3. Read manifest to know final build output location
  const manifestPath = join(moduleDir, "module_manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const name: string | undefined = manifest.moduleName ?? manifest.name;
  const version: string | undefined = manifest.moduleVersion ?? manifest.version;

  if (!name || typeof name !== "string") {
    throw new Error("manifest missing moduleName/name (string)");
  }
  if (!version || typeof version !== "string") {
    throw new Error("manifest missing moduleVersion/version (string)");
  }

  const builtDir = join(outRoot, name, version);
  const tarPath = join(builtDir, "module.tar.gz");
  const digestPath = join(builtDir, "module.tar.gz.sha256");

  if (!existsSync(tarPath)) {
    throw new Error(`Missing artifact at: ${tarPath}`);
  }
  if (!existsSync(digestPath)) {
    throw new Error(`Missing digest file at: ${digestPath}`);
  }

  // 4. Sign the tarball
  run([
    "--import",
    "tsx",
    "scripts/rc/sign_file.ts",
    "--file",
    tarPath,
    "--key",
    ".local_keys/release_signing_key.pem",
    "--out",
    `${tarPath}.sig`,
  ]);

  // 5. Verify tarball signature
  run([
    "verifier/verify_signature.js",
    "--file",
    tarPath,
    "--sig",
    `${tarPath}.sig`,
    "--pub",
    pubKey,
  ]);

  // 6. Sign the digest file
  run([
    "--import",
    "tsx",
    "scripts/rc/sign_file.ts",
    "--file",
    digestPath,
    "--key",
    ".local_keys/release_signing_key.pem",
    "--out",
    `${digestPath}.sig`,
  ]);

  process.stdout.write("PUBLISH_READY\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});