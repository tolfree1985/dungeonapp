export type ConsequencesPayload = {
  stateDeltas?: unknown[];
  ledgerAdds?: unknown[];
};

export function getConsequences(p: ConsequencesPayload) {
  const stateDeltas = Array.isArray(p.stateDeltas) ? p.stateDeltas : [];
  const ledgerAdds = Array.isArray(p.ledgerAdds) ? p.ledgerAdds : [];
  return { stateDeltas, ledgerAdds };
}
