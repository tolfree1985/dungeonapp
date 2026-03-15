export type SceneCanonicalTagPolicy = {
  includeMotifTagsInCanonical?: boolean;
  includeThreatFramingInCanonical?: boolean;
  includeRevealStructureInCanonical?: boolean;
};

export type SceneCanonicalTagResult = {
  promptFramingTags: string[];
  motifTags: string[];
  threatFramingTags: string[];
  revealStructureTags: string[];
  combinedTags: string[];
};

export const DEFAULT_SCENE_CANONICAL_TAG_POLICY: SceneCanonicalTagPolicy = {
  includeMotifTagsInCanonical: true,
  includeThreatFramingInCanonical: false,
  includeRevealStructureInCanonical: false,
};

function uniqueOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildSceneCanonicalTags(args: {
  promptFramingTags?: string[];
  motifTags?: string[];
  threatFramingTags?: string[];
  revealStructureTags?: string[];
  tagPolicy?: SceneCanonicalTagPolicy;
}): SceneCanonicalTagResult {
  const promptTags = uniqueOrdered(args.promptFramingTags ?? []);
  const motifInclude = args.tagPolicy?.includeMotifTagsInCanonical ?? true;
  const motifTags = motifInclude ? uniqueOrdered(args.motifTags ?? []) : [];
  const threatInclude = args.tagPolicy?.includeThreatFramingInCanonical ?? false;
  const threatTags = threatInclude ? uniqueOrdered(args.threatFramingTags ?? []) : [];
  const revealInclude = args.tagPolicy?.includeRevealStructureInCanonical ?? false;
  const revealTags = revealInclude ? uniqueOrdered(args.revealStructureTags ?? []) : [];
  const combinedTags = uniqueOrdered([...promptTags, ...motifTags, ...threatTags, ...revealTags]);
  return {
    promptFramingTags: promptTags,
    motifTags,
    threatFramingTags: threatTags,
    revealStructureTags: revealTags,
    combinedTags,
  };
}
