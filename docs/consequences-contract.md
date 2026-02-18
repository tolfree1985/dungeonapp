# Consequences Payload Contract

Turn payload always contains:
stateDeltas: [] | Array<...>
ledgerAdds: [] | Array<...>

Ordering rule: render in received order; no sort/dedupe/merge.

Source precedence: result.* -> turnJson.* -> []

Deterministic check: scripts/test-ux-consequences.ts prints UX CONSEQUENCES OK
