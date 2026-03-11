import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionCookieValue,
  sessionAuthConfigured,
  sessionCookieName,
  validateAuthCredentials,
} from "@/lib/auth/session";

async function loginAction(formData: FormData) {
  "use server";

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const actor = validateAuthCredentials(username, password);

  if (!actor) {
    redirect("/login?error=invalid");
  }

  const cookieValue = createSessionCookieValue({
    id: actor.id,
    displayName: actor.displayName,
  });

  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName(), cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect("/play");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const configured = sessionAuthConfigured();

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-16 text-stone-100">
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-500/20 bg-stone-900/80 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-amber-300">Sign in</h1>

        <p className="mt-3 text-sm leading-6 text-stone-300">
          Local Chronicle sign-in for play-route verification.
        </p>

        {!configured ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            AUTH_CREDENTIALS is not configured.
          </div>
        ) : null}

        {params.error === "invalid" ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            Invalid username or password.
          </div>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-300">
              Username
            </label>
            <input
              name="username"
              type="text"
              autoComplete="username"
              className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-stone-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-300">
              Password
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-stone-100"
            />
          </div>

          <button
            type="submit"
            disabled={!configured}
            className="inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
