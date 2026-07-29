"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CloudUpload,
  Database,
  FileJson,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Watch,
} from "lucide-react";
import {
  getManualSessions,
  getSessionLifecycleOverrides,
} from "@/lib/planning-storage";
import { getTrainVaultSnapshot } from "@/lib/storage";

type IntegrationStatus = {
  openai: { configured: boolean };
  garmin: { configured: boolean };
  supabase: { configured: boolean };
};

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${
        configured ? "bg-[var(--accent)]" : "bg-white/25"
      }`}
      aria-label={configured ? "Configured" : "Not configured"}
    />
  );
}

export default function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [migrationState, setMigrationState] = useState<
    "idle" | "running" | "complete" | "error"
  >("idle");
  const [migrationMessage, setMigrationMessage] = useState("");

  async function loadStatus() {
    setStatusError("");

    try {
      const response = await fetch("/api/status", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Integration status is unavailable");
      }

      setStatus((await response.json()) as IntegrationStatus);
    } catch {
      setStatusError(
        "Could not read server integration status. Local training data is still available.",
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Integration status is unavailable");
        }

        return (await response.json()) as IntegrationStatus;
      })
      .then(setStatus)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setStatusError(
          "Could not read server integration status. Local training data is still available.",
        );
      });

    return () => controller.abort();
  }, []);

  async function migrateLocalData() {
    const confirmed = window.confirm(
      "Copy the current local TrainVault snapshot to the normalized cloud store? Local data will not be deleted.",
    );

    if (!confirmed) {
      return;
    }

    setMigrationState("running");
    setMigrationMessage("");

    try {
      const response = await fetch("/api/cloud/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: getTrainVaultSnapshot(),
          manualSessions: getManualSessions(),
          lifecycle: getSessionLifecycleOverrides(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        alreadyMigrated?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Cloud migration failed");
      }

      setMigrationState("complete");
      setMigrationMessage(
        payload.alreadyMigrated
          ? "This exact local snapshot was already migrated. No duplicates were created."
          : payload.message || "Local data copied to cloud. The browser copy remains untouched.",
      );
    } catch (error) {
      setMigrationState("error");
      setMigrationMessage(
        error instanceof Error
          ? error.message
          : "Cloud migration failed. Local data remains untouched.",
      );
    }
  }

  const integrationRows = [
    {
      key: "supabase",
      title: "Supabase",
      body: "Durable athlete records and cloud migration.",
      configured: status?.supabase.configured ?? false,
      icon: Database,
    },
    {
      key: "garmin",
      title: "Garmin bridge",
      body: "Structured workouts, health data, and completed activities.",
      configured: status?.garmin.configured ?? false,
      icon: Watch,
    },
    {
      key: "openai",
      title: "OpenAI Coach",
      body: "Controlled interpretation and proposed plan changes.",
      configured: status?.openai.configured ?? false,
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
          External services enhance TrainVault, but none of them can make today&apos;s session inaccessible.
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
                  <StatusDot configured={row.configured} />
                  {status ? (row.configured ? "Ready" : "Optional") : "Checking"}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tv-card border-[rgba(215,255,47,0.3)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-[var(--accent)] text-black">
            <CloudUpload className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="tv-label text-[var(--accent)]">One-time migration</p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              Migrate local TrainVault data to cloud
            </h2>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              Copies programmes, sessions, logs, block results, overrides, and manual sessions into durable records. It is idempotent and never removes browser data.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void migrateLocalData()}
          disabled={migrationState === "running"}
          className="tv-button-primary mt-4 disabled:cursor-wait disabled:opacity-60"
        >
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          {migrationState === "running" ? "Migrating…" : "Migrate local data"}
        </button>
        {migrationMessage ? (
          <p
            className={`mt-3 border-l-2 pl-3 text-sm font-bold ${
              migrationState === "complete"
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-white/30 text-[var(--muted)]"
            }`}
          >
            {migrationMessage}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/import" className="tv-card tv-card-hover p-4">
          <FileJson className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black uppercase">Import / export JSON</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Preserve the existing programme and full-snapshot workflows.
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
