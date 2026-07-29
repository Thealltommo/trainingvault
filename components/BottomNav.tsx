"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
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

export function isRouteActive(item: NavItem, pathname: string) {
  return item.match(pathname);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[#050505]/95 backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-6">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.58rem] font-black uppercase sm:text-[0.66rem] ${
                active ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
