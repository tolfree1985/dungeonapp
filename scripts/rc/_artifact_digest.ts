import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { sha256Bytes } from "./_hash";

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function toPosix(pathName: string): string {
  return pathName.replace(/\\/g, "/");
}

function walkFiles(dir: string): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  const root = dir;

  const walk = (current: string) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
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

export function computeDirectoryDigest(dir: string): string {
  const files = walkFiles(dir).sort((a, b) => compareText(a.rel, b.rel));
  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(file.abs);
    const fileDigest = sha256Bytes(bytes);
    hash.update(file.rel, "utf8");
    hash.update("\n", "utf8");
    hash.update(fileDigest, "utf8");
    hash.update("\n", "utf8");
    hash.update(String(bytes.length), "utf8");
    hash.update("\n", "utf8");
  }
  return hash.digest("hex");
}
