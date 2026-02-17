import fs from "node:fs";
import path from "node:path";

type Issue = { path: string; code: string; message: string };

function validateScenarioV1Local(input: unknown): { ok: boolean; issues: Issue[] } {
  const issues: Issue[] = [];
  const push = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (!input || typeof input !== "object") {
    push("", "TYPE", "Scenario must be an object");
    return { ok: false, issues };
  }

  const s = input as any;

  if (s.version !== "1") push("/version", "REQUIRED", 'version must be "1"');
  if (typeof s.id !== "string" || !s.id.trim()) push("/id", "REQUIRED", "id must be a non-empty string");
  if (typeof s.title !== "string" || !s.title.trim()) push("/title", "REQUIRED", "title must be a non-empty string");
  if (typeof s.summary !== "string" || !s.summary.trim()) push("/summary", "REQUIRED", "summary must be a non-empty string");

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

  return { ok: issues.length === 0, issues };
}

const dir = process.argv[2] ?? "scenarios";
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

let ok = true;

for (const f of files) {
  const full = path.join(dir, f);
  const raw = fs.readFileSync(full, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    ok = false;
    console.error(`SCENARIO FAIL ${f}: invalid JSON`);
    continue;
  }

  const res = validateScenarioV1Local(parsed);
  if (!res.ok) {
    ok = false;
    console.error(`SCENARIO FAIL ${f}`);
    for (const issue of res.issues) {
      console.error(`  - ${issue.path} ${issue.code}: ${issue.message}`);
    }
  }
}

if (ok) {
  console.log("SCENARIO OK");
  process.exit(0);
} else {
  process.exit(1);
}
