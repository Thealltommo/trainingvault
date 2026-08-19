"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Gauge,
  Moon,
  Settings,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import AgogeWarriorArt from "./AgogeWarriorArt";
import BottomNav, { isRouteActive, navItems } from "./BottomNav";
import CloudDeviceSync from "./CloudDeviceSync";
import LatestSessionHero from "./LatestSessionHero";
import PlanManager from "./PlanManager";
import V4ProgrammeOverview from "./V4ProgrammeOverview";

type AppShellProps = {
  children: ReactNode;
};

type ThemeMode = "light" | "dark";

const THEME_KEY = "agoge_theme_v1";

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/login");
  const showLatestSession = pathname === "/" || pathname.startsWith("/command");
  const showPlanStudioPrompt = pathname === "/plan";
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const preferred: ThemeMode =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";

    document.documentElement.dataset.theme = preferred;
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <CloudDeviceSync />

      <aside className="tv-sidebar fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] border-r border-[var(--border)] px-5 py-6 md:flex md:flex-col">
        <AgogeWarriorArt
          className="agoge-shell-art pointer-events-none absolute -bottom-24 -left-24 h-[27rem] w-[27rem] opacity-[0.18]"
          variant="warrior"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-[linear-gradient(180deg,transparent,rgba(4,13,27,0.92))]" />

        <div className="relative z-10 flex h-full flex-col">
          <Link href="/" className="mb-8 flex min-h-12 items-center gap-3.5">
            <span className="tv-brand-mark relative">
              <Shield className="h-6 w-6" strokeWidth={2.25} aria-hidden="true" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--agoge-red)] ring-2 ring-[#07162a]" />
            </span>
            <span className="min-w-0">
              <span className="agoge-wordmark block text-[1.13rem] font-[900] uppercase leading-none">The Agoge</span>
              <span className="agoge-submark mt-1.5 block text-[0.59rem] font-bold uppercase">
                Athlete OS · V4
              </span>
            </span>
          </Link>

          <div className="mb-4 flex items-center justify-between border-y border-white/[0.055] py-3">
            <span className="text-[0.57rem] font-bold uppercase tracking-[0.16em] text-[var(--quiet)]">Navigation</span>
            <span className="flex items-center gap-1.5 text-[0.57rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--agoge-red)] shadow-[0_0_10px_rgba(255,64,86,0.5)]" />
              Live
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
                <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.15em] text-[#78a8ff]">
                  Train · adapt · conquer
                </p>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="agoge-theme-toggle h-8 w-8 rounded-lg"
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-2 text-[0.63rem] font-semibold leading-relaxed text-[var(--quiet)]">
                Garmin, recovery, planning and coach decisions stay in one private athlete record.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[var(--border)] bg-[color:var(--surface-glass)] px-4 backdrop-blur-2xl md:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <span className="tv-brand-mark relative h-8 w-8 rounded-lg">
            <Shield className="h-4.5 w-4.5" strokeWidth={2.4} aria-hidden="true" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--agoge-red)] ring-2 ring-[var(--surface)]" />
          </span>
          <span>
            <span className="agoge-wordmark block text-sm font-[900] uppercase leading-none">The Agoge</span>
            <span className="agoge-submark mt-1 block text-[0.53rem] font-bold uppercase">Athlete OS · V4</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="agoge-theme-toggle"
          >
            {theme === "dark" ? <Sun className="h-4.5 w-4.5" aria-hidden="true" /> : <Moon className="h-4.5 w-4.5" aria-hidden="true" />}
          </button>
          <Link
            href="/command"
            aria-label="Command center"
            aria-current={pathname.startsWith("/command") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-xl border backdrop-blur ${
              pathname.startsWith("/command")
                ? "border-[var(--accent-line)] bg-[var(--accent-wash)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[color:var(--surface-glass)] text-[var(--muted)]"
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
                ? "border-[var(--accent-line)] bg-[var(--accent-wash)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[color:var(--surface-glass)] text-[var(--muted)]"
            }`}
          >
            <Settings className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="tv-shell-content relative min-h-screen overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] md:ml-[15.5rem] md:pb-10">
        <AgogeWarriorArt
          className="agoge-shell-art pointer-events-none fixed -right-44 bottom-3 h-[34rem] w-[34rem] opacity-[0.045] md:-right-24 md:h-[42rem] md:w-[42rem] md:opacity-[0.06]"
          variant="mountain"
        />
        <div className="relative mx-auto w-full max-w-[1420px] px-3 py-4 sm:px-5 md:px-7 md:py-7 xl:px-9 xl:py-9">
          {showPlanStudioPrompt ? (
            <div className="mb-5">
              <V4ProgrammeOverview />
            </div>
          ) : null}

          {showPlanStudioPrompt ? <PlanManager /> : null}

          {showPlanStudioPrompt ? (
            <Link
              href="/plan/build"
              className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--accent-line)] bg-[linear-gradient(100deg,var(--accent-wash),rgba(255,64,86,0.035)_58%,transparent)] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5 sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--accent-line)] bg-[var(--accent-wash)] text-[var(--accent)]">
                  <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="tv-label text-[var(--accent)]">Agoge Plan Studio</p>
                  <p className="mt-1 text-sm font-[780] tracking-[-0.015em] sm:text-base">Build the next block around the athlete you actually are.</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--agoge-red)]" aria-hidden="true" />
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
