import { Lock, Shield } from "lucide-react";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "Password did not match. Try again.",
  "missing-password": "TRAINVAULT_PASSWORD is not set on the server.",
  "rate-limited": "Too many attempts. Wait a few minutes and try again.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorKey ? errorMessages[errorKey] : null;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10 text-[var(--text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(79,140,255,0.14),transparent_30rem),radial-gradient(circle_at_8%_100%,rgba(255,64,86,0.08),transparent_28rem)]" />
      <section className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center rounded-xl border border-[rgba(255,64,86,0.5)] bg-[#08182d] text-[#dce8ff] shadow-[0_0_0_3px_rgba(79,140,255,0.07)]">
            <Shield className="h-6 w-6" aria-hidden="true" strokeWidth={2.4} />
          </span>
          <div>
            <p className="tv-label text-[var(--accent)]">Private athlete OS</p>
            <h1 className="text-3xl font-black uppercase leading-none">The Agoge</h1>
          </div>
        </div>

        <form action="/api/login" method="post" className="tv-card grid gap-5 p-5">
          <input type="hidden" name="next" value={nextValue ?? "/"} />
          <div>
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <p className="tv-label text-[var(--accent)]">Password</p>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">One athlete. Garmin, planning, recovery and coaching in one private system.</p>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-[rgba(255,64,86,0.34)] bg-[rgba(255,64,86,0.08)] px-3 py-2 text-sm font-bold text-[var(--text)]">
              {errorMessage}
            </p>
          ) : null}

          <label className="grid gap-2">
            <span className="sr-only">Password</span>
            <input
              className="tv-input"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter private password"
              required
            />
          </label>

          <button type="submit" className="tv-button-primary w-full">
            Enter The Agoge
          </button>
        </form>
      </section>
    </main>
  );
}