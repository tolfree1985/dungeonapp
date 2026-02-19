import { NextResponse } from "next/server";

export function creatorRouteError(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error, code: code ?? error, ...(extra ?? {}) }, { status });
}
