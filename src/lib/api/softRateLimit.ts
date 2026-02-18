export type RateLimitAction = "scenario_create" | "scenario_fork" | "turn_post";

type Bucket = {
  windowStartMs: number;
  count: number;
};

const ONE_MINUTE_MS = 60_000;
const buckets = new Map<string, Bucket>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function buildKey(action: RateLimitAction, actorKey: string) {
  return `${action}:${actorKey}`;
}

function cleanupStale(nowMs: number) {
  if (buckets.size < 2048) return;
  for (const [key, bucket] of buckets.entries()) {
    if (nowMs - bucket.windowStartMs > ONE_MINUTE_MS * 2) {
      buckets.delete(key);
    }
  }
}

export function softRateActorKey(req: Request, ownerId?: string | null) {
  if (ownerId && ownerId.trim()) return `owner:${ownerId.trim()}`;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return `ip:${realIp.trim()}`;

  return "ip:unknown";
}

export function checkSoftRateLimit(args: {
  action: RateLimitAction;
  actorKey: string;
  limitPerMinute: number;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  cleanupStale(nowMs);

  const key = buildKey(args.action, args.actorKey);
  const existing = buckets.get(key);

  if (!existing || nowMs - existing.windowStartMs >= ONE_MINUTE_MS) {
    buckets.set(key, { windowStartMs: nowMs, count: 1 });
    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  if (existing.count >= args.limitPerMinute) {
    const retryAfterMs = Math.max(0, ONE_MINUTE_MS - (nowMs - existing.windowStartMs));
    return { allowed: false as const, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true as const, retryAfterSeconds: 0 };
}

export function softRateLimitCreatePerMinute() {
  return parsePositiveInt(process.env.SOFT_RATE_LIMIT_SCENARIO_CREATE_PER_MIN, 30);
}

export function softRateLimitForkPerMinute() {
  return parsePositiveInt(process.env.SOFT_RATE_LIMIT_SCENARIO_FORK_PER_MIN, 60);
}

export function softRateLimitTurnPostPerMinute() {
  return parsePositiveInt(process.env.SOFT_RATE_LIMIT_TURN_POST_PER_MIN, 30);
}
