export const MAX_JSON_BODY_BYTES = 32 * 1024;

const textEncoder = new TextEncoder();

export class RequestBodyTooLargeError extends Error {
  readonly status = 413;
  readonly code = "PAYLOAD_TOO_LARGE";
  readonly maxBytes: number;
  readonly actualBytes: number | null;

  constructor(maxBytes: number, actualBytes: number | null = null) {
    super("Payload Too Large");
    this.name = "RequestBodyTooLargeError";
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export function isRequestBodyTooLargeError(error: unknown): error is RequestBodyTooLargeError {
  return error instanceof RequestBodyTooLargeError;
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

async function readRawBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  const contentLength = parseContentLength(req.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes, contentLength);
  }

  const raw = await req.text();
  const actualBytes = textEncoder.encode(raw).byteLength;
  if (actualBytes > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes, actualBytes);
  }

  return raw;
}

export async function readJsonWithLimit<T = unknown>(
  req: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T> {
  const raw = await readRawBodyWithLimit(req, maxBytes);
  return JSON.parse(raw) as T;
}

export async function readJsonWithLimitOrNull<T = unknown>(
  req: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T | null> {
  try {
    return await readJsonWithLimit<T>(req, maxBytes);
  } catch (error) {
    if (isRequestBodyTooLargeError(error)) throw error;
    return null;
  }
}
