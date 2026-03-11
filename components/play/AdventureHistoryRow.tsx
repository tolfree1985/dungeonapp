"use client";

type AdventureHistoryRowProps = {
  adventureId: string;
  resumeHref: string;
  scenarioTitle?: string | null;
  scenarioSummary?: string | null;
  scenarioId?: string | null;
  updatedAtLabel: string;
  isActive: boolean;
  isPinned: boolean;
  onPinToggle: () => void;
  onRemove: () => void;
  onCopyId: () => void;
};

export default function AdventureHistoryRow({
  adventureId,
  resumeHref,
  scenarioTitle,
  scenarioSummary,
  scenarioId,
  updatedAtLabel,
  isActive,
  isPinned,
  onPinToggle,
  onRemove,
  onCopyId,
}: AdventureHistoryRowProps) {
  const titleLabel = scenarioTitle ?? scenarioId ?? "Unknown scenario";

  const containerClasses = [
    "space-y-3 rounded-2xl border bg-white/80 px-4 py-4 shadow-sm transition hover:shadow-lg",
    isActive ? "border-emerald-300/60 bg-white ring-1 ring-emerald-300/50" : "border-slate-200",
  ].join(" ");

  return (
    <article className={containerClasses}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
        <span className="text-[10px] tracking-[0.4em]">{isActive ? "Current" : "Archived"}</span>
        <span className="text-[10px] text-slate-400">{updatedAtLabel}</span>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900">{titleLabel}</p>
        {scenarioSummary ? <p className="mt-1 text-sm text-slate-600">{scenarioSummary}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <a
          href={resumeHref}
          className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          Resume
        </a>
        <button
          type="button"
          onClick={onPinToggle}
          className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-700 transition hover:border-amber-400"
        >
          {isPinned ? "Unpin" : "Pin"}
        </button>
        <button
          type="button"
          onClick={onCopyId}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:border-slate-500"
        >
          Copy ID
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-500 transition hover:border-red-300 hover:text-red-600"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
