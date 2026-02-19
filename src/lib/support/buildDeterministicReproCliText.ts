export function buildDeterministicReproCliText(args: {
  bundleId: string;
  engineVersion: string;
  scenarioContentHash: string;
}): string {
  const bundleId = args.bundleId.trim() || "(none)";
  const engineVersion = args.engineVersion.trim() || "(none)";
  const scenarioContentHash = args.scenarioContentHash.trim() || "(none)";

  return [
    "node --import tsx scripts/replay-from-bundle.ts \\",
    `  --bundle-id=${bundleId} \\`,
    `  --engine=${engineVersion} \\`,
    `  --scenario-hash=${scenarioContentHash}`,
  ].join("\n");
}
