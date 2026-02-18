type EnforceArgs = {
  rawModelText: string;
  prevState: any;
};

type Ok = { ok: true; contract: any; nextState: any };
type Bad = { ok: false; errors: Array<{ path?: string; message: string }> };

export function enforceTurnContract(args: EnforceArgs): Ok | Bad {
  // Minimal “JSON-only” enforcement for now:
  // - Must be valid JSON
  // - Must contain required top-level keys used by your handler
  let parsed: any;
  try {
    parsed = JSON.parse(args.rawModelText);
  } catch {
    return { ok: false, errors: [{ message: "Model output was not valid JSON" }] };
  }

  const required = ["scene", "resolution", "deltas", "next", "locks"];
  const missing = required.filter((k) => parsed?.[k] == null);
  if (missing.length) {
    return { ok: false, errors: missing.map((k) => ({ path: k, message: `Missing key: ${k}` })) };
  }

  // Your stub contract already includes deltas.state + deltas.ledger.
  // For now, treat nextState as prevState unchanged (you can implement patching later).
  const nextState = args.prevState ?? {};

  return { ok: true, contract: parsed, nextState };
}
