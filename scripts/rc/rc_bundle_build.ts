import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { RcBundleManifest } from "./_rc_bundle_types";
import { sha256Bytes } from "./_hash";
import { mustGetArg } from "./_cli";
import { buildSupportManifestFromBundle, serializeSupportManifest } from "../../src/lib/support/supportManifest";

type SupportManifestLike = {
  engineVersion?: string;
  scenarioContentHash?: string;
  adventureId?: string;
  [k: string]: unknown;
};

type TurnInputsPayload = {
  note: string;
  turnInputs: RcBundleManifest["turnInputs"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function isDirectory(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function readPackageVersion(): string {
  const pkgPath = join(process.cwd(), "package.json");
  if (!isFile(pkgPath)) return "unknown";
  const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown };
  return typeof raw.version === "string" && raw.version.trim().length > 0 ? raw.version.trim() : "unknown";
}

function toPosix(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

function walkFiles(dir: string): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  const root = dir;

  const walk = (current: string) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push({
        rel: toPosix(relative(root, abs)),
        abs,
      });
    }
  };

  walk(root);
  return out;
}

function readStringPath(source: unknown, paths: string[][]): string {
  for (const pathParts of paths) {
    let current: unknown = source;
    for (const part of pathParts) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[part];
    }
    if (typeof current === "string" && current.trim().length > 0) {
      return current.trim();
    }
    if (typeof current === "number") {
      return String(current);
    }
  }
  return "";
}

function readSeed(source: unknown): string | number {
  const paths = [["seed"], ["rngSeed"], ["adventure", "seed"], ["debug", "seed"]];
  for (const pathParts of paths) {
    let current: unknown = source;
    for (const part of pathParts) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[part];
    }
    if (typeof current === "string" && current.trim().length > 0) return current.trim();
    if (typeof current === "number" && Number.isFinite(current)) return current;
  }
  return "unknown";
}

function extractTurnInputsFromBundleJson(bundleJson: unknown): RcBundleManifest["turnInputs"] {
  const root = isRecord(bundleJson) ? bundleJson : {};
  const turns = Array.isArray(root.turns)
    ? root.turns
    : isRecord(root.replay) && Array.isArray(root.replay.turns)
      ? root.replay.turns
      : Array.isArray(root.history)
        ? root.history
        : [];

  const out: RcBundleManifest["turnInputs"] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const turnRecord = isRecord(turn) ? turn : {};
    const input =
      turnRecord.input ??
      turnRecord.playerInput ??
      turnRecord.player_text ??
      turnRecord.command ??
      null;
    if (input === null || input === undefined) continue;
    const turnIndexRaw = turnRecord.turnIndex ?? turnRecord.seq;
    const turnIndex =
      typeof turnIndexRaw === "number" && Number.isInteger(turnIndexRaw)
        ? turnIndexRaw
        : typeof turnIndexRaw === "string" && /^-?\d+$/.test(turnIndexRaw.trim())
          ? Number(turnIndexRaw.trim())
          : i;
    out.push({ turnIndex, input });
  }

  out.sort((a, b) => a.turnIndex - b.turnIndex);
  return out;
}

function findBundleJsonInDir(bundleDir: string): string | null {
  const candidates = walkFiles(bundleDir)
    .filter((entry) => entry.rel.toLowerCase().endsWith(".json"))
    .map((entry) => entry.abs)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (candidates.length === 0) return null;
  const bundleNamed = candidates.find((abs) => basename(abs).toLowerCase() === "bundle.json");
  return bundleNamed ?? candidates[0];
}

function loadBundleJson(bundlePath: string): { bundleJson: unknown; sourceJsonPath: string | null; sourceIsJsonFile: boolean } {
  if (isFile(bundlePath)) {
    if (!bundlePath.toLowerCase().endsWith(".json")) {
      throw new Error(`--bundle file must be JSON for manifest derivation: ${bundlePath}`);
    }
    const raw = readFileSync(bundlePath, "utf8");
    return { bundleJson: JSON.parse(raw), sourceJsonPath: bundlePath, sourceIsJsonFile: true };
  }
  if (isDirectory(bundlePath)) {
    const discovered = findBundleJsonInDir(bundlePath);
    if (!discovered) {
      throw new Error(`No JSON bundle found under directory: ${bundlePath}`);
    }
    const raw = readFileSync(discovered, "utf8");
    return { bundleJson: JSON.parse(raw), sourceJsonPath: discovered, sourceIsJsonFile: false };
  }
  throw new Error(`--bundle must be a file or directory: ${bundlePath}`);
}

function writeJsonStable(pathName: string, value: unknown): void {
  writeFileSync(pathName, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

async function main(): Promise<void> {
  const bundlePath = mustGetArg("--bundle");
  const outDir = mustGetArg("--out");

  mkdirSync(outDir, { recursive: true });
  const originalOutDir = join(outDir, "originalBundle");
  mkdirSync(originalOutDir, { recursive: true });

  if (isDirectory(bundlePath)) {
    cpSync(bundlePath, join(originalOutDir, basename(bundlePath)), { recursive: true });
  } else if (isFile(bundlePath)) {
    cpSync(bundlePath, join(originalOutDir, basename(bundlePath)));
  } else {
    throw new Error(`--bundle must be a file or directory: ${bundlePath}`);
  }

  const { bundleJson, sourceIsJsonFile } = loadBundleJson(bundlePath);
  const supportManifest = (await buildSupportManifestFromBundle(bundleJson)) as unknown as SupportManifestLike;

  const supportManifestOrdered = JSON.parse(serializeSupportManifest(supportManifest as any));
  writeJsonStable(join(outDir, "support_manifest.json"), supportManifestOrdered);

  const turnInputsPayload: TurnInputsPayload = sourceIsJsonFile
    ? {
        note: "derived deterministically from source bundle JSON",
        turnInputs: extractTurnInputsFromBundleJson(bundleJson),
      }
    : {
        note: "source bundle is not a direct JSON file; turnInputs set deterministically to empty",
        turnInputs: [],
      };

  writeJsonStable(join(outDir, "turn_inputs.json"), turnInputsPayload);

  const files: RcBundleManifest["files"] = {};
  for (const entry of walkFiles(outDir)) {
    if (entry.rel === "manifest.json") continue;
    const bytes = readFileSync(entry.abs);
    files[toPosix(entry.rel)] = { sha256: sha256Bytes(bytes), bytes: bytes.length };
  }

  const scenarioIdFromBundle = readStringPath(bundleJson, [["scenarioId"], ["scenario", "id"]]);
  const scenarioHashFromBundle = readStringPath(bundleJson, [["scenarioContentHash"], ["scenario", "contentHash"]]);
  const adventureIdFromBundle = readStringPath(bundleJson, [["adventureId"], ["adventure", "id"]]);

  const manifest: RcBundleManifest = {
    rcBundleVersion: 1,
    engineVersion: (supportManifest.engineVersion as string | undefined) ?? readPackageVersion(),
    scenarioId: scenarioIdFromBundle || "unknown",
    scenarioContentHash:
      ((supportManifest.scenarioContentHash as string | undefined) ?? scenarioHashFromBundle) || "unknown",
    createdAtIso: "unknown",
    adventureId: ((supportManifest.adventureId as string | undefined) ?? adventureIdFromBundle) || "unknown",
    seed: readSeed(bundleJson),
    turnInputs: turnInputsPayload.turnInputs,
    files,
  };

  writeJsonStable(join(outDir, "manifest.json"), manifest);
  console.log("RC_BUNDLE_BUILD_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
