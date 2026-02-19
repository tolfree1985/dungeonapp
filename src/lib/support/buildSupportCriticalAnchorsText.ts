export function buildSupportCriticalAnchorsText(args: {
  manifestHash: string;
  packageHash: string;
  finalStateHash: string;
  driftSeverity: string;
}): string {
  return [
    `MANIFEST_HASH: ${args.manifestHash || "(none)"}`,
    `PACKAGE_HASH: ${args.packageHash || "(none)"}`,
    `FINAL_STATE_HASH: ${args.finalStateHash || "(none)"}`,
    `DRIFT_SEVERITY: ${args.driftSeverity || "(none)"}`,
  ].join("\n");
}
