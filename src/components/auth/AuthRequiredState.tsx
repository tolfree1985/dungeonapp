export default function AuthRequiredState({
  title = "Authentication required",
  message = "Please sign in to continue.",
  nextPath = "/login",
}: {
  title?: string;
  message?: string;
  nextPath?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-8 text-center text-slate-100 shadow-lg">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="text-sm text-slate-400">{message}</p>
      <a
        href={nextPath}
        className="inline-flex items-center justify-center rounded-full border border-indigo-500 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Sign in
      </a>
    </div>
  );
}
