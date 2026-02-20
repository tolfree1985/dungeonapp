import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mustGetArg } from "./rc/_cli";
import { computeDirectoryDigest } from "./rc/_artifact_digest";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  const tag = mustGetArg("--tag");
  const commit = mustGetArg("--commit");

  const artifactSrc = path.resolve(".rc", "artifacts", commit);
  assert(existsSync(artifactSrc), `artifact path missing: ${artifactSrc}`);

  const releaseRecordPath = path.join(artifactSrc, "release_record.json");
  assert(existsSync(releaseRecordPath), "artifact missing release_record.json");

  const releaseRecord = JSON.parse(readFileSync(releaseRecordPath, "utf8")) as { tagName?: string | null };
  assert(releaseRecord.tagName === tag, "release record tag mismatch");

  const distDir = path.join("dist", tag);
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const copies = ["provenance.json", "release_record.json", "manifest.json", "support_manifest.json", "audit_summary.json"];
  const optional = new Set(["audit_summary.json"]);
  for (const name of copies) {
    const src = path.join(artifactSrc, name);
    if (!existsSync(src)) {
      if (optional.has(name)) {
        console.warn(`WARN: artifact missing optional ${name}`);
        continue;
      }
      assert(false, `artifact missing ${name}`);
    }
    cpSync(src, path.join(distDir, name));
  }

  const artifactDigest = computeDirectoryDigest(artifactSrc);
  writeFileSync(path.join(distDir, "artifact_digest.txt"), `artifactDigest=${artifactDigest}\n`, "utf8");

  const verifierSrc = path.resolve("verifier");
  assert(existsSync(verifierSrc), "verifier directory missing");
  cpSync(verifierSrc, path.join(distDir, "verifier"), { recursive: true });

  const readme = [
    `Release Audit Package`,
    `Tag: ${tag}`,
    `Commit: ${commit}`,
    `Artifact Digest: ${artifactDigest}`,
    "", // blank line
    "Verification steps:",
    `  node verifier/verify_release_record.js --artifact . --record release_record.json --commit ${commit} --expected-digest ${artifactDigest}`,
    `  node verifier/verify_provenance.js --artifact . --commit ${commit} --expected-digest ${artifactDigest}`,
    `  node verifier/verify_signature.js --file release_record.json --sig release_record.json.sig --pub public_key.txt`,
    `  node verifier/verify_signature.js --file provenance.json --sig provenance.json.sig --pub public_key.txt`,
    `  node verifier/verify_signature.js --file audit_summary.json --sig audit_summary.json.sig --pub public_key.txt`,
    "",
    "All necessary files are included here to verify the release offline.",
  ].join("\n");
  writeFileSync(path.join(distDir, "README_AUDIT.txt"), readme + "\n", "utf8");

  console.log("BUILD_DIST_OK");
}

main();
