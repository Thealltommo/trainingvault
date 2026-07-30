"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Database,
  FileJson,
  Gauge,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Watch,
} from "lucide-react";
import CloudDeviceSyncPanel from "@/components/CloudDeviceSyncPanel";
import V3CloudBrain from "@/components/V3CloudBrain";

type IntegrationState = {
  configured: boolean;
  healthy?: boolean;
  version?: string | null;
  canonical?: boolean;
};

type IntegrationStatus = {
  openai: IntegrationState;
  garmin: IntegrationState;
  supabase: IntegrationState;
};

function StatusDot({ state }: { state: IntegrationState }) {
  const tone = !state.configured
    ? "bg-white/25"
    : state.healthy === false
      ? "bg-amber-300"
      : "bg-[var(--accent)]";

  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${tone}`}
      aria-label={integrationLabel(state)}
    />
  );
}

function integrationLabel(state: IntegrationState) {
  if (!state.configured) return "Optional";
  if (state.healthy === false) return "Configured · offline";
  if (state.healthy === true && state.canonical) return "Live · canonical";
  if (state.healthy === true) return "Live";
  return "Configured";
}

export default function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [statusError, setStatusError] = useState("");

  async function loadStatus() {
    setStatusError("");

    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Integration status is unavailable");
      setStatus((await response.json()) as IntegrationStatus);
    } catch {
      setStatusError(
        "Could not read server integration status. Local training data is still available.",
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/status", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Integration status is unavailable");
          return (await response.json()) as IntegrationStatus;
        })
        .then(setStatus)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStatusError(
            "Could not read server integration status. Local training data is still available.",
          );
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const integrationRows = [
    {
      key: "supabase",
      title: "Supabase V3 cloud",
      body:
        status?.supabase.canonical
          ? "Canonical athlete history, rollback snapshots and server-only records."
          : "Durable athlete records and private cross-device state.",
      state: status?.supabase ?? { configured: false },
      icon: Database,
    },
    {
      key: "garmin",
      title: "Garmin bridge",
      body:
        status?.garmin.healthy && status.garmin.version
          ? `Remote workouts, health and activities · bridge ${status.garmin.version}.`
          : "Structured workouts, health data, and completed activities.",
      state: status?.garmin ?? { configured: false },
      icon: Watch,
    },
    {
      key: "openai",
      title: "OpenAI Coach",
      body: "Controlled interpretation, proposed plan changes and V3 decision audit.",
      state: status?.openai ?? { configured: false },
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Settings</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
          Private athlete system
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
          External services enhance TrainVault, but the athlete-facing plan remains available even when an integration has a bad day.
        </p>
      </header>

      <section className="tv-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Integrations</p>
            <h2 className="mt-1 text-2xl font-black uppercase">Connection readiness</h2>
          </div>
          <button type="button" onClick={() => void loadStatus()} className="tv-button-ghost">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {statusError ? (
          <p className="mt-3 border-l-2 border-white/30 pl-3 text-sm font-bold text-[var(--muted)]">
            {statusError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          {integrationRows.map((row) => {
            const Icon = row.icon;
            return (
              <article
                key={row.key}
                className="flex items-center gap-3 border border-[var(--border)] bg-black/50 p-3"
              >
                <span className="grid h-10 w-10 place-items-center rounded-sm border border-[var(--border)] text-[var(--accent)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-black uppercase">{row.title}</h3>
                  <p className="text-xs font-bold text-[var(--muted)]">{row.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
                  <StatusDot state={row.state} />
                  {status ? integrationLabel(row.state) : "Checking"}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <V3CloudBrain compact />
      <CloudDeviceSyncPanel />

      <section className="tv-card overflow-hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
          <div>
            <p className="tv-label text-[var(--accent)]">V3 architecture</p>
            <h2 className="mt-1 text-2xl font-black uppercase">Browser is the cockpit. Cloud is the history.</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              The old auth-linked relational migration is no longer required for this private single-athlete deployment. V3 mirrors validated TrainVault state into a server-only canonical entity bank and keeps append-only rollback snapshots.
            </p>
          </div>
          <Link href="/command" className="tv-button-primary">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            Open command
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/events" className="tv-card tv-card-hover p-4">
          <CalendarDays className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black uppercase">Events and priorities</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Maintain A, B, and C events, targets, terrain, and taper intent.
          </p>
        </Link>
        <Link href="/admin/import" className="tv-card tv-card-hover p-4">
          <FileJson className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black uppercase">Import / export JSON</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Preserve the programme and full-snapshot escape hatch.
          </p>
        </Link>
        <Link href="/program" className="tv-card tv-card-hover p-4">
          <Database className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black uppercase">Programme source view</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Inspect the original imported programme alongside overrides.
          </p>
        </Link>
      </section>

      <form action="/api/logout" method="post">
        <button type="submit" className="tv-button-ghost">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );
}
