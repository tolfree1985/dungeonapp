export type RcBundleFileMeta = {
  sha256: string;
  bytes: number;
};

export type RcBundleManifest = {
  rcBundleVersion: 1;

  engineVersion: string;

  scenarioId: string;
  scenarioContentHash: string;

  createdAtIso: string;

  adventureId: string;
  seed: string | number;

  turnInputs: Array<{
    turnIndex: number;
    input: unknown;
  }>;

  files: Record<string, RcBundleFileMeta>;
};
