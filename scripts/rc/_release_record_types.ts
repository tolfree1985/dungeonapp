export type RcReleaseRecord = {
  releaseRecordVersion: 1;
  commitSha: string;
  tagName: string;
  rcArtifactDigest: string;
  manifestSha256: string;
  supportManifestSha256: string;
  createdAtIso: string;
  provenanceFile: string;
};
