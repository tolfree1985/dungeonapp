import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const filePath = path.join(process.cwd(), "src", "app", "creator", "page.tsx");
  const source = fs.readFileSync(filePath, "utf8");

  assert(source.includes("Scenario Creator"), 'Expected "Scenario Creator" heading');
  assert(source.includes("Validate scenario"), 'Expected "Validate scenario" control');
  assert(source.includes("Validation"), 'Expected "Validation" section');
  assert(source.includes("Preview"), 'Expected "Preview" section');
  assert(source.includes("Publish scenario"), 'Expected "Publish scenario" control');
  assert(
    source.includes("Publish disabled: validation must pass."),
    'Expected deterministic publish disabled reason text',
  );
  assert(
    source.includes("disabled={!publishEnabled}"),
    'Expected source to gate "Publish scenario" disabled state',
  );
  assert(source.includes("Create draft"), 'Expected "Create draft" control');
  assert(
    source.includes("Copy scenario draft bundle"),
    'Expected "Copy scenario draft bundle" control',
  );
  assert(source.includes("My scenarios"), 'Expected "My scenarios" section');
  assert(source.includes("Load mine"), 'Expected "Load mine" control');
  assert(
    source.includes("Prompt scaffold preview"),
    'Expected "Prompt scaffold preview" section',
  );

  console.log("UI CREATOR PAGE OK");
}

main();
