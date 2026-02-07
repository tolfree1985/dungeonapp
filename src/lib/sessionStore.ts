export type SessionState = {
  state: any;
  ledger: any[];
  memory: {
    summary: string;
    activeCards: any[];
  };
};

const STORE = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState | null {
  return STORE.get(sessionId) ?? null;
}

export function setSession(sessionId: string, data: SessionState) {
  STORE.set(sessionId, data);
}

export function clearSession(sessionId: string) {
  STORE.delete(sessionId);
}
