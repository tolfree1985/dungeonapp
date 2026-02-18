import crypto from "crypto";
import { stableStringify } from "@/lib/determinism/envelope";

export type ReceiptPayload = {
  eventId: string;
  seq: number;
  resultStateHash: string;
  envelopeHash: string;
  chainHash: string;
};

export function signReceipt(payload: ReceiptPayload, secret: string): string {
  const msg = stableStringify(payload);
  return crypto.createHmac("sha256", secret).update(msg, "utf8").digest("hex");
}
