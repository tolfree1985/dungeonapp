import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export type RcProvenance = {
  rcProvenanceVersion: 1;
  commit?: string;
  commitSha: string;
  artifactDigest?: string;
  rcArtifactDigest: string;
  manifestDigest: string;
  supportManifestDigest: string;
  tag?: string | null;
  tagName?: string | null;
  createdAtIso: string;
};

export function computeFileDigest(path: string): string {
  const bytes = readFileSync(path);
  return createHash("sha256").update(bytes).digest("hex");
}

export function computeManifestSha256(manifestPath: string): string {
  return computeFileDigest(manifestPath);
}

export function computeSupportManifestSha256(supportPath: string): string {
  return computeFileDigest(supportPath);
}

export function computeManifestDigests(artifactDir: string): { manifestDigest: string; supportManifestDigest: string } {
  const manifestPath = join(artifactDir, "manifest.json");
  const supportPath = join(artifactDir, "support_manifest.json");
  return {
    manifestDigest: computeManifestSha256(manifestPath),
    supportManifestDigest: computeSupportManifestSha256(supportPath),
  };
}
