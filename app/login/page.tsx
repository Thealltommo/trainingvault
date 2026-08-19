import Image from "next/image";
import { Lock, Shield } from "lucide-react";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "Password did not match. Try again.",
  "missing-password": "The private access password is not configured on the server.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = errorKey ? errorMessages[errorKey] : null;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[var(--sidebar)] px-4 py-10 text-white">
      <Image src="/assets/hero8.png" alt="" fill priority sizes="100vw" className="object-cover opacity-32" style={{ objectPosition: "65% center" }} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,15,32,0.97),rgba(3,20,42,0.8),rgba(3,20,42,0.5))]" />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--red),transparent)]" />

      <section className="relative z-10 w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center rounded-full border-2 border-[var(--red)] bg-[#07162a]/90 text-white">
            <Shield className="h-6 w-6" aria-hidden="true" strokeWidth={2.3} />
          </span>
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#84b1ff]">Private training system</p>
            <h1 className="text-3xl font-black tracking-[-0.045em]">THE AGOGE</h1>
          </div>
        </div>

        <form action="/api/login" method="post" className="grid gap-5 rounded-2xl border border-white/12 bg-[#07162a]/82 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-2 text-[#8ab5ff]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <p className="text-[0.65rem] font-black uppercase tracking-[0.14em]">Private access</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#b4c4d7]">One athlete. One evolving plan. No public accounts.</p>
          </div>

          {errorMessage ? (
            <p className="rounded-lg border border-[rgba(255,65,87,0.4)] bg-[rgba(255,65,87,0.12)] px-3 py-2 text-sm font-bold text-[#ffd7dc]">
              {errorMessage}
            </p>
          ) : null}

          <label className="grid gap-2">
            <span className="sr-only">Password</span>
            <input
              className="min-h-11 w-full rounded-lg border border-white/14 bg-black/20 px-3 text-white outline-none placeholder:text-[#748ba6] focus:border-[#6da3ff] focus:ring-2 focus:ring-[rgba(79,140,255,0.18)]"
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
