"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Dumbbell, Gauge, Settings, Sparkles } from "lucide-react";
import BottomNav, { isRouteActive, navItems } from "./BottomNav";
import CloudDeviceSync from "./CloudDeviceSync";
import LatestSessionHero from "./LatestSessionHero";
import PlanManager from "./PlanManager";
import V4ProgrammeOverview from "./V4ProgrammeOverview";

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

      <aside className="tv-sidebar fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] border-r border-[var(--border)] px-5 py-6 md:flex md:flex-col">
        <Link href="/" className="mb-9 flex min-h-12 items-center gap-3.5">
          <span className="tv-brand-mark">
            <Dumbbell className="h-5.5 w-5.5" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[1.05rem] font-[850] uppercase leading-none tracking-[-0.035em]">TrainVault</span>
            <span className="mt-1.5 block text-[0.62rem] font-bold uppercase tracking-[0.13em] text-[var(--muted)]">
              Private athlete OS
            </span>
          </span>
        </Link>

        <div className="mb-4 flex items-center justify-between border-y border-white/[0.055] py-3">
          <span className="text-[0.57rem] font-bold uppercase tracking-[0.16em] text-[var(--quiet)]">Navigation</span>
          <span className="flex items-center gap-1.5 text-[0.57rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_rgba(215,255,47,0.55)]" />
            Active
          </span>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = isRouteActive(item, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tv-nav-item ${active ? "tv-nav-item-active" : ""}`}
              >
                <span className="tv-nav-index">{String(index + 1).padStart(2, "0")}</span>
                <Icon className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" strokeWidth={2.15} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <div className="border-t border-white/[0.065] pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.15em] text-[var(--accent)]">
                Evidence-led
              </p>
              <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[0.52rem] font-bold uppercase tracking-[0.1em] text-[var(--quiet)]">V4</span>
            </div>
            <p className="mt-2 text-[0.63rem] font-semibold leading-relaxed text-[var(--quiet)]">
              Plan, recovery, Garmin and coach decisions stay in one private training record.
            </p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[var(--border)] bg-[#060806]/90 px-4 backdrop-blur-2xl md:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <span className="tv-brand-mark h-8 w-8 rounded-lg">
            <Dumbbell className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-[850] uppercase leading-none tracking-[-0.03em]">TrainVault</span>
            <span className="mt-1 block text-[0.55rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Athlete OS</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/command"
            aria-label="Command center"
            aria-current={pathname.startsWith("/command") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-xl border backdrop-blur ${
              pathname.startsWith("/command")
                ? "border-[rgba(215,255,47,0.34)] bg-[rgba(215,255,47,0.08)] text-[var(--accent)]"
                : "border-[var(--border)] bg-black/20 text-[var(--muted)]"
            }`}
          >
            <Gauge className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-xl border backdrop-blur ${
              pathname.startsWith("/settings")
                ? "border-[rgba(215,255,47,0.34)] bg-[rgba(215,255,47,0.08)] text-[var(--accent)]"
                : "border-[var(--border)] bg-black/20 text-[var(--muted)]"
            }`}
          >
            <Settings className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="tv-shell-content min-h-screen overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] md:ml-[15.5rem] md:pb-10">
        <div className="relative mx-auto w-full max-w-[1420px] px-3 py-4 sm:px-5 md:px-7 md:py-7 xl:px-9 xl:py-9">
          {showPlanStudioPrompt ? (
            <div className="mb-7">
              <V4ProgrammeOverview />
            </div>
          ) : null}

          {showPlanStudioPrompt ? <PlanManager /> : null}

          {showPlanStudioPrompt ? (
            <Link
              href="/plan/build"
              className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-[rgba(215,255,47,0.22)] bg-[linear-gradient(100deg,rgba(215,255,47,0.085),rgba(215,255,47,0.018)_52%,rgba(255,255,255,0.012))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[rgba(215,255,47,0.32)] bg-[rgba(215,255,47,0.1)] text-[var(--accent)]">
                  <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="tv-label text-[var(--accent)]">Plan Studio</p>
                  <p className="mt-1 text-sm font-[780] tracking-[-0.015em] sm:text-base">Build a goal-led block around the week you actually live.</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            </Link>
          ) : null}

          {showLatestSession ? <div className="mb-7"><LatestSessionHero /></div> : null}
          {children}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
