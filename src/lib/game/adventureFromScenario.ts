import type { ScenarioV1 } from "@/lib/scenario/scenarioValidator";

export function buildAdventureStateFromScenario(s: ScenarioV1) {
  const openingPrompt = s.start!.prompt as string;
  const title = typeof (s as any).title === "string" ? (s as any).title : undefined;
  const summary = typeof (s as any).summary === "string" ? (s as any).summary : undefined;

  const base = s.initialState;
  const isPlainObject = typeof base === "object" && base !== null && !Array.isArray(base);

  // persist scenario identity + prompt in _meta (no schema changes)
  const state = isPlainObject
    ? {
        ...(base as Record<string, unknown>),
        _meta: {
          ...(((base as any)._meta as object) ?? {}),
          scenarioId: s.id,
          scenarioTitle: title,
          scenarioSummary: summary,
          openingPrompt,
          memoryCards: s.memoryCards ?? undefined,
          locks: s.locks ?? undefined,
        },
      }
    : {
        _meta: {
          scenarioId: s.id,
          scenarioTitle: title,
          scenarioSummary: summary,
          openingPrompt,
          memoryCards: s.memoryCards ?? undefined,
          locks: s.locks ?? undefined,
        },
        value: base,
      };

  return { state, openingPrompt };
}
