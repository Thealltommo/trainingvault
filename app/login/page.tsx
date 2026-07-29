import { Lock } from "lucide-react";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "Password did not match. Try again.",
  "missing-password": "TRAINVAULT_PASSWORD is not set on the server.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorKey ? errorMessages[errorKey] : null;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 text-[var(--text)]">
      <section className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-md bg-[var(--accent)] text-black">
            <Lock className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
          </span>
          <div>
            <p className="tv-label">Private access</p>
            <h1 className="text-3xl font-black uppercase leading-none">TrainVault</h1>
          </div>
        </div>

        <form action="/api/login" method="post" className="tv-card grid gap-5 p-5">
          <div>
            <p className="tv-label">Password</p>
            <p className="mt-2 text-sm text-[var(--muted)]">One-user training vault. No public accounts.</p>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-[rgba(255,255,255,0.25)] bg-black px-3 py-2 text-sm font-bold text-[var(--text)]">
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
            Enter vault
          </button>
        </form>
      </section>
    </main>
  );
}
