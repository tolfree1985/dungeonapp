import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ArtifactFileEntry = {
  path: string;
  bytes: number;
  sha256: string;
};

type ArtifactManifestBase = {
  artifactVersion: 1;
  nodeVersion: string;
  files: ArtifactFileEntry[];
  gitCommit?: string;
  releaseTag?: string;
};

type ArtifactManifest = ArtifactManifestBase & {
  manifestHash: string;
};

type BuildArtifactManifestOptions = {
  rootDir: string;
  artifactDirs: string[];
  ensureBuild: boolean;
};

function parseArgs(argv: string[]): BuildArtifactManifestOptions {
  let rootDir = process.cwd();
  let artifactDirs = [".next", "public"];
  let ensureBuild = false;

  for (const arg of argv) {
    if (arg === "--ensure-build") {
      ensureBuild = true;
      continue;
    }
    if (arg.startsWith("--root=")) {
      const value = arg.slice("--root=".length).trim();
      if (value) {
        rootDir = path.resolve(value);
      }
      continue;
    }
    if (arg.startsWith("--artifact-dirs=")) {
      const raw = arg.slice("--artifact-dirs=".length);
      artifactDirs = raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      continue;
    }
  }

  if (artifactDirs.length === 0) {
    artifactDirs = [".next", "public"];
  }

  artifactDirs = [...new Set(artifactDirs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return { rootDir, artifactDirs, ensureBuild };
}

function sha256Hex(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function toPosixRelative(rootDir: string, absolutePath: string): string {
  const rel = path.relative(rootDir, absolutePath);
  return rel.split(path.sep).join("/");
}

function walkFiles(rootDir: string, dirPath: string): ArtifactFileEntry[] {
  const entries: ArtifactFileEntry[] = [];
  const names = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => {
    const aName = a.name;
    const bName = b.name;
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  });

  for (const entry of names) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkFiles(rootDir, abs));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const bytes = fs.readFileSync(abs);
    entries.push({
      path: toPosixRelative(rootDir, abs),
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
    });
  }

  return entries;
}

function hasBuildOutput(rootDir: string, artifactDirs: string[]): boolean {
  for (const dir of artifactDirs) {
    const abs = path.join(rootDir, dir);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) continue;
    return true;
  }
  return false;
}

function maybeEnsureBuild(rootDir: string, artifactDirs: string[], ensureBuild: boolean): void {
  if (!ensureBuild) return;
  if (hasBuildOutput(rootDir, artifactDirs)) return;
  const result = spawnSync("npm", ["run", "build"], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`ARTIFACT_BUILD_FAILED: ${(result.stderr ?? result.stdout ?? "").trim()}`);
  }
}

function readGitCommit(): string | undefined {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) return undefined;
  const out = (result.stdout ?? "").trim();
  if (!/^[a-f0-9]{40}$/.test(out)) return undefined;
  return out;
}

function readReleaseTag(): string | undefined {
  const result = spawnSync("git", ["tag", "--points-at", "HEAD", "--list", "release-*"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) return undefined;
  const tags = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (tags.length === 0) return undefined;
  return tags[0];
}

function buildManifestBase(rootDir: string, artifactDirs: string[]): ArtifactManifestBase {
  const files: ArtifactFileEntry[] = [];
  for (const dir of artifactDirs) {
    const absDir = path.join(rootDir, dir);
    if (!fs.existsSync(absDir)) continue;
    const stat = fs.statSync(absDir);
    if (!stat.isDirectory()) continue;
    files.push(...walkFiles(rootDir, absDir));
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const base: ArtifactManifestBase = {
    artifactVersion: 1,
    nodeVersion: process.version,
    files,
  };

  const gitCommit = readGitCommit();
  if (gitCommit) base.gitCommit = gitCommit;
  const releaseTag = readReleaseTag();
  if (releaseTag) base.releaseTag = releaseTag;

  return base;
}

function serializeManifestBase(base: ArtifactManifestBase): string {
  const ordered: ArtifactManifestBase = {
    artifactVersion: 1,
    ...(base.gitCommit ? { gitCommit: base.gitCommit } : {}),
    ...(base.releaseTag ? { releaseTag: base.releaseTag } : {}),
    nodeVersion: base.nodeVersion,
    files: base.files.map((entry) => ({
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
  };
  return JSON.stringify(ordered);
}

function serializeManifest(manifest: ArtifactManifest): string {
  const ordered: ArtifactManifest = {
    artifactVersion: 1,
    ...(manifest.gitCommit ? { gitCommit: manifest.gitCommit } : {}),
    ...(manifest.releaseTag ? { releaseTag: manifest.releaseTag } : {}),
    nodeVersion: manifest.nodeVersion,
    files: manifest.files.map((entry) => ({
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
    manifestHash: manifest.manifestHash,
  };
  return JSON.stringify(ordered);
}

export function buildArtifactManifest(options: BuildArtifactManifestOptions): ArtifactManifest {
  maybeEnsureBuild(options.rootDir, options.artifactDirs, options.ensureBuild);
  const base = buildManifestBase(options.rootDir, options.artifactDirs);
  const manifestHash = sha256Hex(serializeManifestBase(base));
  return {
    ...base,
    manifestHash,
  };
}

export function parseArtifactManifestJson(raw: string): ArtifactManifest | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.artifactVersion !== 1) return null;
    if (typeof value.nodeVersion !== "string") return null;
    if (typeof value.manifestHash !== "string") return null;
    if (!Array.isArray(value.files)) return null;
    const files: ArtifactFileEntry[] = [];
    for (const entry of value.files) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const e = entry as Record<string, unknown>;
      if (typeof e.path !== "string") return null;
      if (typeof e.bytes !== "number" || !Number.isFinite(e.bytes)) return null;
      if (typeof e.sha256 !== "string") return null;
      files.push({
        path: e.path,
        bytes: Math.trunc(e.bytes),
        sha256: e.sha256,
      });
    }

    const manifest: ArtifactManifest = {
      artifactVersion: 1,
      nodeVersion: value.nodeVersion,
      files,
      manifestHash: value.manifestHash,
    };
    if (typeof value.gitCommit === "string") manifest.gitCommit = value.gitCommit;
    if (typeof value.releaseTag === "string") manifest.releaseTag = value.releaseTag;
    return manifest;
  } catch {
    return null;
  }
}

export function serializeArtifactManifest(manifest: ArtifactManifest): string {
  return serializeManifest(manifest);
}

export function computeArtifactManifestHash(manifest: Omit<ArtifactManifest, "manifestHash">): string {
  return sha256Hex(
    serializeManifestBase({
      artifactVersion: 1,
      nodeVersion: manifest.nodeVersion,
      files: manifest.files,
      ...(manifest.gitCommit ? { gitCommit: manifest.gitCommit } : {}),
      ...(manifest.releaseTag ? { releaseTag: manifest.releaseTag } : {}),
    }),
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const manifest = buildArtifactManifest(options);
  console.log(`ARTIFACT_MANIFEST_JSON ${serializeManifest(manifest)}`);
}

main();
