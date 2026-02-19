"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCreatorDebugBundleText } from "@/lib/buildCreatorDebugBundleText";
import { buildPromptScaffoldBundleText } from "@/lib/buildPromptScaffoldBundleText";
import { buildScenarioDraftBundleText } from "@/lib/buildScenarioDraftBundleText";
import { DETERMINISTIC_BASELINE_SCENARIO, SCENARIO_TEMPLATE_LIBRARY } from "@/lib/creator/scenarioTemplates";
import {
  formatCreatorCapDetail,
  formatCreatorRetryAfterText,
  mapCreatorErrorMessage,
} from "@/lib/creator/mapCreatorErrorMessage";
import {
  ALLOWED_STATE_NAMESPACES,
  REPLAY_GUARD_ORDER,
  replayStateFromTurnJsonWithGuardSummary,
} from "@/lib/game/replay";
import { buildPromptParts } from "@/lib/promptScaffold";
import { validateScenarioDeterminism } from "@/lib/scenario/validateScenarioDeterminism";
import { buildSupportManifestFromBundle } from "@/lib/support/supportManifest";

type ValidationIssue = { path: string; code: string; message: string };
type ScenarioListItem = {
  id: string;
  title: string;
  summary: string | null;
  ownerId: string | null;
  sourceScenarioId: string | null;
  updatedAt: string;
};
type MineViewItem = ScenarioListItem & { visibilityBadge: "DRAFT" | "PUBLIC" };
type CreatorTier = "NOMAD" | "TRAILBLAZOR" | "CHRONICLER" | "LOREMASTER";
type CreatorSnapshot = { title: string; summary: string; contentJson: string };
type LintWarning = { code: string; message: string };
type StyleLockKey = "toneLock" | "genreLock" | "pacingLock";
type StyleLockSummary = {
  tone: string;
  genre: string;
  pacing: string;
  status: "LOCKED" | "UNLOCKED";
};
type PreviewReplayEvent = { seq: number; turnJson: any };
type PreviewReplayReport = {
  finalStateHash: string;
  turnCount: number;
  totalStateDeltas: number;
  totalLedgerEntries: number;
  guardSummary: string;
  guardFailures: string[];
  replayError: string;
};
type DeterminismLintMarker = {
  code: string;
  explanation: string;
  reference: string;
  hint: string;
};

const STYLE_LOCK_KEYS: StyleLockKey[] = ["toneLock", "genreLock", "pacingLock"];
const ALLOWED_NAMESPACE_TEXT = [...ALLOWED_STATE_NAMESPACES].sort(compareText).join(", ");
const DETERMINISM_ERROR_METADATA: Record<
  string,
  { explanation: string; reference: string; hint: string }
> = {
  SCENARIO_DELTA_NAMESPACE_INVALID: {
    explanation: "A state delta path targets a disallowed top-level namespace.",
    reference: "Path: /turns/*/stateDeltas/*/path",
    hint: `Use only: ${ALLOWED_NAMESPACE_TEXT}`,
  },
  SCENARIO_FLOAT_STAT_MUTATION: {
    explanation: "A stats.* mutation contains a non-integer value.",
    reference: "Path: /turns/*/stateDeltas/* where path starts with stats.",
    hint: "Use integer values under stats.*",
  },
  SCENARIO_LEDGER_DELTA_MISMATCH: {
    explanation: "Deltas and ledger entries are not paired for a turn.",
    reference: "Turn: /turns/*",
    hint: "Each turn with deltas should include ledger entries unless tagged system/no-ledger.",
  },
  SCENARIO_STYLE_LOCK_ENUM_INVALID: {
    explanation: "A style-lock value is not in the allowed enum set.",
    reference: "Path: /initialState/flags/*Lock or /turns/*/stateDeltas/*",
    hint: "Use style-lock values from: locked, none, unlocked.",
  },
  SCENARIO_STYLE_LOCK_TRANSITION_INVALID: {
    explanation: "A style-lock changes from one defined value to another or is removed.",
    reference: "Turn: /turns/* where style-lock deltas apply",
    hint: "Allowed transitions: undefined -> defined, or defined -> same value.",
  },
  SCENARIO_STYLE_INSTABILITY: {
    explanation: "A style dimension transitions more than once in the scripted flow.",
    reference: "Turn: /turns/* where style-lock deltas apply",
    hint: "Keep each style dimension to at most one transition per scenario script.",
  },
  SCENARIO_TURN_INDEX_INVALID: {
    explanation: "Turn indexes contain duplicates or invalid sequence entries.",
    reference: "Path: /turns/*/turnIndex",
    hint: "Ensure each turnIndex is unique.",
  },
  SCENARIO_UNDEFINED_DELTA_VALUE: {
    explanation: "A delta contains an undefined value.",
    reference: "Path: /turns/*/stateDeltas/*",
    hint: "Replace undefined with explicit JSON values.",
  },
  SCENARIO_DEAD_END_BRANCH: {
    explanation: "A failure branch does not mutate state and does not transition to another branch.",
    reference: "Turn: /turns/* with fail resolution",
    hint: "For fail branches, add a delta or nextTurnIndex/next branch transition.",
  },
  SCENARIO_MEANINGLESS_FAILURE: {
    explanation: "A failure branch only sets trivial failure flags and does not add meaningful progression.",
    reference: "Turn: /turns/* with fail resolution",
    hint: "On failure, mutate quests/stats/relationships/inventory or set a non-trivial progression flag.",
  },
  SCENARIO_STAKES_CONTRADICTION: {
    explanation: "An explicit stakes marker lowers risk below what deterministic deltas imply.",
    reference: "Turn: /turns/*/ledgerAdds/* with stakes:* or risk:* markers",
    hint: "Use stakes markers to elevate risk or align with deterministic deltas; do not understate structural impact.",
  },
};

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function groupValidationIssues(issues: ValidationIssue[]): Array<{ path: string; issues: ValidationIssue[] }> {
  const sorted = [...issues].sort((a, b) => {
    const byPath = compareText(a.path, b.path);
    if (byPath !== 0) return byPath;
    const byCode = compareText(a.code, b.code);
    if (byCode !== 0) return byCode;
    return compareText(a.message, b.message);
  });

  const groups: Array<{ path: string; issues: ValidationIssue[] }> = [];
  for (const issue of sorted) {
    const path = issue.path || "(root)";
    const last = groups[groups.length - 1];
    if (!last || last.path !== path) {
      groups.push({ path, issues: [issue] });
      continue;
    }
    last.issues.push(issue);
  }
  return groups;
}

function normalizeJsonForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonForDisplay(entry));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const keys = Object.keys(input).sort(compareText);
    for (const key of keys) {
      output[key] = normalizeJsonForDisplay(input[key]);
    }
    return output;
  }
  return value;
}

function stableJsonDisplay(value: unknown): string {
  return JSON.stringify(normalizeJsonForDisplay(value), null, 2);
}

function lintScenario(parsed: unknown): LintWarning[] {
  if (!parsed || typeof parsed !== "object") return [];
  const s = parsed as any;
  const warnings: LintWarning[] = [];

  if (typeof s.id === "string" && /\s/.test(s.id)) {
    warnings.push({
      code: "ID_WHITESPACE",
      message: "id contains whitespace; prefer hyphenated ids for stable linking.",
    });
  }

  if (typeof s.summary === "string" && s.summary.trim().length > 0 && s.summary.trim().length < 24) {
    warnings.push({
      code: "SUMMARY_SHORT",
      message: "summary is very short; include one concrete risk or hook.",
    });
  }

  if (typeof s.start?.prompt === "string" && s.start.prompt.trim().length > 0 && s.start.prompt.trim().length < 40) {
    warnings.push({
      code: "START_PROMPT_SHORT",
      message: "start.prompt is short; consider adding immediate context and stakes.",
    });
  }

  if (!s.initialState || typeof s.initialState !== "object" || !("memory" in s.initialState)) {
    warnings.push({
      code: "INITIAL_MEMORY_MISSING",
      message: "initialState.memory is missing; memory preview and recall may be limited.",
    });
  }

  return warnings;
}

function validateScenarioContentJson(raw: string): {
  ok: boolean;
  parseError: string | null;
  issues: ValidationIssue[];
} {
  const text = raw.trim();
  if (!text) {
    return {
      ok: false,
      parseError: null,
      issues: [{ path: "/contentJson", code: "REQUIRED", message: "contentJson is required" }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, parseError: "Invalid JSON", issues: [] };
  }

  const issues: ValidationIssue[] = [];
  const push = (path: string, code: string, message: string) => issues.push({ path, code, message });

  if (!parsed || typeof parsed !== "object") {
    push("", "TYPE", "Scenario must be an object");
    return { ok: false, parseError: null, issues };
  }

  const s = parsed as any;

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

  return { ok: issues.length === 0, parseError: null, issues };
}

function toTurnIndex(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

function normalizeDeltaPath(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
    return parts.length > 0 ? parts.join(".") : null;
  }
  return null;
}

function styleLockKeyFromDelta(delta: unknown): StyleLockKey | null {
  if (!delta || typeof delta !== "object") return null;
  const d = delta as any;
  const normalizedPath = normalizeDeltaPath(d.path);
  if (normalizedPath) {
    const path = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    if (path.startsWith("flags.")) {
      const key = path.slice("flags.".length) as StyleLockKey;
      return STYLE_LOCK_KEYS.includes(key) ? key : null;
    }
    if (path.startsWith("world.flags.")) {
      const key = path.slice("world.flags.".length) as StyleLockKey;
      return STYLE_LOCK_KEYS.includes(key) ? key : null;
    }
  }
  if (typeof d.op === "string" && d.op.trim() === "flag.set" && typeof d.key === "string") {
    const key = d.key as StyleLockKey;
    return STYLE_LOCK_KEYS.includes(key) ? key : null;
  }
  return null;
}

function styleLockNextValueFromDelta(delta: unknown): unknown {
  if (!delta || typeof delta !== "object") return undefined;
  const d = delta as any;
  if (typeof d.op === "string") {
    const op = d.op.trim().toLowerCase();
    if (op.includes("unset") || op.includes("delete") || op.includes("remove")) {
      return undefined;
    }
  }
  if ("value" in d) return d.value;
  return undefined;
}

function readInitialStyleLock(scenario: unknown, key: StyleLockKey): unknown {
  if (!scenario || typeof scenario !== "object") return undefined;
  const s = scenario as any;
  if (s.initialState?.flags && typeof s.initialState.flags === "object" && key in s.initialState.flags) {
    return s.initialState.flags[key];
  }
  if (
    s.initialState?.world?.flags &&
    typeof s.initialState.world.flags === "object" &&
    key in s.initialState.world.flags
  ) {
    return s.initialState.world.flags[key];
  }
  return undefined;
}

function formatStyleLockValue(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return "(unset)";
}

function buildStyleLockSummary(scenario: unknown): StyleLockSummary {
  const state = new Map<StyleLockKey, unknown>();
  for (const key of STYLE_LOCK_KEYS) {
    const initial = readInitialStyleLock(scenario, key);
    if (initial !== undefined) {
      state.set(key, initial);
    }
  }

  if (scenario && typeof scenario === "object") {
    const s = scenario as any;
    const rawTurns = Array.isArray(s.turns) ? s.turns : Array.isArray(s.events) ? s.events : [];
    const turns = rawTurns
      .map((raw: any, index: number) => ({
        turnIndex: toTurnIndex(raw?.turnIndex ?? raw?.seq, index),
        deltas: Array.isArray(raw?.stateDeltas)
          ? raw.stateDeltas
          : Array.isArray(raw?.deltas)
            ? raw.deltas
            : Array.isArray(raw?.turnJson?.deltas)
              ? raw.turnJson.deltas
              : [],
      }))
      .sort((a, b) => a.turnIndex - b.turnIndex);

    for (const turn of turns) {
      for (const delta of turn.deltas) {
        const key = styleLockKeyFromDelta(delta);
        if (!key) continue;
        const next = styleLockNextValueFromDelta(delta);
        if (next === undefined) {
          state.delete(key);
        } else {
          state.set(key, next);
        }
      }
    }
  }

  const tone = formatStyleLockValue(state.get("toneLock"));
  const genre = formatStyleLockValue(state.get("genreLock"));
  const pacing = formatStyleLockValue(state.get("pacingLock"));
  const status = [tone, genre, pacing].some((value) => value === "locked") ? "LOCKED" : "UNLOCKED";
  return { tone, genre, pacing, status };
}

function toDeterminismLintMarkers(errorCodes: string[]): DeterminismLintMarker[] {
  return [...errorCodes]
    .sort(compareText)
    .map((code) => {
      const meta = DETERMINISM_ERROR_METADATA[code];
      return {
        code,
        explanation: meta?.explanation ?? "Unknown determinism validation error.",
        reference: meta?.reference ?? "Reference: scenario validation output",
        hint: meta?.hint ?? "Review scenario determinism constraints.",
      };
    });
}

function topLevelTemplateDiffKeys(currentScenario: unknown, templateScenario: unknown): string[] {
  if (!currentScenario || typeof currentScenario !== "object") {
    return Object.keys(templateScenario as Record<string, unknown>).sort(compareText);
  }
  if (!templateScenario || typeof templateScenario !== "object") {
    return ["(root)"];
  }

  const current = currentScenario as Record<string, unknown>;
  const template = templateScenario as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(current), ...Object.keys(template)]);
  const changed = [...keys]
    .sort(compareText)
    .filter((key) => stableJsonDisplay(current[key]) !== stableJsonDisplay(template[key]));
  return changed.length > 0 ? changed : ["(none)"];
}

function toPreviewReplayTurnJson(source: any): any {
  const direct = source?.turnJson;
  if (direct && typeof direct === "object") {
    const deltas = Array.isArray(direct.deltas)
      ? direct.deltas
      : Array.isArray(source?.deltas)
        ? source.deltas
        : Array.isArray(source?.stateDeltas)
          ? source.stateDeltas
          : [];
    return { ...direct, deltas, resolution: direct?.resolution ?? source?.resolution };
  }

  const deltas = Array.isArray(source?.deltas)
    ? source.deltas
    : Array.isArray(source?.stateDeltas)
      ? source.stateDeltas
      : [];
  return {
    deltas,
    ledgerAdds: Array.isArray(source?.ledgerAdds) ? source.ledgerAdds : [],
    resolution: source?.resolution,
  };
}

function extractPreviewReplayEvents(scenario: unknown): PreviewReplayEvent[] {
  if (!scenario || typeof scenario !== "object") return [];
  const s = scenario as any;
  const rawEvents = Array.isArray(s.events) ? s.events : Array.isArray(s.turns) ? s.turns : [];
  return rawEvents
    .map((raw: any, index: number) => ({
      seq: toTurnIndex(raw?.seq ?? raw?.turnIndex, index),
      turnJson: toPreviewReplayTurnJson(raw),
    }))
    .sort((a, b) => a.seq - b.seq);
}

export default function CreatorPage() {
  const supportNavEnabled = process.env.NODE_ENV !== "production";
  const previewCheckEnabled = process.env.NODE_ENV !== "production";
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [contentJson, setContentJson] = useState("");
  const [importJsonText, setImportJsonText] = useState("");
  const [jsonImportStatus, setJsonImportStatus] = useState("");
  const [lastValidation, setLastValidation] = useState<ReturnType<typeof validateScenarioContentJson> | null>(
    null,
  );
  const [ownerId, setOwnerId] = useState("");
  const [creatorTier, setCreatorTier] = useState<CreatorTier>("NOMAD");
  const [forkSourceScenarioId, setForkSourceScenarioId] = useState("");
  const [forkNewScenarioId, setForkNewScenarioId] = useState("");
  const [myScenarios, setMyScenarios] = useState<MineViewItem[]>([]);
  const [mineStatus, setMineStatus] = useState("My scenarios not loaded.");
  const [draftCopyStatus, setDraftCopyStatus] = useState("");
  const [debugBundleCopyStatus, setDebugBundleCopyStatus] = useState("");
  const [shareLinkCopyStatus, setShareLinkCopyStatus] = useState("");
  const [promptBundleCopyStatus, setPromptBundleCopyStatus] = useState("");
  const [createDraftStatus, setCreateDraftStatus] = useState("");
  const [forkStatus, setForkStatus] = useState("");
  const [billingBanner, setBillingBanner] = useState("");
  const [lastMappedError, setLastMappedError] = useState("");
  const [previewReplayStatus, setPreviewReplayStatus] = useState("Preview check not run.");
  const [previewReplayReport, setPreviewReplayReport] = useState<PreviewReplayReport | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateStatus, setTemplateStatus] = useState("No template selected.");
  const [baselineSnapshot, setBaselineSnapshot] = useState<CreatorSnapshot>({
    title: "",
    summary: "",
    contentJson: "",
  });
  const [promptSectionOpen, setPromptSectionOpen] = useState({
    preview: true,
    system: false,
    developer: false,
    user: false,
  });

  const emptyState = useMemo(
    () => ({
      title: title.trim().length === 0,
      summary: summary.trim().length === 0,
      contentJson: contentJson.trim().length === 0,
    }),
    [contentJson, summary, title],
  );

  const validation = useMemo(() => validateScenarioContentJson(contentJson), [contentJson]);
  const validationView = lastValidation ?? validation;
  const groupedValidation = useMemo(() => groupValidationIssues(validationView.issues), [validationView.issues]);
  const publishEnabled = validation.ok;
  const preview = useMemo(() => {
    try {
      const parsed = JSON.parse(contentJson) as any;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [contentJson]);
  const determinismValidation = useMemo(
    () => (preview ? validateScenarioDeterminism(preview) : { valid: false, errors: ["SCENARIO_PARSE_INVALID"] }),
    [preview],
  );
  const promptParts = useMemo(() => {
    if (!preview) {
      return null;
    }

    try {
      const initialState =
        preview.initialState && typeof preview.initialState === "object" ? preview.initialState : {};
      const startPrompt =
        typeof preview.start?.prompt === "string" && preview.start.prompt.trim()
          ? preview.start.prompt
          : "(no start prompt)";

      return buildPromptParts({
        narrationInput: {
          style: {
            genre: "mystery-adventure",
            tone: "grounded, serious",
            pov: "second-person",
            tense: "present",
            allowedMagicLevel: "low-or-unclear",
            profanity: "none",
            maxWords: 220,
          },
          state: initialState,
          playerInput: startPrompt,
          resolution: {
            roll: { d1: 3, d2: 4, total: 7 },
            tier: "mixed",
          },
          stateDeltas: [],
          causalLedgerAdds: [],
          scene: {},
        },
        memory: {
          injected: [],
          suppressedIds: [],
          matchedIds: [],
          gate: null,
        },
      });
    } catch {
      return null;
    }
  }, [preview]);
  const lintWarnings = useMemo(() => lintScenario(preview), [preview]);
  useEffect(() => {
    setBillingBanner("");
    setLastMappedError("");
    setPreviewReplayStatus("Preview check not run.");
    setPreviewReplayReport(null);
  }, [contentJson, creatorTier, forkNewScenarioId, forkSourceScenarioId, ownerId, summary, title]);
  const preflightChecklist = useMemo(
    () => [
      {
        label: "Title present",
        ok:
          title.trim().length > 0 ||
          (typeof preview?.title === "string" && preview.title.trim().length > 0),
      },
      {
        label: "Summary present",
        ok:
          summary.trim().length > 0 ||
          (typeof preview?.summary === "string" && preview.summary.trim().length > 0),
      },
      {
        label: "Content JSON present",
        ok: contentJson.trim().length > 0,
      },
      {
        label: "Start prompt present",
        ok:
          typeof preview?.start?.prompt === "string" &&
          preview.start.prompt.trim().length > 0,
      },
      {
        label: "Validation pass",
        ok: validation.ok,
      },
    ],
    [contentJson, preview, summary, title, validation.ok],
  );
  const memoryPreview = useMemo(() => {
    if (!preview || typeof preview !== "object") {
      return "(none)";
    }
    const memory = (preview as any)?.initialState?.memory;
    if (memory == null) {
      return "(none)";
    }
    return stableJsonDisplay(memory);
  }, [preview]);
  const styleLockSummary = useMemo(() => buildStyleLockSummary(preview), [preview]);
  const determinismLintMarkers = useMemo(
    () => toDeterminismLintMarkers(determinismValidation.errors),
    [determinismValidation.errors],
  );
  const selectedTemplate = useMemo(
    () => SCENARIO_TEMPLATE_LIBRARY.find((template) => template.key === selectedTemplateKey) ?? null,
    [selectedTemplateKey],
  );
  const templateDiffKeys = useMemo(
    () => (selectedTemplate ? topLevelTemplateDiffKeys(preview, selectedTemplate.scenario) : []),
    [preview, selectedTemplate],
  );
  const previewReplayPassed = useMemo(
    () =>
      !!previewReplayReport &&
      previewReplayReport.replayError.length === 0 &&
      previewReplayReport.guardFailures.length === 0,
    [previewReplayReport],
  );
  const hasStyleLockViolation = determinismValidation.errors.includes("SCENARIO_STYLE_LOCK_TRANSITION_INVALID");
  const hasFloatStatViolation = determinismValidation.errors.includes("SCENARIO_FLOAT_STAT_MUTATION");
  const hasNamespaceViolation = determinismValidation.errors.includes("SCENARIO_DELTA_NAMESPACE_INVALID");
  const readinessChecklist = useMemo(
    () => [
      { label: "Determinism validated", ok: determinismValidation.valid },
      { label: "Preview replay passed", ok: previewReplayPassed },
      { label: "No style-lock violations", ok: !hasStyleLockViolation },
      { label: "No float stat mutations", ok: !hasFloatStatViolation },
      { label: "No namespace violations", ok: !hasNamespaceViolation },
    ],
    [
      determinismValidation.valid,
      hasFloatStatViolation,
      hasNamespaceViolation,
      hasStyleLockViolation,
      previewReplayPassed,
    ],
  );
  const hasUnsavedChanges = useMemo(
    () =>
      title !== baselineSnapshot.title ||
      summary !== baselineSnapshot.summary ||
      contentJson !== baselineSnapshot.contentJson,
    [baselineSnapshot.contentJson, baselineSnapshot.summary, baselineSnapshot.title, contentJson, summary, title],
  );
  const styleLockActive = promptParts !== null;

  async function loadMyScenarios() {
    const trimmedOwnerId = ownerId.trim();
    if (!trimmedOwnerId) {
      setMyScenarios([]);
      setMineStatus("ownerId is required.");
      return;
    }

    setMineStatus("Loading...");
    try {
      const [mineRes, publicRes] = await Promise.all([
        fetch(`/api/scenario/mine?ownerId=${encodeURIComponent(trimmedOwnerId)}`),
        fetch("/api/scenario/public"),
      ]);

      if (!mineRes.ok || !publicRes.ok) {
        setMyScenarios([]);
        setMineStatus("Failed to load scenarios.");
        return;
      }

      const mineJson = (await mineRes.json()) as { scenarios?: ScenarioListItem[] };
      const publicJson = (await publicRes.json()) as { scenarios?: ScenarioListItem[] };

      const mine = Array.isArray(mineJson.scenarios) ? mineJson.scenarios : [];
      const publicIds = new Set(
        (Array.isArray(publicJson.scenarios) ? publicJson.scenarios : []).map((s) => s.id),
      );

      const view = mine
        .map((s) => ({
          ...s,
          visibilityBadge: publicIds.has(s.id) ? "PUBLIC" : "DRAFT",
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      setMyScenarios(view);
      setMineStatus(view.length === 0 ? "No scenarios found." : "Loaded.");
    } catch {
      setMyScenarios([]);
      setMineStatus("Failed to load scenarios.");
    }
  }

  async function onCreateDraft() {
    const trimmedOwnerId = ownerId.trim();
    if (!trimmedOwnerId) {
      setCreateDraftStatus("ownerId is required.");
      return;
    }
    if (!validation.ok || !preview) {
      setCreateDraftStatus("Cannot create draft: validation must pass.");
      return;
    }
    if (!determinismValidation.valid) {
      setCreateDraftStatus("Save blocked: determinism validation failed.");
      return;
    }

    const scenarioId = typeof preview.id === "string" ? preview.id : "";
    const scenarioTitle =
      title.trim() || (typeof preview.title === "string" ? preview.title : "");
    if (!scenarioId || !scenarioTitle) {
      setCreateDraftStatus("Cannot create draft: id and title are required.");
      return;
    }

    const scenarioSummary =
      summary.trim() || (typeof preview.summary === "string" ? preview.summary : null);

    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: scenarioId,
          title: scenarioTitle,
          summary: scenarioSummary,
          contentJson: preview,
          visibility: "PRIVATE",
          ownerId: trimmedOwnerId,
          tier: creatorTier,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = mapCreatorErrorMessage({ status: res.status, payload: json });
        const detail = formatCreatorCapDetail(json);
        const retryAfter = formatCreatorRetryAfterText({
          status: res.status,
          payload: json,
          retryAfterHeader: res.headers.get("Retry-After"),
        });
        const parts = [message, detail, retryAfter].filter(Boolean);
        const statusText = parts.join(" ");
        setCreateDraftStatus(statusText);
        setLastMappedError(message);
        setBillingBanner(statusText);
        return;
      }
      setCreateDraftStatus("Draft created.");
    } catch {
      setCreateDraftStatus("Request failed.");
    }
  }

  async function onForkScenario() {
    const trimmedOwnerId = ownerId.trim();
    const sourceScenarioId = forkSourceScenarioId.trim();
    const newScenarioId = forkNewScenarioId.trim();

    if (!trimmedOwnerId) {
      setForkStatus("ownerId is required.");
      return;
    }
    if (!sourceScenarioId || !newScenarioId) {
      setForkStatus("sourceScenarioId and newScenarioId are required.");
      return;
    }

    try {
      const res = await fetch(`/api/scenario/${encodeURIComponent(sourceScenarioId)}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newId: newScenarioId,
          ownerId: trimmedOwnerId,
          tier: creatorTier,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = mapCreatorErrorMessage({ status: res.status, payload: json });
        const detail = formatCreatorCapDetail(json);
        const retryAfter = formatCreatorRetryAfterText({
          status: res.status,
          payload: json,
          retryAfterHeader: res.headers.get("Retry-After"),
        });
        const parts = [message, detail, retryAfter].filter(Boolean);
        const statusText = parts.join(" ");
        setForkStatus(statusText);
        setLastMappedError(message);
        setBillingBanner(statusText);
        return;
      }
      setForkStatus("Scenario forked.");
    } catch {
      setForkStatus("Request failed.");
    }
  }

  async function onCopyDraftBundle() {
    if (!determinismValidation.valid) {
      setDraftCopyStatus("EXPORT BLOCKED — DETERMINISM VIOLATIONS PRESENT");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setDraftCopyStatus("Copy not supported");
      return;
    }

    const text = buildScenarioDraftBundleText({
      title: title.trim(),
      summary: summary.trim(),
      contentJson,
      validationOk: validationView.ok,
      parseError: validationView.parseError,
      issues: validationView.issues,
      determinismReport: {
        staticValidation: {
          status: determinismValidation.valid ? "PASS" : "FAIL",
          errors: determinismValidation.errors,
        },
        previewReplay: previewReplayReport
          ? {
              finalStateHash: previewReplayReport.finalStateHash,
              turnCount: previewReplayReport.turnCount,
              totalStateDeltas: previewReplayReport.totalStateDeltas,
              totalLedgerEntries: previewReplayReport.totalLedgerEntries,
              guardSummary: previewReplayReport.guardSummary,
              guardFailures: previewReplayReport.guardFailures,
              replayError: previewReplayReport.replayError,
            }
          : null,
      },
    });

    await navigator.clipboard.writeText(text);
    setDraftCopyStatus("Copied");
  }

  function onApplyTemplate() {
    if (!selectedTemplate) {
      setTemplateStatus("No template selected.");
      return;
    }
    const templateScenario = selectedTemplate.scenario;
    const templateTitle = typeof templateScenario.title === "string" ? templateScenario.title : "";
    const templateSummary = typeof templateScenario.summary === "string" ? templateScenario.summary : "";
    const templateContentJson = JSON.stringify(templateScenario, null, 2);

    setTitle(templateTitle);
    setSummary(templateSummary);
    setContentJson(templateContentJson);
    setBaselineSnapshot({
      title: templateTitle,
      summary: templateSummary,
      contentJson: templateContentJson,
    });
    setLastValidation(validateScenarioContentJson(templateContentJson));

    const templateValidation = validateScenarioDeterminism(templateScenario);
    setTemplateStatus(
      templateValidation.valid
        ? "Template applied: determinism valid."
        : "Template applied with determinism violations.",
    );
  }

  function onResetToDeterministicBaseline() {
    const baselineScenario = DETERMINISTIC_BASELINE_SCENARIO;
    const baselineTitle = typeof baselineScenario.title === "string" ? baselineScenario.title : "";
    const baselineSummary = typeof baselineScenario.summary === "string" ? baselineScenario.summary : "";
    const baselineContentJson = JSON.stringify(baselineScenario, null, 2);
    setTitle(baselineTitle);
    setSummary(baselineSummary);
    setContentJson(baselineContentJson);
    setBaselineSnapshot({
      title: baselineTitle,
      summary: baselineSummary,
      contentJson: baselineContentJson,
    });
    setLastValidation(validateScenarioContentJson(baselineContentJson));
    setTemplateStatus("Reset to deterministic baseline.");
    setSelectedTemplateKey("");
  }

  async function onRunDeterministicPreviewCheck() {
    if (!preview) {
      setPreviewReplayReport(null);
      setPreviewReplayStatus("Deterministic preview check unavailable until content JSON parses.");
      return;
    }

    try {
      const events = extractPreviewReplayEvents(preview);
      const replayWithSummary = replayStateFromTurnJsonWithGuardSummary(events);
      const guardSummary = replayWithSummary.guardSummary.join(",");
      const guardFailures = REPLAY_GUARD_ORDER.filter((name) => !replayWithSummary.guardSummary.includes(name));
      const manifest = await buildSupportManifestFromBundle({ turns: events });

      setPreviewReplayReport({
        finalStateHash: manifest.replay.finalStateHash,
        turnCount: manifest.replay.turnCount,
        totalStateDeltas: manifest.telemetry.totalStateDeltas,
        totalLedgerEntries: manifest.telemetry.totalLedgerEntries,
        guardSummary,
        guardFailures,
        replayError: "",
      });
      setPreviewReplayStatus(
        guardFailures.length === 0
          ? "Deterministic preview check passed."
          : "Deterministic preview check found guard failures.",
      );
    } catch {
      setPreviewReplayReport({
        finalStateHash: "",
        turnCount: 0,
        totalStateDeltas: 0,
        totalLedgerEntries: 0,
        guardSummary: "",
        guardFailures: [...REPLAY_GUARD_ORDER],
        replayError: "PREVIEW_REPLAY_FAILED",
      });
      setPreviewReplayStatus("Deterministic preview check failed.");
    }
  }

  async function onCopyPromptScaffoldBundle() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setPromptBundleCopyStatus("Copy not supported");
      return;
    }
    if (!promptParts) {
      setPromptBundleCopyStatus("Prompt scaffold preview unavailable.");
      return;
    }

    const text = buildPromptScaffoldBundleText({
      preview: promptParts.preview,
      system: promptParts.system,
      developer: promptParts.developer,
      user: promptParts.user,
    });
    await navigator.clipboard.writeText(text);
    setPromptBundleCopyStatus("Copied");
  }

  async function onCopyCreatorDebugBundle() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setDebugBundleCopyStatus("Copy not supported");
      return;
    }
    const text = buildCreatorDebugBundleText({
      title: title.trim(),
      summary: summary.trim(),
      ownerId: ownerId.trim(),
      tier: creatorTier,
      contentJson,
      validationOk: validationView.ok,
      parseError: validationView.parseError,
      issues: validationView.issues,
      checklist: preflightChecklist,
      lastMappedError,
      createDraftStatus,
      forkStatus,
      billingBanner,
      promptScaffold: promptParts
        ? {
            preview: promptParts.preview,
            system: promptParts.system,
            developer: promptParts.developer,
            user: promptParts.user,
          }
        : null,
    });
    await navigator.clipboard.writeText(text);
    setDebugBundleCopyStatus("Copied");
  }

  function onImportJson() {
    const raw = importJsonText.trim();
    if (!raw) {
      setJsonImportStatus("Import error: JSON input is required.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setJsonImportStatus("Import error: Invalid JSON.");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setJsonImportStatus("Import error: Scenario JSON must be an object.");
      return;
    }

    const scenario = parsed as any;
    const importedTitle = typeof scenario.title === "string" ? scenario.title : "";
    const importedSummary = typeof scenario.summary === "string" ? scenario.summary : "";
    setTitle(importedTitle);
    setSummary(importedSummary);
    setContentJson(raw);
    setBaselineSnapshot({
      title: importedTitle,
      summary: importedSummary,
      contentJson: raw,
    });
    setLastValidation(validateScenarioContentJson(raw));
    setJsonImportStatus("Import complete.");
  }

  function togglePromptSection(section: keyof typeof promptSectionOpen) {
    setPromptSectionOpen((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  function buildCreatorShareablePath(pathname: string): string {
    const params = new URLSearchParams();
    const trimmedOwner = ownerId.trim();
    if (trimmedOwner) params.set("ownerId", trimmedOwner);
    params.set("tier", creatorTier);
    const scenarioId = typeof preview?.id === "string" ? preview.id.trim() : "";
    if (scenarioId) params.set("scenarioId", scenarioId);
    params.set("validation", validationView.ok ? "valid" : "invalid");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  async function onCopyCreatorShareableLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText || typeof location === "undefined") {
      setShareLinkCopyStatus("Copy not supported");
      return;
    }
    const path = buildCreatorShareablePath(location.pathname);
    await navigator.clipboard.writeText(path);
    setShareLinkCopyStatus("Copied");
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Scenario Creator</h1>
      <p className="mt-1 text-sm text-neutral-600">Create and validate scenario drafts.</p>
      <section className="mt-3 rounded border p-3 text-sm" aria-label="Determinism status badge">
        <div className={determinismValidation.valid ? "text-emerald-700" : "text-red-700"}>
          {determinismValidation.valid
            ? "DETERMINISM VALIDATED"
            : "DETERMINISM VIOLATIONS PRESENT"}
        </div>
      </section>
      {supportNavEnabled ? (
        <nav className="mt-2 text-xs" aria-label="Creator navigation">
          <a href="/support" className="underline">
            Support
          </a>
        </nav>
      ) : null}

      <section className="mt-6 space-y-4 rounded border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-json-import">
            Paste scenario JSON
          </label>
          <textarea
            id="scenario-json-import"
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            rows={6}
            placeholder="{\"id\":\"scenario-id\",\"title\":\"...\",\"summary\":\"...\",\"start\":{\"prompt\":\"...\"}}"
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={onImportJson} className="rounded border px-2 py-1 text-xs">
              Import JSON
            </button>
            <span role="status" aria-live="polite">
              {jsonImportStatus}
            </span>
          </div>
          {jsonImportStatus.startsWith("Import error:") ? (
            <div className="mt-2 rounded border p-2 text-xs" aria-label="JSON import error">
              {jsonImportStatus}
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-title">
            Title
          </label>
          <input
            id="scenario-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Scenario title"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-summary">
            Summary
          </label>
          <textarea
            id="scenario-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
            placeholder="Short scenario summary"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scenario-content-json">
            Content JSON
          </label>
          <textarea
            id="scenario-content-json"
            value={contentJson}
            onChange={(e) => setContentJson(e.target.value)}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            rows={12}
            placeholder="{\"id\":\"scenario-id\",\"initialState\":{},\"start\":{\"prompt\":\"...\"}}"
          />
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Editor empty state">
        <h2 className="text-base font-semibold">Editor readiness</h2>
        <div className="mt-2">Title field: {emptyState.title ? "empty" : "ready"}</div>
        <div>Summary field: {emptyState.summary ? "empty" : "ready"}</div>
        <div>Content JSON field: {emptyState.contentJson ? "empty" : "ready"}</div>
        <div>Unsaved changes: {hasUnsavedChanges ? "yes" : "no"}</div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario validation">
        <h2 className="text-base font-semibold">Validation</h2>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLastValidation(validateScenarioContentJson(contentJson))}
            className="rounded border px-2 py-1 text-xs"
          >
            Validate scenario
          </button>
          <div>
            Status: {validationView.ok ? "valid" : "invalid"}
            {lastValidation ? " (manual)" : " (live)"}
          </div>
        </div>
        {validationView.parseError ? <div className="mt-2">Parse error: {validationView.parseError}</div> : null}
        {!validationView.parseError && validationView.issues.length > 0 ? (
          <div className="mt-2 space-y-2">
            {groupedValidation.map((group, groupIndex) => (
              <div key={`${group.path}:${groupIndex}`}>
                <div className="text-xs font-semibold">Path: {group.path}</div>
                <ol className="mt-1 list-decimal space-y-1 pl-6">
                  {group.issues.map((issue, issueIndex) => (
                    <li key={`${group.path}:${issue.code}:${issue.message}:${issueIndex}`}>
                      {issue.code}: {issue.message}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : null}
        {!validationView.parseError && validationView.issues.length === 0 && validationView.ok ? (
          <div className="mt-2">No schema issues.</div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario lint warnings">
        <h2 className="text-base font-semibold">Scenario lint warnings</h2>
        <div className="mt-1 text-xs">Non-blocking guidance only.</div>
        {lintWarnings.length === 0 ? (
          <div className="mt-2">No lint warnings.</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-6">
            {lintWarnings.map((warning) => (
              <li key={warning.code}>
                {warning.code}: {warning.message}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Determinism lint markers">
        <h2 className="text-base font-semibold">Determinism lint markers</h2>
        {determinismLintMarkers.length === 0 ? (
          <div className="mt-2">No determinism lint markers.</div>
        ) : (
          <ol className="mt-2 list-decimal space-y-2 pl-6">
            {determinismLintMarkers.map((marker) => (
              <li key={marker.code}>
                <div className="font-semibold">{marker.code}</div>
                <div>{marker.explanation}</div>
                <div>{marker.reference}</div>
                <div>Quick-fix hint: {marker.hint}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario preview">
        <h2 className="text-base font-semibold">Preview</h2>
        {!preview ? (
          <div className="mt-2">Preview unavailable until content JSON parses.</div>
        ) : (
          <div className="mt-2 space-y-1">
            <div className={`rounded border p-2 text-xs ${determinismValidation.valid ? "border-emerald-500 text-emerald-700" : "border-red-500 text-red-700"}`}>
              {determinismValidation.valid ? "DETERMINISM VALIDATED" : "DETERMINISM VALIDATION FAILED"}
            </div>
            {!determinismValidation.valid ? (
              <div className="mt-2">
                <div className="text-xs font-semibold">Determinism errors</div>
                <ol className="mt-1 list-decimal space-y-1 pl-6">
                  {determinismValidation.errors.map((errorCode) => (
                    <li key={errorCode}>{errorCode}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div>ID: {typeof preview.id === "string" && preview.id ? preview.id : "(missing)"}</div>
            <div>Version: {typeof preview.version === "string" && preview.version ? preview.version : "(missing)"}</div>
            <div>
              Title: {typeof preview.title === "string" && preview.title ? preview.title : "(missing)"}
            </div>
            <div>
              Summary: {typeof preview.summary === "string" && preview.summary ? preview.summary : "(missing)"}
            </div>
            <div>
              Start sceneId:{" "}
              {typeof preview.start?.sceneId === "string" && preview.start.sceneId
                ? preview.start.sceneId
                : "(missing)"}
            </div>
            <div>Start prompt:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">
              {typeof preview.start?.prompt === "string" && preview.start.prompt
                ? preview.start.prompt
                : "(missing)"}
            </pre>
            <div>Memory preview:</div>
            <pre className="rounded border p-2 whitespace-pre-wrap">{memoryPreview}</pre>
            {previewCheckEnabled ? (
              <div className="mt-2 space-y-2 rounded border p-2 text-xs" aria-label="Deterministic preview check">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onRunDeterministicPreviewCheck}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Deterministic Preview Check
                  </button>
                  <span role="status" aria-live="polite">
                    {previewReplayStatus}
                  </span>
                </div>
                {previewReplayReport ? (
                  <div className="space-y-1">
                    <div>Final state hash: {previewReplayReport.finalStateHash || "(none)"}</div>
                    <div>
                      Telemetry summary: turns={previewReplayReport.turnCount} deltas=
                      {previewReplayReport.totalStateDeltas} ledger={previewReplayReport.totalLedgerEntries}
                    </div>
                    <div>
                      REPLAY_GUARD_SUMMARY{" "}
                      {previewReplayReport.guardSummary.length > 0
                        ? previewReplayReport.guardSummary
                        : "(none)"}
                    </div>
                    {previewReplayReport.replayError || previewReplayReport.guardFailures.length > 0 ? (
                      <div className="rounded border border-red-500 p-2 text-red-700">
                        Guard failures:
                        <ol className="mt-1 list-decimal space-y-1 pl-6">
                          {previewReplayReport.replayError ? (
                            <li>{previewReplayReport.replayError}</li>
                          ) : null}
                          {previewReplayReport.guardFailures.map((name) => (
                            <li key={`preview-guard-failure:${name}`}>{name}</li>
                          ))}
                        </ol>
                      </div>
                    ) : (
                      <div className="rounded border border-emerald-500 p-2 text-emerald-700">
                        Guard failures: none
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Style lock summary">
        <h2 className="text-base font-semibold">STYLE LOCK SUMMARY</h2>
        <div className="mt-2 space-y-1">
          <div>Tone: {styleLockSummary.tone}</div>
          <div>Genre: {styleLockSummary.genre}</div>
          <div>Pacing: {styleLockSummary.pacing}</div>
          <div>Status: {styleLockSummary.status}</div>
        </div>
        {!determinismValidation.valid ? (
          <div className="mt-2 rounded border border-red-500 p-2 text-xs">
            Determinism failures:
            <ol className="mt-1 list-decimal space-y-1 pl-6">
              {determinismValidation.errors.map((errorCode) => (
                <li key={`style-lock:${errorCode}`}>{errorCode}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Preflight checklist">
        <h2 className="text-base font-semibold">Preflight checklist</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {preflightChecklist.map((item) => (
            <li key={item.label}>
              {item.label}: {item.ok ? "pass" : "fail"}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Publish readiness checklist">
        <h2 className="text-base font-semibold">PUBLISH READINESS</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {readinessChecklist.map((item) => (
            <li key={item.label}>
              <input type="checkbox" readOnly checked={item.ok} className="mr-2 align-middle" />
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Scenario template library">
        <h2 className="text-base font-semibold">Scenario template library</h2>
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="scenario-template" className="text-xs">
            Template
          </label>
          <select
            id="scenario-template"
            value={selectedTemplateKey}
            onChange={(e) => setSelectedTemplateKey(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="">Select template</option>
            {SCENARIO_TEMPLATE_LIBRARY.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onApplyTemplate} className="rounded border px-2 py-1 text-xs">
            Apply template
          </button>
          <button
            type="button"
            onClick={onResetToDeterministicBaseline}
            className="rounded border px-2 py-1 text-xs"
          >
            Reset to Deterministic Baseline
          </button>
        </div>
        <div className="mt-2" role="status" aria-live="polite">
          {templateStatus}
        </div>
        {selectedTemplate ? (
          <div className="mt-2 rounded border p-2 text-xs" aria-label="Template diff preview">
            <div className="font-semibold">Template diff preview</div>
            <div>Current draft: {typeof preview?.id === "string" ? preview.id : "(none)"}</div>
            <div>Selected template: {selectedTemplate.label}</div>
            <div className="mt-1 font-semibold">Changed keys</div>
            <ol className="list-decimal pl-6">
              {templateDiffKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Publish controls">
        <h2 className="text-base font-semibold">Publish</h2>
        {billingBanner ? (
          <div className="mt-2 rounded border p-2 text-xs" aria-label="Creator billing banner">
            {billingBanner}
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="creator-tier" className="text-xs">
            Tier
          </label>
          <select
            id="creator-tier"
            value={creatorTier}
            onChange={(e) => setCreatorTier(e.target.value as CreatorTier)}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="NOMAD">NOMAD</option>
            <option value="TRAILBLAZOR">TRAILBLAZOR</option>
            <option value="CHRONICLER">CHRONICLER</option>
            <option value="LOREMASTER">LOREMASTER</option>
          </select>
          <span>Request tier: {creatorTier}</span>
        </div>
        <div className="mt-1 text-xs">Tier selection is deterministic and attached to creator requests.</div>
        <div className="mt-2 rounded border p-2 text-xs" aria-label="Max output length policy">
          Max output length is enforced server-side per tier.
          {" "}
          If exceeded, creator errors map to: Per-turn output cap exceeded.
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" disabled={!publishEnabled} className="rounded border px-2 py-1 text-xs disabled:opacity-50">
            Publish scenario
          </button>
          <span>{publishEnabled ? "Publish enabled: validation passed." : "Publish disabled: validation must pass."}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCreateDraft} className="rounded border px-2 py-1 text-xs">
            Create draft
          </button>
          <span role="status" aria-live="polite">
            {createDraftStatus}
          </span>
        </div>
        {!determinismValidation.valid && preview ? (
          <div className="mt-2 rounded border border-red-500 p-2 text-xs">
            Save blocked by determinism validation:
            <ol className="mt-1 list-decimal space-y-1 pl-6">
              {determinismValidation.errors.map((errorCode) => (
                <li key={`save:${errorCode}`}>{errorCode}</li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label htmlFor="fork-source-id" className="text-xs">
            sourceScenarioId
          </label>
          <input
            id="fork-source-id"
            value={forkSourceScenarioId}
            onChange={(e) => setForkSourceScenarioId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="source scenario id"
          />
          <label htmlFor="fork-new-id" className="text-xs">
            newScenarioId
          </label>
          <input
            id="fork-new-id"
            value={forkNewScenarioId}
            onChange={(e) => setForkNewScenarioId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="new scenario id"
          />
          <button type="button" onClick={onForkScenario} className="rounded border px-2 py-1 text-xs">
            Fork scenario
          </button>
          <span role="status" aria-live="polite">
            {forkStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Draft export">
        <h2 className="text-base font-semibold">Draft export</h2>
        <div className="mt-2 rounded border p-2 text-xs" aria-label="Export readiness banner">
          {determinismValidation.valid
            ? "EXPORT READY — DETERMINISM VERIFIED"
            : "EXPORT BLOCKED — DETERMINISM VIOLATIONS PRESENT"}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyDraftBundle} className="rounded border px-2 py-1 text-xs">
            Copy scenario draft bundle
          </button>
          <span role="status" aria-live="polite">
            {draftCopyStatus}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyCreatorDebugBundle} className="rounded border px-2 py-1 text-xs">
            Copy creator debug bundle
          </button>
          <span role="status" aria-live="polite">
            {debugBundleCopyStatus}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onCopyCreatorShareableLink} className="rounded border px-2 py-1 text-xs">
            Copy creator shareable link
          </button>
          <span role="status" aria-live="polite">
            {shareLinkCopyStatus}
          </span>
        </div>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Error code reference panel">
        <details>
          <summary className="cursor-pointer text-base font-semibold">Error code reference</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-6">
            {Object.keys(DETERMINISM_ERROR_METADATA)
              .sort(compareText)
              .map((code) => (
                <li key={code}>
                  <div className="font-semibold">{code}</div>
                  <div>{DETERMINISM_ERROR_METADATA[code].explanation}</div>
                  <div>Marker constant: {code}</div>
                </li>
              ))}
          </ol>
        </details>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="My scenarios">
        <h2 className="text-base font-semibold">My scenarios</h2>
        <div className="mt-2 flex items-center gap-3">
          <label htmlFor="owner-id" className="text-xs">
            ownerId
          </label>
          <input
            id="owner-id"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="rounded border px-2 py-1 text-xs"
            placeholder="owner id"
          />
          <button type="button" onClick={loadMyScenarios} className="rounded border px-2 py-1 text-xs">
            Load mine
          </button>
          <span role="status" aria-live="polite">
            {mineStatus}
          </span>
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          {myScenarios.map((s) => (
            <li key={s.id}>
              <div className="font-medium">{s.title || s.id}</div>
              <div className="text-xs">id: {s.id}</div>
              <div className="text-xs">summary: {s.summary || "(none)"}</div>
              <div className="text-xs">badge: {s.visibilityBadge}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Prompt scaffold preview">
        <h2 className="text-base font-semibold">Prompt scaffold preview</h2>
        <div className="mt-1 text-xs" aria-label="Style lock indicator">
          Style lock: {styleLockActive ? "active" : "inactive"} (scaffold-driven)
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onCopyPromptScaffoldBundle}
            className="rounded border px-2 py-1 text-xs"
          >
            Copy prompt scaffold bundle
          </button>
          <span role="status" aria-live="polite">
            {promptBundleCopyStatus}
          </span>
        </div>
        {!promptParts ? (
          <div className="mt-2">Prompt scaffold preview unavailable.</div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("preview")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.preview ? "Hide" : "Show"} preview
              </button>
            </div>
            {promptSectionOpen.preview ? <div>Preview: {promptParts.preview}</div> : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("system")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.system ? "Hide" : "Show"} system
              </button>
            </div>
            {promptSectionOpen.system ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.system}</pre>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("developer")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.developer ? "Hide" : "Show"} developer
              </button>
            </div>
            {promptSectionOpen.developer ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.developer}</pre>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => togglePromptSection("user")}
                className="rounded border px-2 py-1 text-xs"
              >
                {promptSectionOpen.user ? "Hide" : "Show"} user
              </button>
            </div>
            {promptSectionOpen.user ? (
              <pre className="rounded border p-2 whitespace-pre-wrap">{promptParts.user}</pre>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-4 rounded border p-4 text-sm" aria-label="Commands help">
        <h2 className="text-base font-semibold">/commands</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          <li>
            <code>/validate</code>: run scenario validation and inspect parse/schema status.
          </li>
          <li>
            <code>/copy-draft</code>: copy the scenario draft bundle.
          </li>
          <li>
            <code>/copy-debug</code>: copy the creator debug bundle (scenario + scaffold + validation + last error).
          </li>
          <li>
            <code>/load-mine</code>: load owner scenarios into the My scenarios panel.
          </li>
        </ol>
      </section>
    </main>
  );
}
