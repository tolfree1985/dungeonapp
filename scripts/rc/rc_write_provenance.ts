import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mustGetArg } from "./_cli";
import { computeDirectoryDigest } from "./_artifact_digest";
import type { RcProvenance } from "./_provenance_types";
import { computeManifestDigests } from "./_provenance_types";
import { spawnSync } from "node:child_process";

function stableStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map((entry) => normalize(entry));
    }
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const keys = Object.keys(record).sort();
      for (const key of keys) {
        out[key] = normalize(record[key]);
      }
      return out;
    }
    return input;
  };
  return JSON.stringify(normalize(value), null, 2);
}

function readOptionalArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function gitCommitDate(commit: string): string {
  const result = spawnSync("git", ["show", "-s", "--format=%cI", commit], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`git show failed: ${result.stderr?.trim() ?? "unknown error"}`);
  }
  return result.stdout.trim() || "1970-01-01T00:00:00Z";
}

async function main(): Promise<void> {
  const artifactDir = mustGetArg("--artifact");
  const commit = mustGetArg("--commit");
  const tag = readOptionalArg("--tag");

  if (!existsSync(artifactDir)) {
    throw new Error(`artifact not found: ${artifactDir}`);
  }

  const { manifestDigest, supportManifestDigest } = computeManifestDigests(artifactDir);
  const artifactDigest = computeDirectoryDigest(artifactDir);
  const provenancePath = join(artifactDir, "provenance.json");

  let createdAtIso = gitCommitDate(commit);
  let existing: RcProvenance | null = null;
  if (existsSync(provenancePath)) {
    const loaded = JSON.parse(readFileSync(provenancePath, "utf8")) as RcProvenance;
    if (loaded.commit !== commit) {
      throw new Error(`existing provenance commit ${loaded.commit} differs from ${commit}`);
    }
    if (loaded.manifestDigest !== manifestDigest || loaded.supportManifestDigest !== supportManifestDigest) {
      throw new Error("provenance manifest digests mismatch current artifact");
    }
    existing = loaded;
    createdAtIso = loaded.createdAtIso;
  }

  const provenance: RcProvenance = existing
    ? { ...existing, tag: tag ?? existing.tag, rcArtifactDigest: artifactDigest }
    : {
        rcProvenanceVersion: 1,
        commit,
        artifactDigest,
        manifestDigest,
        supportManifestDigest,
        rcArtifactDigest: artifactDigest,
        tag: tag ?? null,
        createdAtIso,
      };

  if (tag) {
    provenance.tag = tag;
  }

  writeFileSync(provenancePath, `${stableStringify(provenance)}\n`, "utf8");
  console.log("RC_PROVENANCE_WRITTEN");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
