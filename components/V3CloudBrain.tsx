"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudCog, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";
import {
  captureCloudDeviceSnapshot,
  pushCloudDeviceSnapshot,
} from "@/lib/cloud-device-sync";

type V3Summary = {
  version: number;
  canonical: boolean;
  lastSyncedAt: string | null;
  fingerprint: string | null;
  snapshotCount: number;
  decisionCount?: number;
  entityCount: number;
  counts: Record<string, number>;
  latestRecoveryDate: string | null;
  latestGarminActivityDate: string | null;
  latestSessionDate: string | null;
};

function formatStamp(value: string | null) {
  if (!value) return "Not mirrored yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function entityLabel(key: string) {
  return key.replaceAll("_", " ");
}

export default function V3CloudBrain({ compact = false }: { compact?: boolean }) {
  const [summary, setSummary] = useState<V3Summary | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v3/summary", { cache: "no-store" });
      if (!response.ok) throw new Error("Cloud brain unavailable");
      setSummary((await response.json()) as V3Summary);
    } catch {
      setError("Canonical cloud is not available yet. Your local vault remains untouched.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function syncNow() {
    setSyncing(true);
    setError("");
    try {
      await pushCloudDeviceSnapshot(captureCloudDeviceSnapshot());
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Cloud sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const importantCounts = summary
    ? ["session", "session_log", "garmin_activity", "recovery", "event", "personal_record"]
        .map((key) => [key, summary.counts[key] ?? 0] as const)
        .filter(([, count]) => count > 0)
    : [];

  return (
    <section className="tv-card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[linear-gradient(115deg,rgba(215,255,47,0.12),transparent_48%)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-black">
              <DatabaseZap className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">TrainVault V3 · canonical cloud</p>
              <h2 className="mt-1 text-2xl font-black uppercase sm:text-3xl">One athlete history.</h2>
              {!compact ? (
                <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
                  Every cross-device sync now writes an append-only rollback snapshot and a queryable entity bank. The browser is a client; Supabase is the durable history.
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="tv-button-ghost disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
            {syncing ? "Mirroring…" : "Mirror now"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
        <div className="border border-[var(--border)] bg-black/45 p-3">
          <p className="tv-label">State</p>
          <div className="mt-2 flex items-center gap-2 text-[var(--accent)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-xl font-black uppercase">{summary?.canonical ? "Canonical" : "Checking"}</span>
          </div>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">Server-role only · browser access blocked</p>
        </div>
        <div className="border border-[var(--border)] bg-black/45 p-3">
          <p className="tv-label">Current entities</p>
          <p className="mt-2 text-3xl font-black text-[var(--accent)]">{summary?.entityCount ?? "—"}</p>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">Queryable athlete records</p>
        </div>
        <div className="border border-[var(--border)] bg-black/45 p-3">
          <p className="tv-label">Rollback history</p>
          <p className="mt-2 text-3xl font-black text-[var(--accent)]">{summary?.snapshotCount ?? "—"}</p>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">Unique cloud snapshots</p>
        </div>
        <div className="border border-[var(--border)] bg-black/45 p-3">
          <p className="tv-label">Last mirror</p>
          <p className="mt-2 text-lg font-black uppercase">{formatStamp(summary?.lastSyncedAt ?? null)}</p>
          <p className="text-xs font-bold text-[var(--muted)]">
            {summary?.fingerprint ? `SHA · ${summary.fingerprint.slice(0, 10)}` : "Waiting for first V3 mirror"}
          </p>
        </div>
      </div>

      {!compact ? (
        <div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <CloudCog className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <p className="tv-label">Evidence bank</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {importantCounts.length > 0 ? importantCounts.map(([key, count]) => (
                <span key={key} className="border border-[var(--border)] bg-black/50 px-2.5 py-1.5 text-xs font-black uppercase">
                  {entityLabel(key)} · <span className="text-[var(--accent)]">{count}</span>
                </span>
              )) : (
                <span className="text-sm font-bold text-[var(--muted)]">Mirror this device once to seed the canonical bank.</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border border-[var(--border)] bg-black/45 p-2">
              <p className="tv-label">Recovery</p>
              <p className="mt-1 text-sm font-black">{summary?.latestRecoveryDate ?? "—"}</p>
            </div>
            <div className="border border-[var(--border)] bg-black/45 p-2">
              <p className="tv-label">Garmin</p>
              <p className="mt-1 text-sm font-black">{summary?.latestGarminActivityDate ?? "—"}</p>
            </div>
            <div className="border border-[var(--border)] bg-black/45 p-2">
              <p className="tv-label">Plan</p>
              <p className="mt-1 text-sm font-black">{summary?.latestSessionDate ?? "—"}</p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-[var(--border)] px-4 py-3 text-sm font-bold text-amber-200 sm:px-5">{error}</p>
      ) : null}
    </section>
  );
}
