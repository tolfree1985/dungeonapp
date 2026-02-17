import fs from "node:fs";
import path from "node:path";
import type { ScenarioV1 } from "../../schemas/scenario.v1";
import { validateScenarioV1 } from "../../schemas/scenario.v1";

export function loadScenarioById(id: string): ScenarioV1 {
  const dir = path.join(process.cwd(), "scenarios");
  const file = path.join(dir, `${id}.scenario.v1.json`);

  if (!fs.existsSync(file)) throw new Error(`Scenario not found: ${id}`);

  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);

  // Keep runtime safe: validate on load (still deterministic + in-process)
  const res = validateScenarioV1(parsed);
  if (!res.ok) {
    const details = res.issues.map((i) => `${i.path} ${i.code}: ${i.message}`).join("; ");
    throw new Error(`Invalid scenario ${id}: ${details}`);
  }

  return parsed as ScenarioV1;
}
