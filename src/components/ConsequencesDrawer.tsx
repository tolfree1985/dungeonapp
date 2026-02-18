type ConsequencesDrawerProps = {
  stateDeltas?: unknown[];
  ledgerAdds?: unknown[];
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 overflow-auto rounded-md bg-black/40 p-2 text-[11px] leading-snug text-neutral-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ConsequencesDrawer(props: ConsequencesDrawerProps) {
  const stateDeltas = Array.isArray(props.stateDeltas) ? props.stateDeltas : [];
  const ledgerAdds = Array.isArray(props.ledgerAdds) ? props.ledgerAdds : [];

  const hasAnything = stateDeltas.length > 0 || ledgerAdds.length > 0;

  return (
    <details className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950/30 p-3">
      <summary className="cursor-pointer select-none text-sm text-neutral-200">
        Why did this happen?
        {!hasAnything ? <span className="ml-2 text-xs text-neutral-500">(no changes)</span> : null}
      </summary>

      <div className="mt-3 space-y-4">
        <section>
          <div className="text-xs font-semibold tracking-wide text-neutral-300">STATE DELTAS</div>
          {stateDeltas.length ? <JsonBlock value={stateDeltas} /> : <div className="mt-2 text-xs text-neutral-500">None.</div>}
        </section>

        <section>
          <div className="text-xs font-semibold tracking-wide text-neutral-300">CAUSAL LEDGER</div>
          {ledgerAdds.length ? <JsonBlock value={ledgerAdds} /> : <div className="mt-2 text-xs text-neutral-500">None.</div>}
        </section>
      </div>
    </details>
  );
}
