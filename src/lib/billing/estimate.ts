export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function clampOutputTokens(requested: number, maxAllowed: number): number {
  const n = Number.isFinite(requested) ? Math.floor(requested) : 0;
  return Math.max(0, Math.min(Math.max(0, maxAllowed), n));
}
