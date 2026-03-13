import { Usage429Error } from "../../../app/api/turn/enforceUsageTx";

export type UsageVerdict =
  | { allowed: true }
  | { allowed: false; code: string; retryAt: string | null; hash?: string | null };

export async function enforceUsageVerdict(
  tx: any,
  args: { saveId: string; adventureId: string; idempotencyKey: string; hash?: string | null },
  deps: {
    enforceUsageTx: (tx: any, args: { saveId: string; idempotencyKey: string }) => Promise<any>;
  }
): Promise<UsageVerdict> {
  try {
    const res = await deps.enforceUsageTx(tx, args);

    if (res && typeof res === "object" && (res as any).allowed === false) {
      return {
        allowed: false,
        code: (res as any).code ?? "CONCURRENCY_LIMIT_EXCEEDED",
        retryAt: (res as any).retryAt ?? null,
        hash: (res as any).hash ?? null,
      };
    }

    return { allowed: true };
  } catch (e: any) {
    if (e instanceof Usage429Error) {
      return {
        allowed: false,
        code: e.payload.code,
        retryAt: typeof e.payload.retryAt === "string" ? e.payload.retryAt : null,
        hash: (e.payload as any)?.eventHash ?? null,
      };
    }

    const name = e?.name;
    if (name === "BillingError") {
      return {
        allowed: false,
        code: e.code ?? "CONCURRENCY_LIMIT_EXCEEDED",
        retryAt: e.retryAt ?? null,
        hash: e.hash ?? null,
      };
    }

    throw e;
  }
}
