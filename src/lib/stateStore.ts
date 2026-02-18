/**
 * In-memory state store (dev / MVP)
 * - Session-scoped
 * - Determinism-safe (defensive clone on load/save)
 * - Intercept-ready (guarantees intercepts state exists)
 *
 * NOTE:
 * Intercepts seed is stored under state.intercepts.seed and ONLY set if missing.
 * This prevents accidental seed churn across turns.
 */

type AnyState = Record<string, any>;

const mem = new Map<string, AnyState>();

function deepClone<T>(obj: T): T {
  return obj == null ? obj : structuredClone(obj);
}

function ensureInterceptState(state: AnyState, sessionId?: string): AnyState {
  state.intercepts ??= {};

  // Ensure arrays exist
  state.intercepts.active ??= [];
  state.intercepts.history ??= [];

  // Deterministic seed: set once, never overwrite
  if (state.intercepts.seed == null) {
    state.intercepts.seed =
      state.seed ??
      state.world?.seed ??
      sessionId ??
      state.sessionId ??
      "default-seed";
  }

  return state;
}

export function loadState(sessionId: string): AnyState | null {
  const raw = mem.get(sessionId);
  if (!raw) return null;

  const cloned = deepClone(raw);
  // Ensure intercept structure exists on read
  return ensureInterceptState(cloned, sessionId);
}

export function saveState(sessionId: string, state: AnyState): void {
  // Attach sessionId for downstream systems (ledger, intercept seed fallback)
  state.sessionId = sessionId;

  // Ensure intercept structure exists on write
  const prepared = ensureInterceptState(state, sessionId);
  mem.set(sessionId, deepClone(prepared));
}
