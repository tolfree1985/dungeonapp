export type ScenarioV1 = Record<string, unknown>;

export function normalizeScenarioContent(contentJson: unknown, id?: string): ScenarioV1 {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    throw new Error(`Invalid scenario content${id ? ` for scenario ${id}` : ""}`);
  }
  return contentJson as ScenarioV1;
}
