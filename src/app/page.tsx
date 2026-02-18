import Image from "next/image";
import { ConsequencesDrawer } from "@/components/ConsequencesDrawer";
import { ResolutionBadge } from "@/components/ResolutionBadge";
import styles from "./page.module.css";

const demoTurns = [
  {
    id: "t1",
    playerText: "Inspect the dock lantern.",
    assistantText: "You find fresh oil and a hidden crest engraved in the base.",
    outcome: "success",
    stateDeltas: [{ op: "set", path: "/flags/crestSeen", value: true }],
    ledgerAdds: [{ type: "clue", summary: "Hidden crest found in lantern base." }],
  },
  {
    id: "t2",
    playerText: "Ask the night guard who was here last.",
    assistantText: "He mentions a courier in a dark coat heading east just before midnight.",
    outcome: "mixed",
    stateDeltas: [{ op: "set", path: "/flags/knowsCourierDirection", value: "east" }],
    ledgerAdds: [{ type: "witness", summary: "Courier seen heading east before midnight." }],
  },
] as const;

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className={styles.intro}>
          <h1>To get started, edit the page.tsx file.</h1>
          <p>
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className={styles.ctas}>
          <a
            className={styles.primary}
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className={styles.logo}
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className={styles.secondary}
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>

        <section style={{ width: "100%", marginTop: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Turn Transcript</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {demoTurns.map((t, index) => {
              const maybeEventId = (t as { eventId?: unknown }).eventId;
              const stableTurnId =
                typeof maybeEventId === "string" && maybeEventId.length > 0
                  ? maybeEventId
                  : typeof t.id === "string" && t.id.length > 0
                    ? t.id
                    : String(index);

              return (
                <article
                  key={t.id}
                  style={{
                    width: "100%",
                    border: "1px solid #2b2b2b",
                    borderRadius: 12,
                    padding: "0.75rem",
                    background: "rgba(10,10,10,0.25)",
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>You</div>
                  <div style={{ marginTop: 4 }}>{t.playerText}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <div style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Narrator</div>
                    <ResolutionBadge outcome={t.outcome} />
                    <a
                      href={`#turn-${stableTurnId}-consequences`}
                      className="ml-2 text-xs text-neutral-400 underline hover:text-neutral-200"
                    >
                      See why
                    </a>
                  </div>
                  <div style={{ marginTop: 4 }}>{t.assistantText}</div>
                  <div id={`turn-${stableTurnId}-consequences`}>
                    <ConsequencesDrawer
                      stateDeltas={t.stateDeltas}
                      ledgerAdds={t.ledgerAdds}
                      anchorId={`turn-${stableTurnId}-consequences`}
                      detailsId={`details-turn-${stableTurnId}-consequences`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
