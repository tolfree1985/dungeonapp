import fs from "node:fs";
import path from "node:path";
import type { ScenarioV1 } from "../../schemas/scenario.v1"; // type-only: safe at runtime

type Issue = { path: string; code: string; message: string };

function validateScenarioV1Local(input: unknown): Issue[] {
  const issues: Issue[] = [];
  const push = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (!input || typeof input !== "object") {
    push("", "TYPE", "Scenario must be an object");
    return issues;
  }

  const s = input as any;

  if (s.version !== "1") push("/version", "REQUIRED", 'version must be "1"');
  if (typeof s.id !== "string" || !s.id.trim()) push("/id", "REQUIRED", "id must be a non-empty string");
  if (typeof s.title !== "string" || !s.title.trim()) {
    push("/title", "REQUIRED", "title must be a non-empty string");
  }
  if (typeof s.summary !== "string" || !s.summary.trim()) {
    push("/summary", "REQUIRED", "summary must be a non-empty string");
  }

  if (!s.initialState || typeof s.initialState !== "object") {
    push("/initialState", "REQUIRED", "initialState must be an object");
  }

  if (!s.start || typeof s.start !== "object") {
    push("/start", "REQUIRED", "start must be an object");
  } else {
    if (typeof s.start.sceneId !== "string" || !s.start.sceneId.trim()) {
      push("/start/sceneId", "REQUIRED", "start.sceneId must be non-empty");
    }
    if (typeof s.start.prompt !== "string" || !s.start.prompt.trim()) {
      push("/start/prompt", "REQUIRED", "start.prompt must be non-empty");
    }
  }

  return issues;
}

export function loadScenarioById(id: string): ScenarioV1 {
  const dir = path.join(process.cwd(), "scenarios");
  const file = path.join(dir, `${id}.scenario.v1.json`);

  if (!fs.existsSync(file)) throw new Error(`Scenario not found: ${id}`);

  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);

  const issues = validateScenarioV1Local(parsed);
  if (issues.length) {
    const details = issues.map((i) => `${i.path} ${i.code}: ${i.message}`).join("; ");
    throw new Error(`Invalid scenario ${id}: ${details}`);
  }

  return parsed as ScenarioV1;
}
