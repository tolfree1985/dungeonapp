"use client";

import Link from "next/link";

export default function AuthRequiredState({
  title = "Authentication required",
  message = "Please sign in to continue.",
  actionHref = "/login",
  actionLabel = "Sign in",
  secondaryActionHref,
  secondaryActionLabel,
}: {
  title?: string;
  message?: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-8 text-center text-slate-100 shadow-lg">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="text-sm text-slate-400">{message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={actionHref}
          className="inline-flex items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.35)] transition hover:bg-violet-500"
        >
          {actionLabel}
        </Link>
        {secondaryActionHref ? (
          <Link
            href={secondaryActionHref}
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/80 hover:border-white/40 hover:text-white"
          >
            {secondaryActionLabel ?? "Secondary action"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
