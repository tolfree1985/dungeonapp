import fs from "node:fs";
import path from "node:path";
import { SupportDashboard } from "@/components/SupportDashboard";

function hasFile(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
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

  return (
    <SupportDashboard
      debugEndpointAvailable={hasFile(debugBundleRoutePath)}
      runbookLinks={runbookLinks}
    />
  );
}
