import fs from "node:fs";
import path from "node:path";
import {
  buildArtifactManifest,
  computeArtifactManifestHash,
  parseArtifactManifestJson,
} from "./build-artifact-manifest";

type VerifyArgs = {
  rootDir: string;
  artifactDirs: string[];
  manifestJson?: string;
  manifestPath?: string;
};

function parseArgs(argv: string[]): VerifyArgs {
  let rootDir = process.cwd();
  let artifactDirs = [".next", "public"];
  let manifestJson: string | undefined;
  let manifestPath: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--root=")) {
      const value = arg.slice("--root=".length).trim();
      if (value) rootDir = path.resolve(value);
      continue;
    }
    if (arg.startsWith("--artifact-dirs=")) {
      const value = arg.slice("--artifact-dirs=".length);
      artifactDirs = value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      continue;
    }
    if (arg.startsWith("--manifest-json=")) {
      manifestJson = arg.slice("--manifest-json=".length);
      continue;
    }
    if (arg.startsWith("--manifest-path=")) {
      manifestPath = path.resolve(arg.slice("--manifest-path=".length));
      continue;
    }
  }

  if (artifactDirs.length === 0) {
    artifactDirs = [".next", "public"];
  }
  artifactDirs = [...new Set(artifactDirs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return { rootDir, artifactDirs, manifestJson, manifestPath };
}

function fail(markers: string[]): never {
  for (const marker of markers) {
    console.log(marker);
  }
  process.exit(1);
}

function readManifestJson(args: VerifyArgs): string {
  if (args.manifestJson && args.manifestJson.length > 0) return args.manifestJson;
  if (args.manifestPath) {
    return fs.readFileSync(args.manifestPath, "utf8");
  }
  throw new Error("ARTIFACT_VERIFY_MANIFEST_MISSING");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const expectedRaw = readManifestJson(args);
  const expected = parseArtifactManifestJson(expectedRaw);
  if (!expected) {
    fail(["ARTIFACT_MANIFEST_HASH_MISMATCH"]);
  }

  const actual = buildArtifactManifest({
    rootDir: args.rootDir,
    artifactDirs: args.artifactDirs,
    ensureBuild: false,
  });

  const markers: string[] = [];
  const expectedFiles = new Map(expected.files.map((file) => [file.path, file]));
  const actualFiles = new Map(actual.files.map((file) => [file.path, file]));

  const allPaths = [...new Set([...expectedFiles.keys(), ...actualFiles.keys()])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  for (const filePath of allPaths) {
    const expectedFile = expectedFiles.get(filePath);
    const actualFile = actualFiles.get(filePath);
    if (!actualFile) {
      markers.push(`ARTIFACT_MISSING_FILE ${filePath}`);
      continue;
    }
    if (!expectedFile) {
      markers.push(`ARTIFACT_HASH_MISMATCH ${filePath}`);
      continue;
    }
    if (expectedFile.bytes !== actualFile.bytes || expectedFile.sha256 !== actualFile.sha256) {
      markers.push(`ARTIFACT_HASH_MISMATCH ${filePath}`);
    }
  }

  const expectedHashRecomputed = computeArtifactManifestHash({
    artifactVersion: 1,
    nodeVersion: expected.nodeVersion,
    files: expected.files,
    ...(expected.gitCommit ? { gitCommit: expected.gitCommit } : {}),
    ...(expected.releaseTag ? { releaseTag: expected.releaseTag } : {}),
  });

  if (expectedHashRecomputed !== expected.manifestHash || actual.manifestHash !== expected.manifestHash) {
    markers.push("ARTIFACT_MANIFEST_HASH_MISMATCH");
  }

  if (markers.length > 0) {
    fail(markers);
  }

  console.log("ARTIFACT_VERIFY_OK");
}

main();
