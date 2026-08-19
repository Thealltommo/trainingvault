"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Gauge,
  Settings,
  SunMedium,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

export const navItems: NavItem[] = [
  {
    label: "Today",
    href: "/",
    icon: SunMedium,
    match: (pathname) => pathname === "/",
  },
  {
    label: "Command",
    href: "/command",
    icon: Gauge,
    match: (pathname) => pathname.startsWith("/command"),
  },
  {
    label: "Plan",
    href: "/plan",
    icon: CalendarDays,
    match: (pathname) =>
      pathname.startsWith("/plan") ||
      pathname.startsWith("/program") ||
      pathname.startsWith("/session"),
  },
  {
    label: "Log",
    href: "/log",
    icon: ClipboardList,
    match: (pathname) => pathname.startsWith("/log"),
  },
  {
    label: "Insights",
    href: "/insights/performance",
    icon: ChartNoAxesCombined,
    match: (pathname) =>
      pathname.startsWith("/insights") || pathname.startsWith("/progress"),
  },
  {
    label: "Coach",
    href: "/coach",
    icon: BrainCircuit,
    match: (pathname) => pathname.startsWith("/coach"),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    match: (pathname) =>
      pathname.startsWith("/settings") || pathname.startsWith("/admin"),
  },
];

const mobileNavItems = navItems.filter(
  (item) => item.href !== "/settings" && item.href !== "/command",
);

export function isRouteActive(item: NavItem, pathname: string) {
  return item.match(pathname);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 overflow-hidden rounded-[1.2rem] border border-[var(--border)] bg-[color:var(--surface-glass)] p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[0.85rem] px-1 text-[0.58rem] font-[780] uppercase tracking-[0.04em] transition-colors ${
                active
                  ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                  : "text-[var(--muted)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="absolute inset-x-5 top-0 h-px bg-[var(--agoge-red)] shadow-[0_0_10px_rgba(255,64,86,0.55)]" />
              ) : null}
              <Icon aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.1} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
