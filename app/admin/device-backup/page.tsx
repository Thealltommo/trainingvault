"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileUp, ShieldCheck, Upload } from "lucide-react";
import {
  applyCloudDeviceSnapshot,
  captureCloudDeviceSnapshot,
  parseCloudDeviceSnapshot,
  type CloudDeviceSnapshot,
} from "@/lib/cloud-device-sync";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function snapshotStats(snapshot: CloudDeviceSnapshot) {
  const keys = Object.keys(snapshot.entries);
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  return { keys: keys.length, bytes };
}

export default function DeviceBackupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<CloudDeviceSnapshot | null>(null);

  function exportDevice() {
    setError("");
    try {
      const snapshot = captureCloudDeviceSnapshot();
      const stats = snapshotStats(snapshot);
      if (stats.keys === 0) {
        throw new Error("No TrainVault browser-state keys were found on this device.");
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`trainvault-full-device-${stamp}.json`, snapshot);
      setMessage(`Downloaded ${stats.keys} local TrainVault keys (${formatBytes(stats.bytes)}). Keep this file safe before any redesign or cloud restore.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Full-device export failed.");
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    setMessage("");
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const snapshot = parseCloudDeviceSnapshot(parsed);
      if (!snapshot) throw new Error("That file is not a valid TrainVault full-device snapshot.");
      setPreview(snapshot);
      const stats = snapshotStats(snapshot);
      setMessage(`Valid full-device snapshot: ${stats.keys} TrainVault keys (${formatBytes(stats.bytes)}), exported ${snapshot.exportedAt}.`);
    } catch (readError) {
      setPreview(null);
      setError(readError instanceof Error ? readError.message : "Could not read backup file.");
    }
  }

  function restoreDevice() {
    if (!preview) return;
    const confirmed = window.confirm(
      "Replace this browser's TrainVault state with the selected full-device backup? Export the current device first if you may need to roll back.",
    );
    if (!confirmed) return;
    applyCloudDeviceSnapshot(preview);
    setMessage("Full-device backup restored. Reloading TrainVault now.");
    window.setTimeout(() => window.location.assign("/"), 500);
  }

  return (
    <div className="grid gap-5">
      <Link href="/settings" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--muted)] hover:text-[var(--accent)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Settings
      </Link>

      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Local safety copy</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">Full device backup</h1>
        <p className="mt-3 max-w-2xl text-sm font-bold text-[var(--muted)]">
          This exports every TrainVault browser-state key on this phone, even when there is no active programme. It is independent of Supabase and Garmin availability.
        </p>
      </header>

      <section className="tv-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-black uppercase">Protect this phone first</h2>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
              Use this before changing deployments, restoring cloud state, clearing site data, or replacing the app. The export includes local TrainVault records, activity/recovery caches, session logs, workout edits and other TrainVault-prefixed state that exists in this browser.
            </p>
          </div>
        </div>
        <button type="button" onClick={exportDevice} className="tv-button-primary mt-5 w-full sm:w-auto">
          <Download className="h-4 w-4" aria-hidden="true" />
          Download full device backup
        </button>
      </section>

      <section className="tv-card p-4 sm:p-5">
        <p className="tv-label">Restore / verify</p>
        <h2 className="mt-1 text-2xl font-black uppercase">Check a backup file</h2>
        <p className="mt-2 text-sm font-bold text-[var(--muted)]">
          Selecting a file only validates and previews it. Nothing is replaced until you press Restore full device backup and confirm.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="tv-button-ghost">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Choose full-device JSON
          </button>
          <button type="button" onClick={restoreDevice} disabled={!preview} className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-45">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Restore full device backup
          </button>
        </div>
      </section>

      {message ? <p className="rounded-md border border-[var(--accent)] bg-[rgba(215,255,47,0.08)] px-4 py-3 text-sm font-bold text-[var(--text)]">{message}</p> : null}
      {error ? <p className="rounded-md border border-amber-300/50 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{error}</p> : null}
    </div>
  );
}
