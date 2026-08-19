"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  ChartNoAxesCombined,
  ClipboardList,
  Dumbbell,
  House,
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
    label: "Dashboard",
    href: "/",
    icon: House,
    match: (pathname) => pathname === "/",
  },
  {
    label: "Plan",
    href: "/program",
    icon: Dumbbell,
    match: (pathname) => pathname.startsWith("/program") || pathname.startsWith("/session"),
  },
  {
    label: "Log",
    href: "/log",
    icon: ClipboardList,
    match: (pathname) => pathname.startsWith("/log"),
  },
  {
    label: "Performance",
    href: "/progress",
    icon: ChartNoAxesCombined,
    match: (pathname) => pathname.startsWith("/progress"),
  },
  {
    label: "Coaching",
    href: "/coaching",
    icon: BrainCircuit,
    match: (pathname) => pathname.startsWith("/coaching"),
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[color:var(--surface)]/95 shadow-[0_-8px_26px_rgba(5,20,45,0.08)] backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isRouteActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.62rem] font-extrabold transition-colors ${
                active ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {active ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--red)]" /> : null}
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.1} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
