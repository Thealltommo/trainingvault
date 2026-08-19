import { Lock, Shield } from "lucide-react";
import AgogeWarriorArt from "@/components/AgogeWarriorArt";

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#07101e] px-4 py-10 text-white">
      <AgogeWarriorArt className="pointer-events-none absolute -right-40 -top-28 h-[48rem] w-[48rem] opacity-[0.38] sm:-right-24" variant="combined" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,13,28,0.99)_0%,rgba(4,18,38,0.9)_55%,rgba(4,18,38,0.35)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--agoge-red),transparent)]" />

      <section className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="tv-brand-mark relative h-12 w-12">
            <Shield className="h-6 w-6" aria-hidden="true" strokeWidth={2.4} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--agoge-red)] ring-2 ring-[#07162a]" />
          </span>
          <div>
            <p className="text-[0.64rem] font-black uppercase tracking-[0.16em] text-[#82afff]">Private athlete OS · V4</p>
            <h1 className="agoge-wordmark mt-1 text-3xl font-black uppercase leading-none">The Agoge</h1>
          </div>
        </div>

        <form action="/api/login" method="post" className="grid gap-5 rounded-2xl border border-white/12 bg-[#07162a]/82 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <input type="hidden" name="next" value={nextValue ?? "/"} />
          <div>
            <div className="flex items-center gap-2 text-[#82afff]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <p className="text-[0.64rem] font-black uppercase tracking-[0.14em]">Private access</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#b8c8da]">Garmin, training history, planning and coaching stay behind one private boundary.</p>
          </div>

          {errorMessage ? (
            <p className="rounded-lg border border-[rgba(255,64,86,0.42)] bg-[rgba(255,64,86,0.12)] px-3 py-2 text-sm font-bold text-[#ffd9de]">
              {errorMessage}
            </p>
          ) : null}

          <label className="grid gap-2">
            <span className="sr-only">Password</span>
            <input
              className="min-h-11 w-full rounded-xl border border-white/14 bg-black/20 px-3 text-white outline-none placeholder:text-[#748ba6] focus:border-[#6da3ff] focus:ring-2 focus:ring-[rgba(79,140,255,0.18)]"
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
