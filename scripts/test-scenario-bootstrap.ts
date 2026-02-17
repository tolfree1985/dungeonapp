import { loadScenarioById } from "../lib/scenario/load-scenario";
import { bootstrapAdventureFromScenario } from "../lib/scenario/bootstrap-adventure";

const scenarioId = process.env.SCENARIO_ID ?? "mystery-docks";
const scenario = loadScenarioById(scenarioId);
const boot = bootstrapAdventureFromScenario(scenario);

if (!boot.openingPrompt || typeof boot.openingPrompt !== "string") {
  throw new Error("Bootstrap failed: missing openingPrompt");
}
if (!boot.state || typeof boot.state !== "object") {
  throw new Error("Bootstrap failed: invalid state");
}

console.log("SCENARIO BOOTSTRAP OK");
