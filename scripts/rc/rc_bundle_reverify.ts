import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mustGetArg } from "./_cli";
import { computeDirectoryDigest } from "./_artifact_digest";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function readOptionalArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

async function main(): Promise<void> {
  const artifactPath = mustGetArg("--artifact");
  const expectedDigest = readOptionalArg("--expected-digest");

  assert(existsSync(artifactPath), `RC artifact path does not exist: ${artifactPath}`);
  assert(statSync(artifactPath).isDirectory(), `RC artifact path is not a directory: ${artifactPath}`);

  const verifyScript = join(process.cwd(), "scripts", "rc", "rc_bundle_verify.ts");
  assert(existsSync(verifyScript), "Missing scripts/rc/rc_bundle_verify.ts");

  const verifyResult = spawnSync(process.execPath, ["--import", "tsx", verifyScript, "--bundle", artifactPath], {
    stdio: "inherit",
    env: process.env,
  });
  assert(verifyResult.status === 0, `RC verifier failed with exit code ${String(verifyResult.status)}`);

  const digest = computeDirectoryDigest(artifactPath);
  process.stdout.write(`RC_ARTIFACT_DIGEST=${digest}\n`);

  if (expectedDigest !== null && expectedDigest.length > 0) {
    assert(
      digest === expectedDigest,
      `RC artifact digest mismatch: expected=${expectedDigest} actual=${digest}`,
    );
  }

  process.stdout.write("RC_BUNDLE_REVERIFY_OK\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
