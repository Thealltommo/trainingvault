"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  DatabaseBackup,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import AgogeWarriorArt from "@/components/AgogeWarriorArt";
import { getTrainVaultSnapshot, restoreTrainVaultSnapshot } from "@/lib/storage";
import type { TrainVaultSnapshot } from "@/lib/types";

const LEGACY_ORIGINS = [
  "https://project-poo2v.vercel.app",
  "https://trainvault-rays-projects-c6b158d1.vercel.app",
  "https://trainvault-git-main-rays-projects-c6b158d1.vercel.app",
] as const;
const CURRENT_ORIGIN = "https://trainingvault-rays-projects-c6b158d1.vercel.app";

function snapshotHasData(snapshot: TrainVaultSnapshot | null | undefined) {
  return Boolean(snapshot?.programme || (snapshot?.logs?.length ?? 0) > 0);
}

function mergeSnapshots(localSnapshot: TrainVaultSnapshot, cloudSnapshot: TrainVaultSnapshot): TrainVaultSnapshot {
  const logsById = new Map<string, TrainVaultSnapshot["logs"][number]>();
  for (const log of cloudSnapshot.logs ?? []) logsById.set(log.id, log);
  for (const log of localSnapshot.logs ?? []) logsById.set(log.id, log);

  return {
    version: 2,
    programme: localSnapshot.programme ?? cloudSnapshot.programme,
    logs: Array.from(logsById.values()).sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    ),
    selectedTodayWorkoutId: localSnapshot.selectedTodayWorkoutId ?? cloudSnapshot.selectedTodayWorkoutId ?? null,
    programmeAnchor: localSnapshot.programmeAnchor ?? cloudSnapshot.programmeAnchor ?? null,
    programmeStartDate: localSnapshot.programmeStartDate ?? cloudSnapshot.programmeStartDate ?? null,
    blockProgress: { ...(cloudSnapshot.blockProgress ?? {}), ...(localSnapshot.blockProgress ?? {}) },
    blockResults: { ...(cloudSnapshot.blockResults ?? {}), ...(localSnapshot.blockResults ?? {}) },
    workoutOverrides: { ...(cloudSnapshot.workoutOverrides ?? {}), ...(localSnapshot.workoutOverrides ?? {}) },
    exportedAt: new Date().toISOString(),
  };
}

function getLegacyOriginForHost(host: string | null) {
  if (!host) return null;
  return LEGACY_ORIGINS.find((origin) => new URL(origin).host === host) ?? null;
}

function makeTransferToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export default function MigratePage() {
  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [legacyFinished, setLegacyFinished] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const legacyOrigin = useMemo(() => getLegacyOriginForHost(host), [host]);
  const isLegacyHost = Boolean(legacyOrigin);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  useEffect(() => {
    if (!isLegacyHost || !legacyOrigin) return;

    const params = new URLSearchParams(window.location.search);
    const targetOrigin = params.get("target") === CURRENT_ORIGIN ? CURRENT_ORIGIN : null;
    const token = params.get("token") ?? "";

    if (!targetOrigin || token.length < 40) {
      setStatus("This recovery page was opened without a valid Agoge transfer. Go back to The Agoge and press Scan old TrainVault data again.");
      setLegacyFinished(true);
      return;
    }

    let cancelled = false;
    let redirectTimer: number | null = null;

    void (async () => {
      setLegacyFinished(false);
      const localSnapshot = getTrainVaultSnapshot();
      const localHasData = snapshotHasData(localSnapshot);
      let cloudSnapshot: TrainVaultSnapshot | null = null;
      const legacyIndex = LEGACY_ORIGINS.indexOf(legacyOrigin);
      const attemptNumber = legacyIndex + 1;

      setStatus(
        localHasData
          ? `Found browser data on TrainVault address ${attemptNumber}/${LEGACY_ORIGINS.length}. Checking cloud too...`
          : `Checking TrainVault address ${attemptNumber}/${LEGACY_ORIGINS.length} for your phone data...`,
      );

      try {
        const response = await fetch("/api/sync/pull", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot | null };
        if (response.ok && snapshotHasData(payload.data)) cloudSnapshot = payload.data ?? null;
      } catch {
        // Browser-local data is still enough to recover.
      }

      if (cancelled) return;

      const snapshot = localHasData && cloudSnapshot
        ? mergeSnapshots(localSnapshot, cloudSnapshot)
        : localHasData
          ? localSnapshot
          : cloudSnapshot;

      if (!snapshot || !snapshotHasData(snapshot)) {
        const nextOrigin = LEGACY_ORIGINS[legacyIndex + 1];
        if (nextOrigin) {
          setStatus(`Nothing on address ${attemptNumber}/${LEGACY_ORIGINS.length}. Moving to the next historical TrainVault address...`);
          redirectTimer = window.setTimeout(() => {
            window.location.replace(
              `${nextOrigin}/migrate?target=${encodeURIComponent(targetOrigin)}&token=${encodeURIComponent(token)}`,
            );
          }, 500);
          return;
        }

        setStatus("Finished checking every known TrainVault address on this phone. No programme or session history was found in browser storage or cloud.");
        setLegacyFinished(true);
        redirectTimer = window.setTimeout(() => {
          window.location.replace(`${targetOrigin}/migrate?empty=1`);
        }, 1600);
        return;
      }

      const source = localHasData && cloudSnapshot ? "browser + cloud" : localHasData ? "browser storage" : "cloud backup";
      setStatus(`Found ${snapshot.logs.length} session${snapshot.logs.length === 1 ? "" : "s"}. Moving them into The Agoge...`);

      try {
        const response = await fetch(`/api/migrate/receive?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: snapshot }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not stage the recovered data.");

        setDone(true);
        setLegacyFinished(true);
        setStatus(`Recovered ${snapshot.logs.length} session${snapshot.logs.length === 1 ? "" : "s"} from ${source}. Returning to The Agoge...`);
        redirectTimer = window.setTimeout(() => {
          window.location.replace(`${targetOrigin}/migrate?transfer=${encodeURIComponent(token)}`);
        }, 700);
      } catch (error) {
        setLegacyFinished(true);
        setStatus(error instanceof Error ? `Data was found, but transfer failed: ${error.message}` : "Data was found, but transfer failed.");
      }
    })();

    return () => {
      cancelled = true;
      if (redirectTimer !== null) window.clearTimeout(redirectTimer);
    };
  }, [isLegacyHost, legacyOrigin]);

  useEffect(() => {
    if (isLegacyHost || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("transfer");
    const empty = params.get("empty") === "1";

    if (empty) {
      setDone(false);
      setIsWorking(false);
      setStatus("The scan completed on this phone, but none of the known TrainVault web addresses contained the old local history. Nothing has been imported.");
      window.history.replaceState({}, "", "/migrate");
      return;
    }

    if (!token || token.length < 40) return;

    setIsWorking(true);
    setStatus("Recovered data found. Restoring it into The Agoge and saving a fresh cloud copy...");

    void (async () => {
      try {
        const response = await fetch(`/api/migrate/take?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Recovered snapshot could not be loaded.");

        restoreTrainVaultSnapshot(payload.data);
        setDone(true);
        setStatus(
          `Recovered ${payload.data.logs.length} TrainVault session${payload.data.logs.length === 1 ? "" : "s"}${payload.data.programme ? " and the saved programme" : ""}. A fresh Agoge cloud copy has also been created.`,
        );
        window.history.replaceState({}, "", "/migrate");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Recovered data could not be restored.");
      } finally {
        setIsWorking(false);
      }
    })();
  }, [isLegacyHost]);

  function recoverFromLegacyOrigin() {
    const token = makeTransferToken();
    setIsWorking(true);
    setDone(false);
    setStatus("Leaving The Agoge briefly to scan the historical TrainVault addresses on this phone...");
    window.location.assign(
      `${LEGACY_ORIGINS[0]}/migrate?target=${encodeURIComponent(CURRENT_ORIGIN)}&token=${encodeURIComponent(token)}`,
    );
  }

  async function recoverFromCloud() {
    setIsWorking(true);
    setDone(false);
    setStatus("Checking The Agoge cloud store for your TrainVault backup...");

    try {
      const response = await fetch("/api/sync/pull", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Cloud recovery failed.");
      if (!payload.data) throw new Error("The cloud store is healthy but currently empty. Scan the old TrainVault addresses on this phone instead.");

      restoreTrainVaultSnapshot(payload.data);
      setDone(true);
      setStatus(`Recovered ${payload.data.logs?.length ?? 0} session${payload.data.logs?.length === 1 ? "" : "s"} from cloud.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cloud recovery failed.");
    } finally {
      setIsWorking(false);
    }
  }

  if (isLegacyHost) {
    return (
      <div className="mx-auto grid max-w-xl gap-4 py-6">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--sidebar)] p-5 text-center text-white shadow-[var(--shadow-strong)]">
          <AgogeWarriorArt className="pointer-events-none absolute -right-28 -top-24 h-[30rem] w-[30rem] opacity-[0.32]" variant="combined" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,18,38,0.48),rgba(4,18,38,0.96))]" />
          <div className="relative z-10">
            {done ? (
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#5ee493]" aria-hidden="true" />
            ) : legacyFinished ? (
              <DatabaseBackup className="mx-auto h-10 w-10 text-[#ffb454]" aria-hidden="true" />
            ) : (
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#7fb0ff]" aria-hidden="true" />
            )}
            <p className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#7fb0ff]">TrainVault handoff</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">
              {done ? "Data found." : legacyFinished ? "Recovery finished." : "Scanning this phone..."}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#b7c7d9]">{status}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--muted)] hover:text-[var(--accent)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Dashboard
      </Link>

      <section className="tv-card overflow-hidden">
        <div className="relative min-h-[300px] overflow-hidden bg-[var(--sidebar)] p-5 text-white sm:p-6">
          <AgogeWarriorArt className="pointer-events-none absolute -right-28 -top-28 h-[35rem] w-[35rem] opacity-[0.5] sm:-right-20 sm:-top-24" variant="combined" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,15,32,0.99)_0%,rgba(3,20,42,0.88)_54%,rgba(3,20,42,0.28)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--red),transparent)]" />
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2 text-[#7fb0ff]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em]">Recover existing data</p>
            </div>
            <h1 className="mt-3 max-w-lg text-3xl font-black tracking-[-0.045em] sm:text-4xl">Bring the old vault into The Agoge.</h1>
            <p className="mt-3 max-w-lg text-sm font-semibold leading-relaxed text-[#bccbdd] sm:text-base">
              Because your TrainVault history was created on this phone, recovery now uses a same-tab handoff. It checks every historical TrainVault address, relays the snapshot through the private store, then returns here automatically.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={recoverFromLegacyOrigin} disabled={isWorking} className="tv-button-primary min-h-14 disabled:opacity-50">
              <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
              Scan this phone for TrainVault
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void recoverFromCloud()} disabled={isWorking} className="tv-button-ghost min-h-14 disabled:opacity-50">
              <CloudDownload className="h-5 w-5" aria-hidden="true" />
              Check cloud backup
            </button>
          </div>

          {status ? (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold leading-relaxed ${done ? "border-[color-mix(in_srgb,var(--green)_36%,var(--border))] bg-[var(--green-soft)] text-[var(--green)]" : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]"}`}>
              {status}
            </div>
          ) : null}

          {done ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/" className="tv-button-primary">Open populated dashboard</Link>
              <Link href="/log" className="tv-button-ghost">Check recovered history</Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
