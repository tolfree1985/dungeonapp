import fs from "node:fs";
import path from "node:path";
import { SupportDashboard } from "~/components/SupportDashboard";

type RunbookSection = {
  label: string;
  exists: boolean;
  text: string;
};

type FixtureOption = {
  name: string;
  content: string;
};

function hasFile(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readRunbookSection(runbookText: string, matchers: string[]): { exists: boolean; text: string } {
  const lines = runbookText.split(/\r?\n/);
  const lowerMatchers = matchers.map((m) => m.toLowerCase());

  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    if (!line.startsWith("## ")) continue;
    if (lowerMatchers.some((matcher) => line.includes(matcher))) {
      startIndex = i;
      break;
    }
  }

  if (startIndex < 0) {
    return { exists: false, text: "NOT FOUND" };
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("## ")) {
      endIndex = i;
      break;
    }
  }

  const section = lines.slice(startIndex, endIndex).join("\n").trim();
  return { exists: true, text: section || "NOT FOUND" };
}

function loadScenarioFixtures(scenariosDir: string): FixtureOption[] {
  if (!hasFile(scenariosDir)) return [];

  let names: string[] = [];
  try {
    names = fs
      .readdirSync(scenariosDir)
      .filter((name) => name.endsWith(".json"))
      .sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
  } catch {
    return [];
  }

  const fixtures: FixtureOption[] = [];
  for (const name of names) {
    const abs = path.join(scenariosDir, name);
    try {
      const content = fs.readFileSync(abs, "utf8");
      fixtures.push({ name, content });
    } catch {
      // skip unreadable fixture deterministically
    }
  }
  return fixtures;
}

export default function SupportPage() {
  const supportEnabled = process.env.NODE_ENV !== "production";

  if (!supportEnabled) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Support Dashboard</h1>
        <p className="mt-2 text-sm">Support tools are available only in dev/admin mode.</p>
      </main>
    );
  }

  const cwd = process.cwd();
  const deployRunbookPath = path.join(cwd, "docs", "deploy-runbook.md");
  const readmePath = path.join(cwd, "README.md");
  const scenariosDir = path.join(cwd, "scenarios");
  const debugBundleRoutePath = path.join(cwd, "app", "api", "debug", "bundle", "[bundleId]", "route.ts");

  const runbookLinks = [
    {
      label: "docs/deploy-runbook*",
      path: "docs/deploy-runbook.md",
      exists: hasFile(deployRunbookPath),
    },
    {
      label: "build instructions",
      path: "README.md",
      exists: hasFile(readmePath),
    },
    {
      label: "intervention checklist",
      path: "docs/deploy-runbook.md#launch-hardening-checklist-stub",
      exists: hasFile(deployRunbookPath),
    },
  ];

  const runbookText = hasFile(deployRunbookPath) ? fs.readFileSync(deployRunbookPath, "utf8") : "";

  const buildSection = readRunbookSection(runbookText, ["build & start", "build"]);
  const migrateSection = readRunbookSection(runbookText, ["database migrations", "migrate"]);
  const rollbackSection = readRunbookSection(runbookText, ["rollback"]);
  const smokeSection = readRunbookSection(runbookText, ["deterministic smoke command", "smoke"]);

  const runbookSections: RunbookSection[] = [
    { label: "Build", exists: buildSection.exists, text: buildSection.text },
    { label: "Migrate", exists: migrateSection.exists, text: migrateSection.text },
    { label: "Rollback", exists: rollbackSection.exists, text: rollbackSection.text },
    { label: "Smoke", exists: smokeSection.exists, text: smokeSection.text },
  ];

  const runbookSectionChecks = runbookSections.map((section) => ({
    label: section.label,
    exists: section.exists,
  }));

  return (
    <SupportDashboard
      debugEndpointAvailable={hasFile(debugBundleRoutePath)}
      runbookLinks={runbookLinks}
      runbookSectionChecks={runbookSectionChecks}
      runbookSections={runbookSections}
      fixtureOptions={loadScenarioFixtures(scenariosDir)}
    />
  );
}
