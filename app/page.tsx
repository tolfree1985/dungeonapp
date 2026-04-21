import Image from "next/image";
import { Cormorant_Garamond } from "next/font/google";

const heroSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
        </div>
      </header>

      <section className="relative z-10 min-h-screen px-6">
        <div
          className="absolute left-1/2 top-[70%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 text-center md:top-[68%] md:gap-4"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.18) 0%, rgba(0, 0, 0, 0.08) 40%, rgba(0, 0, 0, 0) 70%)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "120% 120%",
          }}
        >
          <p
            className={`${heroSerif.className} mb-2 text-[12px] font-medium uppercase tracking-[0.3em] text-[#FFFFFF]/50`}
            style={{ textShadow: "0 1px 1px rgba(0, 0, 0, 0.18)", filter: "blur(0.12px)" }}
          >
            A WORLD OF CONSEQUENCE
          </p>

          <h1
            className={`${heroSerif.className} text-6xl font-semibold tracking-[0.015em] text-[#E8E4DC] sm:text-7xl md:text-8xl`}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(255,255,255,0.98) 0%, rgba(245,242,235,0.88) 20%, rgba(215,220,225,0.65) 55%, rgba(165,170,175,0.48) 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 1px 0 rgba(255,255,255,0.18), 0 0 1px rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.18)",
              WebkitTextStroke: "0.15px rgba(0, 0, 0, 0.14)",
              filter: "drop-shadow(0 1px 0 rgba(0, 0, 0, 0.08))",
            }}
          >
            CHRONICLE
          </h1>

          <p
            className={`${heroSerif.className} mt-[0.8rem] text-[12px] font-medium tracking-[0.08em] text-[#FFFFFF]/90`}
            style={{ textShadow: "0 1px 1px rgba(0, 0, 0, 0.1)", filter: "blur(0.08px)" }}
          >
            An RPG storytelling engine
          </p>

          <p
            className={`${heroSerif.className} mt-[1.25rem] text-base font-medium tracking-[0.02em] text-[#FFFFFF]/70 sm:text-lg`}
            style={{ textShadow: "0 1px 1px rgba(0, 0, 0, 0.14)", filter: "blur(0.08px)" }}
          >
            Your actions shape the story.
          </p>

          <button
            className={`${heroSerif.className} group relative mt-[1.75rem] inline-flex min-w-[260px] items-center justify-center overflow-hidden border border-[rgba(255,255,255,0.4)] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),rgba(0,0,0,0)_55%)] px-10 py-4 text-sm uppercase tracking-[0.22em] text-[rgba(255,255,255,0.92)] shadow-[0_6px_18px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-[1px] transition-[transform,box-shadow,border-color,color,background-color] duration-90 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:border-[rgba(255,255,255,0.45)] hover:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),rgba(0,0,0,0)_55%)] hover:text-[rgba(255,255,255,0.95)] hover:shadow-[0_14px_32px_rgba(0,0,0,0.38),0_2px_6px_rgba(0,0,0,0.25)] active:translate-y-[2px] active:scale-[0.982] active:border-[rgba(255,255,255,0.55)] active:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.04),rgba(0,0,0,0)_55%)] active:shadow-[0_2px_6px_rgba(0,0,0,0.35)]`}
            style={{ textShadow: "0 1px 1px rgba(0, 0, 0, 0.14)" }}
          >
            BEGIN THE CHRONICLE
          </button>
        </div>
      </section>
    </main>
  );
}
