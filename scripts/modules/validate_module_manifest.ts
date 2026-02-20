import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function mustGetArg(flag: string): string {
  const i = process.argv.indexOf(flag);
  if (i < 0) throw new Error(`Missing required flag: ${flag}`);
  return process.argv[i + 1];
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8"));
}

async function main() {
  const moduleDir = mustGetArg("--module-dir");
  const manifestPath = join(moduleDir, "module_manifest.json");

  assert(existsSync(manifestPath), `module_manifest.json missing: ${manifestPath}`);

  const manifest = loadJson<any>(manifestPath);

  assert(manifest.moduleManifestVersion === 1, "moduleManifestVersion must be 1");
  assert(typeof manifest.moduleName === "string", "moduleName must be a string");
  assert(typeof manifest.moduleVersion === "string", "moduleVersion must be a string");
  assert(typeof manifest.entrypoint === "string", "entrypoint must be a string");

  const entryPath = join(moduleDir, manifest.entrypoint);
  assert(existsSync(entryPath), `Entrypoint does not exist: ${entryPath}`);

  process.stdout.write("MODULE_MANIFEST_OK\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
