import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export type RcProvenance = {
  commit: string;
  artifactDigest: string;
  manifestDigest: string;
  supportManifestDigest: string;
  rcArtifactDigest: string;
  tag?: string;
  createdAtIso: string;
};

export function computeFileDigest(path: string): string {
  const bytes = readFileSync(path);
  return createHash("sha256").update(bytes).digest("hex");
}

export function computeManifestDigests(artifactDir: string): { manifestDigest: string; supportManifestDigest: string } {
  const manifestPath = join(artifactDir, "manifest.json");
  const supportPath = join(artifactDir, "support_manifest.json");
  return {
    manifestDigest: computeFileDigest(manifestPath),
    supportManifestDigest: computeFileDigest(supportPath),
  };
}
