import Image from "next/image";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <Image
        src="/chronicle_hero.png"
        alt="Chronicle landing background"
        fill
        priority
        className="object-cover object-[center_32%]"
        style={{ filter: "brightness(0.88) contrast(0.94) saturate(0.92)" }}
        sizes="100vw"
      />

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.66)_0%,rgba(0,0,0,0.26)_28%,rgba(0,0,0,0.16)_50%,rgba(0,0,0,0.24)_66%,rgba(0,0,0,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.06)_0%,rgba(0,0,0,0.16)_40%,rgba(0,0,0,0.42)_100%)]" />

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

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 pt-28 md:pt-36">
        <div className="mx-auto flex max-w-4xl translate-y-8 flex-col items-center text-center md:translate-y-12">
          <p className="mb-7 text-[11px] uppercase tracking-[0.48em] text-white/42">
            The world does not forget
          </p>

          <h1 className="text-6xl font-semibold tracking-[0.12em] text-white sm:text-7xl md:text-8xl">
            CHRONICLE
          </h1>

          <p className="mt-4 text-lg uppercase tracking-[0.2em] text-white/72 sm:text-xl">
            Nothing is without consequence.
          </p>

          <div className="mt-11 space-y-3 text-lg text-white/64">
            <p>Every action is recorded.</p>
          </div>

          <button className="mt-11 border border-amber-200/70 bg-amber-200/12 px-10 py-4 text-sm uppercase tracking-[0.28em] text-white/94 shadow-[0_0_20px_rgba(255,200,120,0.15)] backdrop-blur-[1px] transition hover:border-amber-200/85 hover:bg-amber-200/18">
            Enter the Chronicle
          </button>

          <p className="mt-4 text-[11px] uppercase tracking-[0.38em] text-white/44">
            Replayable. Inspectable. Irreversible.
          </p>
        </div>
      </section>
    </main>
  );
}
