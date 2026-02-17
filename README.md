---

## 📊 Pricing & Cost Review Triggers

This project intentionally delays final pricing decisions until real usage data exists.

We do NOT optimize for unlimited turns early.
We optimize for deterministic engine stability and meaningful gameplay first.

### 🎯 Decision Gates (Objective Triggers)

Pricing and turn limits will only be reviewed when ONE of the following happens:

- 10,000 total turns logged
- 100 active users
- Cost per user exceeds 30% of subscription price

Until one of those triggers occurs:

- No pricing changes
- No turn cap increases
- No unlimited promises
- No premature cost optimizations

---

## 💰 Cost Philosophy

This system is engineered to reduce marginal token cost per turn by:

- Externalizing state (state-driven narrative)
- Enforcing consequences in-engine
- Avoiding large context injections
- Using deterministic lifecycle rules
- Supporting smaller model usage where possible

The goal is:

> Spend engineering effort to reduce per-turn token burn.

---

## 🚀 Current Phase

We are in:

ENGINE + UX VALIDATION PHASE

Focus:
- Deterministic intercept lifecycle
- Replay safety
- Escalation → consequence mapping
- Clear player-facing pressure UX

NOT focus:
- Pricing tiers
- Unlimited marketing
- Growth hacks

Those come after real usage data.

---

## Determinism Invariants

- `/api/scenario/public` and `/api/scenario/mine` must remain ordered by `updatedAt desc`, then `id desc`.
- Paging must use `cursor` with `skip: 1`.
- UI must not reorder, merge, or dedupe scenario lists; server order is the source of truth.
