export type DeltaPathMeaning = {
  category: "inventory" | "stat" | "relationship";
  label: string;
  keywords: string[];
};

export const DELTA_PATH_MEANING_MAP: DeltaPathMeaning[] = [
  {
    category: "inventory",
    label: "inventory",
    keywords: ["inventory", "item", "bag", "loot"],
  },
  {
    category: "stat",
    label: "stat",
    keywords: ["stat", "hp", "health", "xp", "level"],
  },
  {
    category: "relationship",
    label: "relationship",
    keywords: ["relationship", "relation", "trust", "affinity"],
  },
];

export function categorizeDeltaPath(path: string): string[] {
  const lowered = path.toLowerCase();
  if (!lowered) return [];

  const hits: string[] = [];
  for (const mapping of DELTA_PATH_MEANING_MAP) {
    if (mapping.keywords.some((keyword) => lowered.includes(keyword))) {
      hits.push(mapping.label);
    }
  }
  return hits;
}
