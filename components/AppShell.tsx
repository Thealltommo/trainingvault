"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Dumbbell, Gauge, Settings, Sparkles } from "lucide-react";
import BottomNav, { isRouteActive, navItems } from "./BottomNav";
import CloudDeviceSync from "./CloudDeviceSync";
import LatestSessionHero from "./LatestSessionHero";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/login");
  const showLatestSession = pathname === "/" || pathname.startsWith("/command");
  const showPlanStudioPrompt = pathname === "/plan";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <CloudDeviceSync />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[#050505]/95 px-4 py-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 flex min-h-11 items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black shadow-[0_0_32px_rgba(215,255,47,0.18)]">
            <Dumbbell className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-lg font-black uppercase leading-none">TrainVault</span>
            <span className="text-xs font-bold uppercase text-[var(--muted)]">Athlete operating system</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-black uppercase transition-all ${
                  active
                    ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)] shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={2.2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
            Private · adaptive · evidence-led
          </p>
          <p className="mt-1 text-[0.65rem] font-bold uppercase text-[var(--muted)]">
            Canonical cloud · remote Garmin · rollback history
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[var(--border)] bg-[#050505]/90 px-4 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded bg-[var(--accent)] text-black shadow-[0_0_24px_rgba(215,255,47,0.18)]">
            <Dumbbell className="h-4.5 w-4.5" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-black uppercase leading-none">TrainVault</span>
            <span className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
              Athlete OS
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/command"
            aria-label="Command center"
            aria-current={pathname.startsWith("/command") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-lg border ${
              pathname.startsWith("/command")
                ? "border-[var(--accent)] bg-[rgba(215,255,47,0.08)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-lg border ${
              pathname.startsWith("/settings")
                ? "border-[var(--accent)] bg-[rgba(215,255,47,0.08)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="min-h-screen overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] md:ml-64 md:pb-8">
        <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 md:px-6 md:py-8">
          {showPlanStudioPrompt ? (
            <Link href="/plan/build" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[rgba(215,255,47,0.3)] bg-[linear-gradient(110deg,rgba(215,255,47,0.12),rgba(215,255,47,0.025)_55%,transparent)] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.2)] transition-transform hover:-translate-y-0.5 sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-black">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="tv-label text-[var(--accent)]">Plan Studio</p>
                  <p className="mt-1 text-sm font-black uppercase sm:text-base">Build a goal-led block around your real week</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            </Link>
          ) : null}
          {showLatestSession ? <div className="mb-5"><LatestSessionHero /></div> : null}
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
