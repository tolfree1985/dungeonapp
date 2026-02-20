const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function walkFiles(root) {
  const out = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push({ rel: toPosix(path.relative(root, abs)), abs });
    }
  }
  walk(root);
  return out;
}

function computeDirectoryDigest(dir) {
  const files = walkFiles(dir).sort((a, b) => compareText(a.rel, b.rel));
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    const data = fs.readFileSync(file.abs);
    const fileHash = crypto.createHash("sha256").update(data).digest("hex");
    digest.update(file.rel, "utf8");
    digest.update("\n", "utf8");
    digest.update(fileHash, "utf8");
    digest.update("\n", "utf8");
    digest.update(String(data.length), "utf8");
    digest.update("\n", "utf8");
  }
  return digest.digest("hex");
}

module.exports = { hashFile, computeDirectoryDigest };
