export function buildSupportShareBlockText(args: {
  bundleId: string;
  engineVersion: string;
  scenarioContentHash: string;
  turn: string;
}): string {
  const bundleId = args.bundleId.trim() || "none";
  const engineVersion = args.engineVersion.trim() || "none";
  const scenarioContentHash = args.scenarioContentHash.trim() || "none";
  const turn = args.turn.trim() || "none";

  return [
    `SUPPORT_BUNDLE_ID: ${bundleId}`,
    `ENGINE_VERSION: ${engineVersion}`,
    `SCENARIO_HASH: ${scenarioContentHash}`,
    `TURN: ${turn}`,
  ].join("\n");
}
