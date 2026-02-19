import { spawn } from "node:child_process";

const SCRIPTS = [
  "scripts/test-route-error-safety.ts",
  "scripts/test-route-scenario-mine.ts",
  "scripts/test-route-scenario-public-page.ts",
  "scripts/test-route-scenario-mine-page.ts",
  "scripts/test-route-scenario-create-cap.ts",
  "scripts/test-route-scenario-fork-cap.ts",
  "scripts/test-ui-creator-page.ts",
];

function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      stdio: "inherit",
      env: { ...process.env },
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `smoke-prod-surface failed at ${script} (code=${String(code)}, signal=${String(signal)})`,
        ),
      );
    });
  });
}

async function main() {
  for (const script of SCRIPTS) {
    await runScript(script);
  }
  console.log("SMOKE PROD SURFACE OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
