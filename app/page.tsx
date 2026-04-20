import Image from "next/image";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {/**
       * HERO VISUAL LOCK (v4-final)
       *
       * DO NOT:
       * - add global brightness/contrast filters
       * - reintroduce heavy overlays
       * - center radial gradients symmetrically
       * - flatten fog or edge variation
       *
       * This composition is image-led and physically tuned.
       * Any change must preserve:
       * - directional lighting
       * - depth separation
       * - path-based eye flow
       */}
      <Image
        src="/chronicle_hero.png"
        alt="Chronicle landing background"
        fill
        priority
        className="object-cover object-[center_32%]"
        style={{ filter: "brightness(1.03) contrast(1.08)", imageRendering: "auto", transform: "translateZ(0)", backfaceVisibility: "hidden" }}
        sizes="100vw"
      />

      <div
        className="pointer-events-none absolute inset-0 bg-[url('/chronicle_noise.png')] bg-repeat opacity-[0.03] mix-blend-overlay"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.16)_35%,rgba(0,0,0,0.16)_65%,rgba(0,0,0,0.6)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_36%_52%,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0.4)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_38%,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.06)_22%,rgba(0,0,0,0.0)_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_42%,rgba(255,255,255,0.07)_0%,transparent_40%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_25%_60%,rgba(0,0,0,0.09)_0%,rgba(0,0,0,0.0)_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_70%,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.0)_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_30%,rgba(255,255,255,0.03)_0%,rgba(0,0,0,0.0)_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.18)_30%,rgba(0,0,0,0.0)_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_42%_85%,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_24%,rgba(0,0,0,0.0)_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.0)_55%)]" />

      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-12 mt-4 flex items-center justify-between border border-white/10 bg-black/12 px-5 py-3 backdrop-blur-[0.5px]">
          <div className="flex items-center gap-4 text-white/62">
            <div className="h-6 w-6 border border-white/28" />
            <span className="text-[11px] uppercase tracking-[0.42em]">Chronicle</span>
          </div>

          <nav className="flex items-center gap-8 text-[11px] uppercase tracking-[0.42em] text-white/48">
            <span>Ash</span>
            <span>Ruin</span>
            <span>Ember</span>
          </nav>
        </div>
      </header>

      <section className="relative z-10 min-h-screen px-6">
        <div className="absolute left-1/2 top-[70%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 text-center md:top-[68%] md:gap-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#CFC8B8]/82">
            The world does not forget
          </p>

          <h1 className="text-6xl font-medium tracking-[0.08em] text-[#E6E1D9] sm:text-7xl md:text-8xl" style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" }}>
            CHRONICLE
          </h1>

          <p className="mt-[0.8rem] text-lg font-medium uppercase tracking-[0.12em] text-[#D6D1C6] sm:text-xl">
            Nothing is without consequence.
          </p>

          <button className="mt-[1.8rem] border border-[rgba(196,168,110,0.55)] bg-transparent px-7 py-[14px] text-sm uppercase tracking-[0.12em] text-[#F5F5F0]/90 shadow-none backdrop-blur-[1px] transition duration-200 ease-out hover:border-[rgba(196,168,110,0.75)] hover:bg-[rgba(196,168,110,0.04)] hover:translate-y-[-1px]">
            Begin the Chronicle
          </button>
        </div>
      </section>
    </main>
  );
}
