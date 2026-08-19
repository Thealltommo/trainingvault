"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Moon, Shield, Sun, Upload } from "lucide-react";
import BottomNav, { isRouteActive, navItems } from "./BottomNav";

type AppShellProps = {
  children: ReactNode;
};

type ThemeMode = "light" | "dark";

const THEME_KEY = "agoge-theme";

function routeTitle(pathname: string) {
  const active = navItems.find((item) => isRouteActive(item, pathname));
  if (active) return active.label;
  if (pathname.startsWith("/admin")) return "Data & Import";
  if (pathname.startsWith("/debug")) return "Diagnostics";
  return "The Agoge";
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/login");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const pageTitle = useMemo(() => routeTitle(pathname), [pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const preferred: ThemeMode =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 overflow-hidden border-r border-white/10 bg-[var(--sidebar)] text-[var(--sidebar-text)] md:flex md:flex-col">
        <Image
          src="/assets/hero8.png"
          alt=""
          fill
          sizes="240px"
          className="pointer-events-none object-cover opacity-20"
          style={{ objectPosition: "57% center" }}
          priority
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,17,36,0.6)_0%,rgba(4,17,36,0.9)_48%,rgba(4,17,36,0.99)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(circle_at_35%_100%,rgba(221,31,54,0.24),transparent_65%)]" />

        <div className="relative z-10 flex h-full flex-col px-3 py-4">
          <Link href="/" className="mb-5 flex min-h-12 items-center gap-3 rounded-xl px-2">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[var(--red)] bg-[#07162a]/90 text-white shadow-[0_0_0_4px_rgba(221,31,54,0.08)]">
              <Shield className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[#07162a]" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-black tracking-[-0.04em] text-white">THE AGOGE</span>
              <span className="block text-[0.58rem] font-extrabold uppercase tracking-[0.17em] text-[#91a8c4]">
                Train · Adapt · Conquer
              </span>
            </span>
          </Link>

          <nav aria-label="Primary" className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(item, pathname);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm font-bold transition-colors ${
                    active
                      ? "border-[rgba(79,140,255,0.34)] bg-[rgba(79,140,255,0.16)] text-white"
                      : "border-transparent text-[var(--sidebar-muted)] hover:border-white/10 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--red)]" /> : null}
                  <Icon className={`h-4.5 w-4.5 ${active ? "text-[#74a6ff]" : ""}`} aria-hidden="true" strokeWidth={2.1} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="px-3 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-[#6f87a5]">System</p>
            <Link
              href="/admin/import"
              className={`mt-2 flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm font-bold transition-colors ${
                pathname.startsWith("/admin")
                  ? "border-[rgba(221,31,54,0.34)] bg-[rgba(221,31,54,0.12)] text-white"
                  : "border-transparent text-[var(--sidebar-muted)] hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Upload className="h-4.5 w-4.5" aria-hidden="true" />
              Data & Import
            </Link>
          </div>

          <div className="mt-auto rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-[#b7c7da]">
              <Database className="h-4 w-4 text-[#74a6ff]" aria-hidden="true" />
              Your private training system
            </div>
            <p className="mt-2 text-[0.66rem] leading-relaxed text-[#7f95af]">
              Every logged session sharpens the coaching signal.
            </p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen overflow-x-hidden pb-24 md:ml-60 md:pb-8">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--surface)]/88 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-5 lg:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-tight text-[var(--text)]">{pageTitle}</p>
              <p className="hidden text-[0.67rem] font-semibold text-[var(--muted)] sm:block">Train with intent. Adapt from evidence.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4.5 w-4.5" aria-hidden="true" /> : <Moon className="h-4.5 w-4.5" aria-hidden="true" />}
              </button>
              <Link
                href="/coaching"
                className="hidden min-h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-extrabold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] sm:inline-flex"
              >
                Coach notes
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1440px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
