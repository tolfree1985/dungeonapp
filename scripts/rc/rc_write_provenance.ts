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
      return input.map((v) => normalize(v));
    }
    if (input && typeof input === "object") {
      const obj = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) {
        out[k] = normalize(obj[k]);
      }
      return out;
    }
    return input;
  };
  return JSON.stringify(normalize(value), null, 2);
}

function readOptionalArg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function gitCommitDate(commit: string): string {
  const res = spawnSync("git", ["show", "-s", "--format=%cI", commit], {
    encoding: "utf8",
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`git show failed: ${res.stderr?.trim() ?? "unknown error"}`);
  }
  return res.stdout.trim() || "1970-01-01T00:00:00Z";
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

  // Load existing provenance if present
  if (existsSync(provenancePath)) {
    const loaded = JSON.parse(readFileSync(provenancePath, "utf8")) as RcProvenance;

    if (loaded.commitSha !== commit && loaded.commit !== commit) {
      throw new Error(
        `existing provenance commit mismatch: found=${loaded.commitSha ?? loaded.commit}`
      );
    }

    if (
      loaded.manifestDigest !== manifestDigest ||
      loaded.supportManifestDigest !== supportManifestDigest
    ) {
      throw new Error(`existing provenance digest mismatch`);
    }

    existing = loaded;
    createdAtIso = loaded.createdAtIso;
  }

  // Always use commitSha (required by rc_verify_provenance.ts)
  const provenance: RcProvenance = existing
    ? {
        ...existing,
        commitSha: commit,
        tag: tag ?? existing.tag,
        rcArtifactDigest: artifactDigest,
      }
    : {
        rcProvenanceVersion: 1,
        commit,            // legacy field
        commitSha: commit, // REQUIRED
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

  // Write provenance.json
  writeFileSync(provenancePath, stableStringify(provenance) + "\n", "utf8");
  console.log("RC_PROVENANCE_WRITTEN");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});