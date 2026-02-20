import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function must(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0) throw new Error(`Missing flag: ${flag}`);
  return process.argv[i + 1];
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

  run(["--import", "tsx", "scripts/modules/validate_module_manifest.ts", "--module-dir", moduleDir]);
  run(["--import", "tsx", "scripts/modules/build_module_artifact.ts", "--module-dir", moduleDir, "--out", outRoot]);

  const manifest = JSON.parse(readFileSync(join(moduleDir, "module_manifest.json"), "utf8"));
  const builtDir = join(outRoot, manifest.moduleName, manifest.moduleVersion);
  const tarPath = join(builtDir, "module.tar.gz");

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

  run([
    "verifier/verify_signature.js",
    "--file",
    tarPath,
    "--sig",
    `${tarPath}.sig`,
    "--pub",
    pubKey,
  ]);

  run([
    "--import",
    "tsx",
    "scripts/rc/sign_file.ts",
    "--file",
    join(outRoot, manifest.moduleName, manifest.moduleVersion, "module_digest.txt"),
    "--key",
    ".local_keys/release_signing_key.pem",
    "--out",
    join(outRoot, manifest.moduleName, manifest.moduleVersion, "module_digest.txt.sig"),
  ]);

  process.stdout.write("PUBLISH_READY\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
