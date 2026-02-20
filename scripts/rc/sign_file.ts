import { readFileSync, writeFileSync } from "node:fs";
import { sign } from "node:crypto";
import { mustGetArg } from "./_cli";

function main() {
  const filePath = mustGetArg("--file");
  const keyPath = mustGetArg("--key");
  const outPath = mustGetArg("--out");

  const data = readFileSync(filePath);
  const privateKey = readFileSync(keyPath, "utf8");
  const signature = sign(null, data, privateKey).toString("base64");
  writeFileSync(outPath, signature, "utf8");
  console.log("FILE_SIGNED");
}

main();
