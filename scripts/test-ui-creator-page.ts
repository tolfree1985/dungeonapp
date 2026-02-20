import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCENARIO_TEMPLATE_LIBRARY } from "../src/lib/creator/scenarioTemplates";
import { validateScenarioDeterminism } from "../src/lib/scenario/validateScenarioDeterminism";

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
  assert(source.includes("DETERMINISM VIOLATIONS PRESENT"), 'Expected deterministic top-level failure badge');
  assert(source.includes("DETERMINISM VALIDATION FAILED"), 'Expected deterministic preview failure banner');
  assert(source.includes("Determinism errors"), 'Expected deterministic error list label');
  assert(source.includes("Determinism lint markers"), 'Expected determinism lint marker panel');
  assert(source.includes("Quick-fix hint:"), 'Expected deterministic quick-fix hints');
  assert(source.includes("toDeterminismLintMarkers"), 'Expected lint marker mapping helper usage');
  assert(source.includes("sort(compareText)"), 'Expected deterministic sorting of validation displays');
  assert(
    source.includes("SCENARIO_MEANINGLESS_FAILURE"),
    "Expected meaningless-failure lint marker to be documented in creator surface",
  );
  assert(
    source.includes("SCENARIO_STYLE_INSTABILITY"),
    "Expected style-instability lint marker to be documented in creator surface",
  );
  assert(
    source.includes("SCENARIO_STAKES_CONTRADICTION"),
    "Expected stakes-contradiction lint marker to be documented in creator surface",
  );
  assert(source.includes("Deterministic Preview Check"), 'Expected deterministic preview check control');
  assert(source.includes("Preview check not run."), 'Expected deterministic preview status baseline');
  assert(source.includes("Final state hash:"), 'Expected deterministic preview hash output label');
  assert(source.includes("Telemetry summary:"), 'Expected deterministic preview telemetry output label');
  assert(source.includes("SCENARIO_VERSION"), "Expected scenario version stamp label");
  assert(source.includes("SCENARIO_CONTENT_HASH"), "Expected scenario content hash label");
  assert(source.includes("Copy scenario content hash"), "Expected copy scenario content hash control");
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
  assert(source.includes("PUBLISH READINESS"), 'Expected publish readiness checklist heading');
  assert(source.includes("Determinism validated"), 'Expected readiness item label for determinism');
  assert(source.includes("Preview replay passed"), 'Expected readiness item label for preview replay');
  assert(source.includes("No style-lock violations"), 'Expected readiness item label for style lock');
  assert(source.includes("No style instability"), 'Expected readiness item label for style instability');
  assert(source.includes("No stakes contradiction"), 'Expected readiness item label for stakes contradiction');
  assert(source.includes("No float stat mutations"), 'Expected readiness item label for float stats');
  assert(source.includes("No namespace violations"), 'Expected readiness item label for namespace');
  assert(source.includes("Publish scenario"), 'Expected "Publish scenario" control');
  assert(source.includes("PUBLISH_BLOCKED — VALIDATION FAILED"), "Expected deterministic publish blocked marker");
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
  assert(source.includes("EXPORT READY — DETERMINISM VERIFIED"), "Expected export-ready deterministic banner");
  assert(
    source.includes("EXPORT BLOCKED — DETERMINISM VIOLATIONS PRESENT"),
    "Expected export-blocked deterministic banner",
  );
  assert(source.includes("determinismReport"), 'Expected draft export determinismReport embedding');
  assert(source.includes("Scenario template library"), "Expected scenario template library panel");
  assert(source.includes("Template diff preview"), "Expected template diff preview section");
  assert(source.includes("Changed keys"), "Expected template diff changed keys header");
  assert(source.includes("Apply template"), 'Expected "Apply template" control');
  assert(
    source.includes("Reset to Deterministic Baseline"),
    'Expected "Reset to Deterministic Baseline" control',
  );
  assert(source.includes("Error code reference"), "Expected error code reference panel heading");
  assert(source.includes("Marker constant:"), "Expected marker constant rows in error code reference panel");
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
  assert(!source.includes("Date.now"), "Expected no timestamp APIs in creator UI deterministic surface");
  assert(!source.includes("Math.random"), "Expected no randomness APIs in creator UI deterministic surface");
  assert(!source.includes("setTimeout("), "Expected no timer APIs in creator UI deterministic surface");

  for (const template of SCENARIO_TEMPLATE_LIBRARY) {
    const validation = validateScenarioDeterminism(template.scenario);
    assert(
      validation.valid,
      `Expected template ${template.key} to pass determinism validation: ${validation.errors.join(",")}`,
    );
  }

  console.log("UI CREATOR PAGE OK");
}

main();
