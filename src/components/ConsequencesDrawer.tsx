type Props = {
  stateDeltas?: readonly unknown[];
  ledgerAdds?: readonly unknown[];
};

export function ConsequencesDrawer({ stateDeltas, ledgerAdds }: Props) {
  const deltas = Array.isArray(stateDeltas) ? stateDeltas : [];
  const ledger = Array.isArray(ledgerAdds) ? ledgerAdds : [];

  return (
    <details className="mt-3 rounded border border-neutral-800 p-3">
      <summary className="cursor-pointer text-sm text-neutral-300">
        Why did this happen?
      </summary>

      <div className="mt-3 space-y-4 text-xs">
        <div>
          <div className="font-semibold text-neutral-400">STATE DELTAS</div>
          <pre className="mt-1 overflow-auto bg-black/40 p-2">
            {JSON.stringify(deltas, null, 2)}
          </pre>
        </div>

        <div>
          <div className="font-semibold text-neutral-400">CAUSAL LEDGER</div>
          <pre className="mt-1 overflow-auto bg-black/40 p-2">
            {JSON.stringify(ledger, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  );
}
