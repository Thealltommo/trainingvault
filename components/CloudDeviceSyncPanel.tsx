"use client";

import { useState } from "react";
import { CloudDownload, CloudUpload, RefreshCw } from "lucide-react";
import {
  applyCloudDeviceSnapshot,
  captureCloudDeviceSnapshot,
  pullCloudDeviceSnapshot,
  pushCloudDeviceSnapshot,
  readCloudSyncMeta,
  snapshotFingerprint,
  writeCloudSyncMeta,
} from "@/lib/cloud-device-sync";

function formatDate(value: string | null) {
  if (!value) return "Not established";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previously synced";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function CloudDeviceSyncPanel() {
  const [busy, setBusy] = useState<"pull" | "push" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastCloud, setLastCloud] = useState<string | null>(
    () => readCloudSyncMeta().lastCloudUpdatedAt,
  );

  async function pushCurrentDevice() {
    const confirmed = window.confirm(
      "Use this device as the current TrainVault cloud source? This replaces the previous compatibility snapshot but does not delete local data.",
    );
    if (!confirmed) return;

    setBusy("push");
    setMessage("");
    setError("");
    try {
      const updatedAt = await pushCloudDeviceSnapshot(captureCloudDeviceSnapshot());
      setLastCloud(updatedAt);
      setMessage("This device is now the cloud source. A new empty phone/browser can hydrate automatically after sign-in.");
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Cloud push failed.");
    } finally {
      setBusy(null);
    }
  }

  async function restoreCloud() {
    setBusy("pull");
    setMessage("");
    setError("");
    try {
      const cloud = await pullCloudDeviceSnapshot();
      if (!cloud.snapshot) {
        throw new Error("No compatible TrainVault device snapshot exists in cloud yet.");
      }
      const confirmed = window.confirm(
        "Replace this browser's TrainVault training state with the cloud copy? This does not affect Garmin credentials, which remain server-side.",
      );
      if (!confirmed) return;

      applyCloudDeviceSnapshot(cloud.snapshot);
      writeCloudSyncMeta({
        version: 1,
        lastCloudUpdatedAt: cloud.updatedAt,
        lastFingerprint: snapshotFingerprint(cloud.snapshot),
      });
      window.location.reload();
    } catch (pullError) {
      setError(pullError instanceof Error ? pullError.message : "Cloud restore failed.");
    } finally {
      setBusy(null);
    }
  }

  async function checkCloud() {
    setBusy("pull");
    setMessage("");
    setError("");
    try {
      const cloud = await pullCloudDeviceSnapshot();
      setLastCloud(cloud.updatedAt);
      setMessage(
        cloud.snapshot
          ? "Compatible cloud device snapshot found."
          : "Cloud is reachable, but the stored row is not yet a current device snapshot.",
      );
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Cloud check failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tv-card border-[rgba(215,255,47,0.3)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Cross-device handoff</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Laptop and phone, one vault</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
            Mirrors TrainVault browser state through the private server-side Supabase snapshot. Established devices sync safely in the background; conflicting edits are never auto-overwritten.
          </p>
        </div>
        <div className="border border-[var(--border)] bg-black/50 px-3 py-2 text-right">
          <p className="tv-label">Last cloud state</p>
          <p className="mt-1 text-xs font-black uppercase text-[var(--accent)]">{formatDate(lastCloud)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" className="tv-button-primary" disabled={busy !== null} onClick={() => void pushCurrentDevice()}>
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
          {busy === "push" ? "Uploading…" : "Use this device as source"}
        </button>
        <button type="button" className="tv-button-ghost" disabled={busy !== null} onClick={() => void restoreCloud()}>
          <CloudDownload className="h-4 w-4" aria-hidden="true" />
          Restore cloud copy
        </button>
        <button type="button" className="tv-button-ghost" disabled={busy !== null} onClick={() => void checkCloud()}>
          <RefreshCw className={`h-4 w-4 ${busy === "pull" ? "animate-spin" : ""}`} aria-hidden="true" />
          Check cloud
        </button>
      </div>

      {message ? <p className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-sm font-bold text-[var(--muted)]">{message}</p> : null}
      {error ? <p className="mt-3 border-l-2 border-amber-300 pl-3 text-sm font-bold text-amber-100">{error}</p> : null}
    </section>
  );
}
