"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, FileUp, RefreshCw, ShieldCheck, Upload } from "lucide-react";

type FullDeviceSnapshot = {
  version: 1;
  kind: "trainvault-full-device";
  origin: string;
  exportedAt: string;
  entries: Record<string, string>;
};

type StorageDiagnostics = {
  origin: string;
  href: string;
  standalone: boolean;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  indexedDbNames: string[];
  cacheNames: string[];
  sessionLogs: number | null;
  workoutOverrides: number | null;
  garminActivities: number | null;
  hasProgramme: boolean;
};

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCount(raw: string | null, field?: string) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (isObject(parsed)) {
      if (field && Array.isArray(parsed[field])) return parsed[field].length;
      return Object.keys(parsed).length;
    }
  } catch {
    return null;
  }
  return null;
}

function storageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys.sort();
}

function captureFullDeviceSnapshot(): FullDeviceSnapshot {
  const entries: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }

  return {
    version: 1,
    kind: "trainvault-full-device",
    origin: window.location.origin,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

function parseFullDeviceSnapshot(value: unknown): FullDeviceSnapshot | null {
  if (!isObject(value) || value.version !== 1 || value.kind !== "trainvault-full-device") return null;
  if (typeof value.origin !== "string" || typeof value.exportedAt !== "string" || !isObject(value.entries)) return null;

  const entries: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value.entries)) {
    if (typeof raw === "string") entries[key] = raw;
  }

  return {
    version: 1,
    kind: "trainvault-full-device",
    origin: value.origin,
    exportedAt: value.exportedAt,
    entries,
  };
}

function snapshotStats(snapshot: FullDeviceSnapshot) {
  const keys = Object.keys(snapshot.entries);
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  const trainVaultKeys = keys.filter((key) => key.startsWith("trainvault_") || key === "selectedTodayWorkoutId").length;
  return { keys: keys.length, trainVaultKeys, bytes };
}

async function readDiagnostics(): Promise<StorageDiagnostics> {
  const localStorageKeys = storageKeys(window.localStorage);
  const sessionStorageKeys = storageKeys(window.sessionStorage);
  let indexedDbNames: string[] = [];
  let cacheNames: string[] = [];

  try {
    if ("databases" in indexedDB && typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      indexedDbNames = databases.map((database) => database.name).filter((name): name is string => Boolean(name)).sort();
    }
  } catch {
    indexedDbNames = ["unavailable"];
  }

  try {
    if ("caches" in window) cacheNames = (await caches.keys()).sort();
  } catch {
    cacheNames = ["unavailable"];
  }

  return {
    origin: window.location.origin,
    href: window.location.href,
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    localStorageKeys,
    sessionStorageKeys,
    indexedDbNames,
    cacheNames,
    sessionLogs: safeCount(window.localStorage.getItem("trainvault_session_logs")),
    workoutOverrides: safeCount(window.localStorage.getItem("trainvault_workout_overrides")),
    garminActivities: safeCount(window.localStorage.getItem("trainvault_garmin_v1"), "activities"),
    hasProgramme: Boolean(window.localStorage.getItem("trainvault_active_programme")),
  };
}

export default function DeviceBackupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FullDeviceSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);

  async function refreshDiagnostics() {
    setDiagnostics(await readDiagnostics());
  }

  useEffect(() => {
    void refreshDiagnostics();
  }, []);

  function exportDevice() {
    setError("");
    try {
      const snapshot = captureFullDeviceSnapshot();
      const stats = snapshotStats(snapshot);
      if (stats.keys === 0) throw new Error("No localStorage state exists on this exact web origin. Check the origin diagnostic below before doing anything else.");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`trainvault-full-device-${stamp}.json`, snapshot);
      setMessage(
        `Downloaded ${stats.keys} localStorage keys (${stats.trainVaultKeys} TrainVault keys, ${formatBytes(stats.bytes)}). Keep this file safe before any redesign or cloud restore.`,
      );
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Full-device export failed.");
    }
  }

  async function copyDiagnostics() {
    if (!diagnostics) return;
    const summary = JSON.stringify(diagnostics, null, 2);
    try {
      await navigator.clipboard.writeText(summary);
      setMessage("Storage diagnostics copied.");
    } catch {
      setMessage(summary);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    setMessage("");
    setError("");
    try {
      const parsed = parseFullDeviceSnapshot(JSON.parse(await file.text()) as unknown);
      if (!parsed) throw new Error("That file is not a valid TrainVault full-device snapshot.");
      setPreview(parsed);
      const stats = snapshotStats(parsed);
      setMessage(
        `Valid snapshot from ${parsed.origin}: ${stats.keys} localStorage keys (${stats.trainVaultKeys} TrainVault keys, ${formatBytes(stats.bytes)}), exported ${parsed.exportedAt}.`,
      );
    } catch (readError) {
      setPreview(null);
      setError(readError instanceof Error ? readError.message : "Could not read backup file.");
    }
  }

  function restoreDevice() {
    if (!preview) return;
    const confirmed = window.confirm(
      "Replace this origin's localStorage with the selected full-device backup? Export the current device first if you may need to roll back.",
    );
    if (!confirmed) return;

    window.localStorage.clear();
    Object.entries(preview.entries).forEach(([key, value]) => window.localStorage.setItem(key, value));
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
        <p className="tv-label text-[var(--accent)]">Recovery diagnostics</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">Find the real vault first</h1>
        <p className="mt-3 max-w-2xl text-sm font-bold text-[var(--muted)]">
          This page now reports the exact web origin and browser stores it can see. Nothing below clears or replaces data unless you explicitly restore a chosen JSON file.
        </p>
      </header>

      <section className="tv-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black uppercase">What this instance can actually see</h2>
            {diagnostics ? (
              <div className="mt-4 grid gap-2 text-sm font-bold">
                <p className="break-all"><span className="text-[var(--muted)]">Origin:</span> {diagnostics.origin}</p>
                <p><span className="text-[var(--muted)]">Installed/standalone:</span> {diagnostics.standalone ? "yes" : "no"}</p>
                <p><span className="text-[var(--muted)]">localStorage:</span> {diagnostics.localStorageKeys.length} keys</p>
                <p><span className="text-[var(--muted)]">Session logs:</span> {diagnostics.sessionLogs ?? "not found"}</p>
                <p><span className="text-[var(--muted)]">Workout overrides:</span> {diagnostics.workoutOverrides ?? "not found"}</p>
                <p><span className="text-[var(--muted)]">Garmin activities cached:</span> {diagnostics.garminActivities ?? "not found"}</p>
                <p><span className="text-[var(--muted)]">Active programme:</span> {diagnostics.hasProgramme ? "found" : "not found"}</p>
                <p><span className="text-[var(--muted)]">sessionStorage:</span> {diagnostics.sessionStorageKeys.length} keys</p>
                <p><span className="text-[var(--muted)]">IndexedDB:</span> {diagnostics.indexedDbNames.length ? diagnostics.indexedDbNames.join(", ") : "none"}</p>
                <p><span className="text-[var(--muted)]">Cache Storage:</span> {diagnostics.cacheNames.length ? diagnostics.cacheNames.join(", ") : "none"}</p>
                {diagnostics.localStorageKeys.length > 0 ? (
                  <details className="mt-1 rounded-lg border border-[var(--border)] p-3">
                    <summary className="cursor-pointer text-[var(--accent)]">Show localStorage key names</summary>
                    <p className="mt-2 break-words text-xs text-[var(--muted)]">{diagnostics.localStorageKeys.join(" · ")}</p>
                  </details>
                ) : null}
              </div>
            ) : <p className="mt-3 text-sm font-bold text-[var(--muted)]">Reading browser stores…</p>}
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void refreshDiagnostics()} className="tv-button-ghost">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh diagnostics
          </button>
          <button type="button" onClick={() => void copyDiagnostics()} disabled={!diagnostics} className="tv-button-ghost disabled:opacity-45">
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy diagnostics
          </button>
        </div>
      </section>

      <section className="tv-card p-4 sm:p-5">
        <h2 className="text-2xl font-black uppercase">Protect visible local data</h2>
        <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
          Only download once the diagnostic above shows the expected TrainVault keys, logs or Garmin activity cache. If it says zero, this is not the data-bearing browser origin.
        </p>
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
