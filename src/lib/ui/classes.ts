export const ui = {
  shell: "min-h-screen bg-[#0a0b10] text-[#f3efe6]",
  pageWrap: "mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8",
  playSurface: "mx-auto max-w-6xl px-6 py-8",
  pageGrid: "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8",
  leftColumn: "space-y-6",
  rightColumn: "space-y-6",
  topBar:
    "mb-6 flex items-center justify-between rounded-[24px] border border-[rgba(214,180,90,0.16)] bg-[linear-gradient(180deg,rgba(29,35,48,0.92),rgba(18,22,30,0.96))] px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur",
  panel: "rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-lg",
  sectionLabel:
    "text-[11px] font-semibold uppercase tracking-[0.28em] text-[#c9a35a]/85",
  smallMeta: "text-[11px] text-[#a59e90]",
  chip:
    "inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium",
  heroIllustration:
    "aspect-[16/6] w-full rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_60%),rgba(0,0,0,0.25)]",
  heroTitle: "text-4xl font-semibold tracking-tight text-white",
  heroSubtitle: "text-sm text-zinc-400 mt-1",
  heroLead: "text-[18px] leading-8 text-[#f3f0e8]",
  heroParagraph: "text-[16px] font-serif leading-7 text-[#e9dfcc]",
  heroSystemStrip: "rounded-[18px] border border-amber-300/20 bg-black/15 px-4 py-3 text-sm text-[#d8d2c3]",
  heroMeta: "text-xs uppercase tracking-wider text-zinc-500",
  systemChip: "text-xs px-2 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300",
  systemChipMuted: "text-xs px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-500",
} as const;
