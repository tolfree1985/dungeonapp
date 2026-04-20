import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPublicScenarios } from "@/lib/scenario/scenarioRepo";
import ScenarioStartButton from "@/components/scenarios/ScenarioStartButton";

type ScenarioRow = {
  id: string;
  title: string;
  summary: string | null;
  ownerId: string | null;
  visibility: string;
};

export default async function ScenariosPage() {
  const scenarios = await prisma.$transaction(async (tx) => {
    return listPublicScenarios(tx as any, { take: 50 }) as Promise<ScenarioRow[]>;
  });

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">Chronicle</p>
          <h1 className="text-4xl font-semibold">Scenarios</h1>
          <p className="max-w-2xl text-sm text-white/65">
            Pick a scenario and start a fresh canonical run. Each start uses the same bootstrap pipeline the engine
            uses everywhere else.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/70 transition hover:border-white/30"
          >
            Back home
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No public scenarios yet.
            </div>
          ) : (
            scenarios.map((scenario) => (
              <article
                key={scenario.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{scenario.title}</h2>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-white/40">
                        {scenario.visibility}
                      </p>
                    </div>
                  </div>
                  <p className="min-h-12 text-sm leading-6 text-white/70">
                    {scenario.summary ?? "No summary yet."}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.28em] text-white/35">{scenario.id}</span>
                    <ScenarioStartButton scenarioId={scenario.id} />
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
