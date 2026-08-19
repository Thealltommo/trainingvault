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
import {
  getTrainVaultSnapshot,
  restoreTrainVaultSnapshot,
} from "@/lib/storage";
import type { TrainVaultSnapshot } from "@/lib/types";

const LEGACY_ORIGIN = "https://trainvault-rays-projects-c6b158d1.vercel.app";
const CURRENT_ORIGIN = "https://trainingvault-rays-projects-c6b158d1.vercel.app";
const MESSAGE_TYPE = "agoge-trainvault-transfer-v1";

type TransferMessage = {
  type: typeof MESSAGE_TYPE;
  snapshot: TrainVaultSnapshot;
};

function isTransferMessage(value: unknown): value is TransferMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<TransferMessage>;
  return candidate.type === MESSAGE_TYPE && Boolean(candidate.snapshot && typeof candidate.snapshot === "object");
}

function snapshotHasData(snapshot: TrainVaultSnapshot | null | undefined) {
  return Boolean(snapshot?.programme || (snapshot?.logs?.length ?? 0) > 0);
}

function mergeSnapshots(localSnapshot: TrainVaultSnapshot, cloudSnapshot: TrainVaultSnapshot): TrainVaultSnapshot {
  const logsById = new Map<string, TrainVaultSnapshot["logs"][number]>();

  for (const log of cloudSnapshot.logs ?? []) {
    logsById.set(log.id, log);
  }
  for (const log of localSnapshot.logs ?? []) {
    logsById.set(log.id, log);
  }

  return {
    version: 2,
    programme: localSnapshot.programme ?? cloudSnapshot.programme,
    logs: Array.from(logsById.values()).sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    ),
    selectedTodayWorkoutId: localSnapshot.selectedTodayWorkoutId ?? cloudSnapshot.selectedTodayWorkoutId ?? null,
    programmeAnchor: localSnapshot.programmeAnchor ?? cloudSnapshot.programmeAnchor ?? null,
    programmeStartDate: localSnapshot.programmeStartDate ?? cloudSnapshot.programmeStartDate ?? null,
    blockProgress: {
      ...(cloudSnapshot.blockProgress ?? {}),
      ...(localSnapshot.blockProgress ?? {}),
    },
    blockResults: {
      ...(cloudSnapshot.blockResults ?? {}),
      ...(localSnapshot.blockResults ?? {}),
    },
    workoutOverrides: {
      ...(cloudSnapshot.workoutOverrides ?? {}),
      ...(localSnapshot.workoutOverrides ?? {}),
    },
    exportedAt: new Date().toISOString(),
  };
}

function getTargetOrigin() {
  if (typeof window === "undefined") return CURRENT_ORIGIN;
  const target = new URLSearchParams(window.location.search).get("target");
  return target === CURRENT_ORIGIN ? target : null;
}

export default function MigratePage() {
  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [legacyFinished, setLegacyFinished] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const isLegacyHost = useMemo(() => host === new URL(LEGACY_ORIGIN).host, [host]);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  useEffect(() => {
    if (!isLegacyHost) return;

    const targetOrigin = getTargetOrigin();
    if (!targetOrigin || !window.opener) {
      setStatus("Open this recovery page from The Agoge so the old data has somewhere safe to go.");
      setLegacyFinished(true);
      return;
    }

    let cancelled = false;
    let closeTimer: number | null = null;

    void (async () => {
      setLegacyFinished(false);
      const localSnapshot = getTrainVaultSnapshot();
      const localHasData = snapshotHasData(localSnapshot);
      let cloudSnapshot: TrainVaultSnapshot | null = null;

      setStatus(localHasData ? "Found old browser data. Checking the original TrainVault cloud backup too..." : "No browser snapshot found yet. Checking the original TrainVault cloud backup...");

      try {
        const response = await fetch("/api/sync/pull", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot | null };
        if (response.ok && snapshotHasData(payload.data)) {
          cloudSnapshot = payload.data ?? null;
        }
      } catch {
        // Browser-local recovery can still succeed even if the old cloud endpoint is unavailable.
      }

      if (cancelled) return;

      const snapshot = localHasData && cloudSnapshot
        ? mergeSnapshots(localSnapshot, cloudSnapshot)
        : localHasData
          ? localSnapshot
          : cloudSnapshot;

      if (!snapshot || !snapshotHasData(snapshot)) {
        setStatus("No TrainVault programme or session history was found in the old browser or the original cloud backup.");
        setLegacyFinished(true);
        return;
      }

      const source = localHasData && cloudSnapshot
        ? "browser + cloud"
        : localHasData
          ? "browser storage"
          : "cloud backup";

      window.opener.postMessage(
        {
          type: MESSAGE_TYPE,
          snapshot,
        } satisfies TransferMessage,
        targetOrigin,
      );
      setStatus(`Recovered ${snapshot.logs.length} session${snapshot.logs.length === 1 ? "" : "s"} from old TrainVault ${source}.`);
      setDone(true);
      setLegacyFinished(true);

      closeTimer = window.setTimeout(() => window.close(), 1100);
    })();

    return () => {
      cancelled = true;
      if (closeTimer !== null) window.clearTimeout(closeTimer);
    };
  }, [isLegacyHost]);

  useEffect(() => {
    if (isLegacyHost) return;

    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== LEGACY_ORIGIN || !isTransferMessage(event.data)) return;

      restoreTrainVaultSnapshot(event.data.snapshot);
      setDone(true);
      setIsWorking(false);
      setStatus(
        `Recovered ${event.data.snapshot.logs.length} TrainVault session${event.data.snapshot.logs.length === 1 ? "" : "s"} and the saved programme.`,
      );
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isLegacyHost]);

  function recoverFromLegacyOrigin() {
    setIsWorking(true);
    setDone(false);
    setStatus("Opening the original TrainVault to collect browser data and its cloud snapshot...");
    const targetOrigin = window.location.origin === CURRENT_ORIGIN ? CURRENT_ORIGIN : window.location.origin;
    const popup = window.open(
      `${LEGACY_ORIGIN}/migrate?target=${encodeURIComponent(targetOrigin)}`,
      "trainvault-recovery",
      "popup,width=520,height=720",
    );

    if (!popup) {
      setIsWorking(false);
      setStatus("Your browser blocked the recovery window. Allow pop-ups for this site and try again.");
    }
  }

  async function recoverFromCloud() {
    setIsWorking(true);
    setDone(false);
    setStatus("Checking the Agoge cloud bridge for your existing TrainVault backup...");

    try {
      const response = await fetch("/api/sync/pull", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot; error?: string };

      if (!response.ok) throw new Error(payload.error ?? "Cloud recovery failed.");
      if (!payload.data) throw new Error("No TrainVault cloud backup was found.");

      restoreTrainVaultSnapshot(payload.data);
      setDone(true);
      setStatus(`Recovered ${payload.data.logs?.length ?? 0} session${payload.data.logs?.length === 1 ? "" : "s"} from cloud.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud recovery failed.";
      const upstreamFailure = /fetch failed|cloud bridge|supabase|upstream/i.test(message);
      setStatus(
        upstreamFailure
          ? "The new Agoge deployment cannot currently reach the old TrainVault cloud store directly. Use “Recover from old TrainVault” below — that route checks both the original browser storage and the original cloud source."
          : message,
      );
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
              {done ? "Data sent." : legacyFinished ? "Recovery finished." : "Recovering the old vault..."}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#b7c7d9]">{status}</p>
            {legacyFinished && !done ? (
              <p className="mt-3 text-xs font-bold text-[#ffcf8a]">This is a finished state — it is not still searching.</p>
            ) : null}
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
              We check the existing TrainVault cloud first. If that bridge is unavailable, the original TrainVault route can recover browser storage and the old cloud source directly.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void recoverFromCloud()} disabled={isWorking} className="tv-button-primary min-h-14 disabled:opacity-50">
              <CloudDownload className="h-5 w-5" aria-hidden="true" />
              Recover cloud backup
            </button>
            <button type="button" onClick={recoverFromLegacyOrigin} disabled={isWorking} className="tv-button-ghost min-h-14 disabled:opacity-50">
              <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
              Recover from old TrainVault
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {status ? (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold leading-relaxed ${done ? "border-[color-mix(in_srgb,var(--green)_36%,var(--border))] bg-[var(--green-soft)] text-[var(--green)]" : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]"}`}>
              {status}
            </div>
          ) : null}

          {done ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/" className="tv-button-primary">Open dashboard</Link>
              <Link href="/log" className="tv-button-ghost">Check training log</Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
