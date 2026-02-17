import fs from "node:fs";
import path from "node:path";

type ScenarioV1 = {
  id: string;
  initialState: unknown;
  start?: { prompt?: string };
  memoryCards?: unknown;
  locks?: unknown;
};

function assertSafeScenarioId(s: string) {
  // keep tight: maps directly to scenarios/<id>.scenario.v1.json
  if (!/^[a-z0-9][a-z0-9\-]{0,63}$/i.test(s)) {
    throw new Error(`Invalid scenarioId: ${s}`);
  }
}

export function loadScenarioV1(scenarioId: string): ScenarioV1 {
  assertSafeScenarioId(scenarioId);
  const file = path.join(process.cwd(), "scenarios", `${scenarioId}.scenario.v1.json`);
  const raw = fs.readFileSync(file, "utf8");
  const s = JSON.parse(raw) as ScenarioV1;

  if (!s || typeof s !== "object") throw new Error(`Scenario ${scenarioId} malformed`);
  if (s.id !== scenarioId) {
    // optional: allow mismatch, but safer to catch wrong file
    throw new Error(`Scenario id mismatch: file=${scenarioId} json.id=${(s as any).id}`);
  }
  if (s.initialState == null) throw new Error(`Scenario ${scenarioId} missing initialState`);
  if (typeof s.start?.prompt !== "string") throw new Error(`Scenario ${scenarioId} missing start.prompt`);

  return s;
}

export function buildAdventureStateFromScenario(s: ScenarioV1) {
  const openingPrompt = s.start!.prompt as string;

  const base = s.initialState;
  const isPlainObject = typeof base === "object" && base !== null && !Array.isArray(base);

  // persist scenario identity + prompt in _meta (no schema changes)
  const state = isPlainObject
    ? {
        ...(base as Record<string, unknown>),
        _meta: {
          ...(((base as any)._meta as object) ?? {}),
          scenarioId: s.id,
          openingPrompt,
          memoryCards: s.memoryCards ?? undefined,
          locks: s.locks ?? undefined,
        },
      }
    : {
        _meta: {
          scenarioId: s.id,
          openingPrompt,
          memoryCards: s.memoryCards ?? undefined,
          locks: s.locks ?? undefined,
        },
        value: base,
      };

  return { state, openingPrompt };
}
