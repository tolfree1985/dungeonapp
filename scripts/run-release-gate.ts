import { spawn } from "node:child_process";

type Step = {
  name: string;
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

const PRE_SMOKE_GUARDS: Step[] = [
  {
    name: "test-runtime-contract",
    cmd: process.execPath,
    args: ["--import", "tsx", "scripts/test-runtime-contract.ts"],
  },
  {
    name: "test-resolver-golden",
    cmd: process.execPath,
    args: ["--import", "tsx", "scripts/test-resolver-golden.ts"],
  },
  {
    name: "test-gate-markers",
    cmd: process.execPath,
    args: ["--import", "tsx", "scripts/test-gate-markers.ts"],
  },
];

function canonicalizeSqliteUrl(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return v;
  return v.startsWith("file:") ? v : `file:${v}`;
}

function injectPreSmokeGuards(steps: Step[]): Step[] {
  const i = steps.findIndex((s) => s.name === "smoke-prod-surface");
  if (i < 0) return steps;
  return [...steps.slice(0, i), ...PRE_SMOKE_GUARDS, ...steps.slice(i)];
}

function withSmokeEnvOverride(steps: Step[], canonicalSmokeDbUrl: string): Step[] {
  return steps.map((s) => {
    if (s.name !== "smoke-prod-surface") return s;
    return {
      ...s,
      env: { ...process.env, ...s.env, DATABASE_URL: canonicalSmokeDbUrl },
    };
  });
}

const FULL_STEPS_BASE: Step[] = [
  {
    name: "rc-build",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_build.ts", "--bundle", "fixtures/rc/canonical_bundle.json", "--out", ".rc/latest"],
  },
  {
    name: "rc-verify",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_verify.ts", "--bundle", ".rc/latest"],
  },
  {
    name: "rc-smoke",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_smoke.ts", "--bundle", ".rc/latest"],
  },
  { name: "prisma-validate", cmd: "bash", args: ["scripts/with-sqlite-env.sh", "npx", "prisma", "validate"] },
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.typecheck.json"] },
  { name: "boundary-lock", cmd: "node", args: ["--import", "tsx", "scripts/check-entropy-usage.ts"] },
  { name: "artifact-manifest", cmd: "node", args: ["--import", "tsx", "scripts/test-artifact-manifest.ts", "--gate"] },
  { name: "ci-billing", cmd: "npm", args: ["run", "ci:billing"] },
  { name: "ci-creator", cmd: "npm", args: ["run", "ci:creator"] },
  { name: "test-scenario-bootstrap", cmd: "node", args: ["--import", "tsx", "scripts/test-scenario-bootstrap.ts"] },
  { name: "validate-scenario", cmd: "node", args: ["--import", "tsx", "scripts/validate-scenario.ts", "scenarios"] },
  {
    name: "test-adventure-from-scenario",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-adventure-from-scenario.ts"],
  },
  {
    name: "test-route-adventure-from-scenario",
    cmd: "bash",
    args: [
      "scripts/with-sqlite-env.sh",
      "node",
      "--import",
      "tsx",
      "scripts/test-route-adventure-from-scenario.ts",
    ],
  },
  {
    name: "test-adventure-idempotency",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-adventure-idempotency.ts"],
  },
  { name: "test-opening-turn", cmd: "bash", args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-opening-turn.ts"] },
  {
    name: "test-replay-invariant",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-replay-invariant.ts"],
  },
  {
    name: "test-scenario-community",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-scenario-community.ts"],
  },
  {
    name: "test-route-scenario-public",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-public.ts"],
  },
  {
    name: "test-route-scenario-fork",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-fork.ts"],
  },
  {
    name: "test-route-scenario-publish",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-publish.ts"],
  },
  {
    name: "test-route-scenario-unpublish",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-unpublish.ts"],
  },
  {
    name: "test-route-scenario-mine",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-mine.ts"],
  },
  {
    name: "test-route-scenario-public-page",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-public-page.ts"],
  },
  {
    name: "test-route-scenario-mine-page",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-mine-page.ts"],
  },
  {
    name: "test-route-scenario-create-cap",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-create-cap.ts"],
  },
  {
    name: "test-route-scenario-fork-cap",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-scenario-fork-cap.ts"],
  },
  {
    name: "test-route-error-safety",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-route-error-safety.ts"],
  },
  {
    name: "test-rate-limit-turn",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-rate-limit-turn.ts"],
  },
  {
    name: "smoke-prod-surface",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/smoke-prod-surface.ts"],
  },
  {
    name: "registry-install",
    cmd: "node",
    args: ["--import", "tsx", "scripts/test-install-module.ts", "--gate"],
  },
  {
    name: "cache-audit",
    cmd: "node",
    args: ["--import", "tsx", "scripts/test-install-tamper.ts", "--gate"],
  },
  {
    name: "test-ux-consequences",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ux-consequences.ts"],
  },
  {
    name: "test-ui-consequences-drawer",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ui-consequences-drawer.ts"],
  },
  {
    name: "upgrade-flow",
    cmd: "node",
    args: ["--import", "tsx", "scripts/test-upgrade-module.ts", "--gate"],
  },
  {
    name: "module-lock",
    cmd: "node",
    args: ["--import", "tsx", "scripts/test-module-lock.ts", "--gate"],
  },
];

const TEST_STEPS_BASE: Step[] = [
  {
    name: "rc-build",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_build.ts", "--bundle", "fixtures/rc/canonical_bundle.json", "--out", ".rc/latest"],
  },
  {
    name: "rc-verify",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_verify.ts", "--bundle", ".rc/latest"],
  },
  {
    name: "rc-smoke",
    cmd: "node",
    args: ["--import", "tsx", "scripts/rc/rc_bundle_smoke.ts", "--bundle", ".rc/latest"],
  },
  { name: "prisma-validate", cmd: "bash", args: ["scripts/with-sqlite-env.sh", "npx", "prisma", "validate"] },
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit", "-p", "tsconfig.typecheck.json"] },
  { name: "boundary-lock", cmd: "node", args: ["--import", "tsx", "scripts/check-entropy-usage.ts"] },
  { name: "artifact-manifest", cmd: "node", args: ["--import", "tsx", "scripts/test-artifact-manifest.ts"] },
  { name: "test-scenario-bootstrap", cmd: "node", args: ["--import", "tsx", "scripts/test-scenario-bootstrap.ts"] },
  { name: "validate-scenario", cmd: "node", args: ["--import", "tsx", "scripts/validate-scenario.ts", "scenarios"] },
  {
    name: "test-ui-consequences-drawer",
    cmd: "bash",
    args: ["scripts/with-sqlite-env.sh", "node", "--import", "tsx", "scripts/test-ui-consequences-drawer.ts"],
  },
  { name: "test-golden-replays", cmd: "node", args: ["--import", "tsx", "scripts/test-golden-replays.ts"] },
  { name: "test-stress-replays", cmd: "node", args: ["--import", "tsx", "scripts/test-stress-replays.ts"] },
];

function getSteps(opts: { testMode: boolean; canonicalSmokeDbUrl: string }): Step[] {
  const base = opts.testMode ? TEST_STEPS_BASE : FULL_STEPS_BASE;
  const guarded = injectPreSmokeGuards(base);
  return withSmokeEnvOverride(guarded, opts.canonicalSmokeDbUrl);
}

function runStep(step: Step): Promise<{ name: string; ok: boolean; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(step.cmd, step.args, {
      stdio: "inherit",
      env: step.env ?? process.env,
    });

    child.on("exit", (code) => resolve({ name: step.name, ok: code === 0, code }));
    child.on("error", () => resolve({ name: step.name, ok: false, code: 1 }));
  });
}

async function main() {
  const testMode = process.argv.includes("--test-mode");
  const isDry = process.argv.includes("--dry");

  const canonicalSmokeDbUrl = canonicalizeSqliteUrl(process.env.DATABASE_URL ?? "");

  console.log("RELEASE_GATE_BEGIN");
  console.log(`SMOKE_ENV_DATABASE_URL=${canonicalSmokeDbUrl}`);

  const steps = getSteps({ testMode, canonicalSmokeDbUrl });

  if (isDry) {
    console.log("GATE_DRY_OK");
    for (const s of steps) console.log(`GATE_STEP ${s.name}`);
    process.exit(0);
  }

  const results: Array<{ name: string; ok: boolean; code: number | null }> = [];

  for (const s of steps) {
    results.push(await runStep(s));
  }

  console.log("GATE_SUMMARY_BEGIN");
  for (const r of results) {
    console.log(`GATE_STEP_RESULT ${r.name} ${r.ok ? "OK" : "FAIL"} ${r.code ?? "null"}`);
  }
  console.log("GATE_SUMMARY_END");

  console.log("RELEASE_GATE_END");
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
