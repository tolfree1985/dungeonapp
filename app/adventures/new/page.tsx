import Link from "next/link";

export default function StartAdventurePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">Start a new adventure</h1>
        <p className="text-center text-sm text-white/70">
          New adventure creation is not yet available in this build. Return to the play dashboard to resume an existing session or check back later.
        </p>
        <Link
          href="/play"
          className="inline-flex items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Go to play dashboard
        </Link>
      </section>
    </main>
  );
}
