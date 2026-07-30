"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, Gauge, Settings } from "lucide-react";
import BottomNav, { isRouteActive, navItems } from "./BottomNav";
import CloudDeviceSync from "./CloudDeviceSync";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/login");

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <CloudDeviceSync />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[#050505]/95 px-4 py-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 flex min-h-11 items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black">
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
                className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm font-black uppercase transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]"
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

      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[var(--border)] bg-[#050505]/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded bg-[var(--accent)] text-black">
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
            className={`grid h-10 w-10 place-items-center rounded-md border ${
              pathname.startsWith("/command")
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-md border ${
              pathname.startsWith("/settings")
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="min-h-screen overflow-x-hidden pb-[calc(6rem+env(safe-area-inset-bottom))] md:ml-64 md:pb-8">
        <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 md:px-6 md:py-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
