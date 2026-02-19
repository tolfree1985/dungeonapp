import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const filePath = path.join(process.cwd(), "src", "app", "creator", "page.tsx");
  const source = fs.readFileSync(filePath, "utf8");

  assert(source.includes("Scenario Creator"), 'Expected "Scenario Creator" heading');
  assert(source.includes("Paste scenario JSON"), 'Expected JSON import input label');
  assert(source.includes("Import JSON"), 'Expected "Import JSON" control');
  assert(source.includes("JSON import error"), 'Expected deterministic JSON import error block label');
  assert(source.includes("Validate scenario"), 'Expected "Validate scenario" control');
  assert(
    source.includes("validateScenarioDeterminism"),
    "Expected deterministic scenario validation hook usage",
  );
  assert(source.includes("Validation"), 'Expected "Validation" section');
  assert(source.includes("Path:"), 'Expected deterministic validation path grouping label');
  assert(source.includes("Preview"), 'Expected "Preview" section');
  assert(source.includes("DETERMINISM VALIDATED"), 'Expected deterministic preview success banner');
  assert(source.includes("DETERMINISM VALIDATION FAILED"), 'Expected deterministic preview failure banner');
  assert(source.includes("Determinism errors"), 'Expected deterministic error list label');
  assert(source.includes("Deterministic Preview Check"), 'Expected deterministic preview check control');
  assert(source.includes("Preview check not run."), 'Expected deterministic preview status baseline');
  assert(source.includes("Final state hash:"), 'Expected deterministic preview hash output label');
  assert(source.includes("Telemetry summary:"), 'Expected deterministic preview telemetry output label');
  assert(source.includes("REPLAY_GUARD_SUMMARY"), 'Expected deterministic replay guard summary output label');
  assert(source.includes("Guard failures:"), 'Expected deterministic replay guard failures label');
  assert(source.includes("PREVIEW_REPLAY_FAILED"), 'Expected deterministic preview replay failure marker');
  assert(source.includes("STYLE LOCK SUMMARY"), 'Expected style lock summary panel heading');
  assert(source.includes("Tone:"), 'Expected style lock summary tone row');
  assert(source.includes("Genre:"), 'Expected style lock summary genre row');
  assert(source.includes("Pacing:"), 'Expected style lock summary pacing row');
  assert(source.includes("Status:"), 'Expected style lock summary status row');
  assert(source.includes("LOCKED"), 'Expected locked status text');
  assert(source.includes("UNLOCKED"), 'Expected unlocked status text');
  assert(source.includes("Determinism failures:"), 'Expected style lock deterministic failure block');
  assert(source.includes("Memory preview:"), 'Expected deterministic memory preview label');
  assert(source.includes("Preflight checklist"), 'Expected "Preflight checklist" section');
  assert(source.includes("Validation pass"), 'Expected preflight validation pass checklist row');
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
  assert(source.includes("Save blocked: determinism validation failed."), 'Expected deterministic save block reason');
  assert(source.includes("Fork scenario"), 'Expected "Fork scenario" control');
  assert(source.includes("sourceScenarioId"), 'Expected "sourceScenarioId" control label');
  assert(source.includes("newScenarioId"), 'Expected "newScenarioId" control label');
  assert(source.includes("Request tier:"), 'Expected deterministic request tier text');
  assert(source.includes("Tier"), 'Expected "Tier" control label');
  assert(source.includes("setCreateDraftStatus"), 'Expected isolated create draft status region state');
  assert(source.includes("setForkStatus"), 'Expected isolated fork status region state');
  assert(source.includes("Creator billing banner"), 'Expected deterministic creator billing banner region');
  assert(source.includes("Retry-After"), 'Expected retry-after support in creator status text path');
  assert(source.includes("formatCreatorCapDetail"), 'Expected deterministic cap detail formatting usage');
  assert(
    source.includes("Copy scenario draft bundle"),
    'Expected "Copy scenario draft bundle" control',
  );
  assert(source.includes("determinismReport"), 'Expected draft export determinismReport embedding');
  assert(source.includes("My scenarios"), 'Expected "My scenarios" section');
  assert(source.includes("Load mine"), 'Expected "Load mine" control');
  assert(
    source.includes("Prompt scaffold preview"),
    'Expected "Prompt scaffold preview" section',
  );
  assert(source.includes("Copy prompt scaffold bundle"), 'Expected prompt scaffold bundle copy control');
  assert(source.includes("togglePromptSection"), 'Expected deterministic prompt scaffold section toggles');
  assert(source.includes("Unsaved changes:"), 'Expected unsaved changes indicator');
  assert(source.includes("Creator navigation"), 'Expected creator navigation region');
  assert(source.includes("href=\"/support\""), 'Expected dev-only Support navigation entry');

  console.log("UI CREATOR PAGE OK");
}

main();
