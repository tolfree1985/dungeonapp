type Props = { outcome: "success" | "mixed" | "fail" };

export function ResolutionBadge({ outcome }: Props) {
  const cfg =
    outcome === "success"
      ? { text: "✓ Success", cls: "bg-emerald-900/30 text-emerald-200 border-emerald-800" }
      : outcome === "mixed"
        ? {
            text: "⚠ Success w/ cost",
            cls: "bg-amber-900/30 text-amber-200 border-amber-800",
          }
        : { text: "✖ Fail-forward", cls: "bg-red-900/30 text-red-200 border-red-800" };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cfg.cls}`}>
      {cfg.text}
    </span>
  );
}
