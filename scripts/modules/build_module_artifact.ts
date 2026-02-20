import { existsSync, readFileSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

function mustGetArg(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0) throw new Error(`Missing flag: ${flag}`);
  return process.argv[i + 1];
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8"));
}

function sha256buf(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const moduleDir = mustGetArg("--module-dir");
  const outRoot = mustGetArg("--out");

  const manifestPath = path.join(moduleDir, "module_manifest.json");
  if (!existsSync(manifestPath)) throw new Error("module_manifest.json missing");

  const manifest = loadJson<any>(manifestPath);

  const outDir = path.join(outRoot, manifest.moduleName, manifest.moduleVersion);
  mkdirSync(outDir, { recursive: true });

  cpSync(moduleDir, outDir, { recursive: true });

  const tarPath = path.join(outDir, "module.tar.gz");
  execSync(
    `tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 -czf "${tarPath}" -C "${outDir}" .`,
    { stdio: "inherit" }
  );

  const digest = sha256buf(readFileSync(tarPath));
  writeFileSync(path.join(outDir, "module_digest.txt"), digest);

  process.stdout.write("MODULE_ARTIFACT_OK\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
