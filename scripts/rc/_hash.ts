import { createHash } from "node:crypto";

export function sha256Bytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256String(str: string): string {
  return sha256Bytes(Buffer.from(str, "utf8"));
}
