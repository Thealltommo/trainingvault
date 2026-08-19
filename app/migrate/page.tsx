"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CloudDownload, DatabaseBackup, ExternalLink, LoaderCircle } from "lucide-react";
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

function getTargetOrigin() {
  if (typeof window === "undefined") return CURRENT_ORIGIN;
  const target = new URLSearchParams(window.location.search).get("target");
  return target === CURRENT_ORIGIN ? target : null;
}

export default function MigratePage() {
  const [status, setStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const isLegacyHost = useMemo(() => host === new URL(LEGACY_ORIGIN).host, [host]);

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  useEffect(() => {
    if (!isLegacyHost) return;

    const targetOrigin = getTargetOrigin();
    if (!targetOrigin || !window.opener) {
      setStatus("Open this recovery page from The Agoge so the old browser data has somewhere safe to go.");
      return;
    }

    const snapshot = getTrainVaultSnapshot();
    const hasData = Boolean(snapshot.programme || snapshot.logs.length > 0);

    if (!hasData) {
      setStatus("No TrainVault programme or logs were found in this old browser origin.");
      return;
    }

    window.opener.postMessage(
      {
        type: MESSAGE_TYPE,
        snapshot,
      } satisfies TransferMessage,
      targetOrigin,
    );
    setStatus(`Sent ${snapshot.logs.length} session${snapshot.logs.length === 1 ? "" : "s"} back to The Agoge.`);
    setDone(true);

    const timeout = window.setTimeout(() => window.close(), 900);
    return () => window.clearTimeout(timeout);
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
    setStatus("Opening the old TrainVault origin to collect its browser data...");
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
    setStatus("Checking your existing TrainVault cloud backup...");

    try {
      const response = await fetch("/api/sync/pull", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { data?: TrainVaultSnapshot; error?: string };

      if (!response.ok) throw new Error(payload.error ?? "Cloud recovery failed.");
      if (!payload.data) throw new Error("No TrainVault cloud backup was found.");

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
        <section className="tv-card p-5 text-center">
          {done ? <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--green)]" aria-hidden="true" /> : <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[var(--accent)]" aria-hidden="true" />}
          <p className="tv-label mt-4 text-[var(--accent)]">TrainVault handoff</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">{done ? "Data sent." : "Reading the old browser data..."}</h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--muted)]">{status}</p>
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

      <section className="tv-card p-5 sm:p-6">
        <p className="tv-label text-[var(--accent)]">Recover existing data</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Your TrainVault history should not need a JSON ceremony.</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--muted)]">
          The Agoge can pull the private cloud snapshot directly. If the history only lives in the old TrainVault browser storage, one click opens that old origin, hands the data back securely, and closes it again.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => void recoverFromCloud()} disabled={isWorking} className="tv-button-primary min-h-14 disabled:opacity-50">
            <CloudDownload className="h-5 w-5" aria-hidden="true" />
            Recover cloud backup
          </button>
          <button type="button" onClick={recoverFromLegacyOrigin} disabled={isWorking} className="tv-button-ghost min-h-14 disabled:opacity-50">
            <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
            Recover old browser data
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {status ? (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${done ? "border-[color-mix(in_srgb,var(--green)_36%,var(--border))] bg-[var(--green-soft)] text-[var(--green)]" : "border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]"}`}>
            {status}
          </div>
        ) : null}

        {done ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="tv-button-primary">Open dashboard</Link>
            <Link href="/log" className="tv-button-ghost">Check training log</Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
