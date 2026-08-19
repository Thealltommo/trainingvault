"use client";

import { useEffect, useRef, useState } from "react";
import { CloudDownload, X } from "lucide-react";
import {
  restoreTrainVaultSnapshot,
  useActiveProgrammeOptional,
  useSessionLogs,
} from "@/lib/storage";
import type { TrainVaultSnapshot } from "@/lib/types";

const BOOTSTRAP_KEY = "agoge-cloud-bootstrap-v1";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function coerceSnapshot(value: unknown): TrainVaultSnapshot | null {
  if (!isPlainObject(value)) return null;

  const programme = isPlainObject(value.programme) ? value.programme : null;
  const logs = Array.isArray(value.logs) ? value.logs : [];

  if (!programme && logs.length === 0) return null;

  return {
    version: value.version === 1 ? 1 : 2,
    programme: programme as TrainVaultSnapshot["programme"],
    logs: logs as TrainVaultSnapshot["logs"],
    selectedTodayWorkoutId:
      typeof value.selectedTodayWorkoutId === "string" ? value.selectedTodayWorkoutId : null,
    programmeAnchor:
      typeof value.programmeAnchor === "string" ? value.programmeAnchor : null,
    programmeStartDate:
      typeof value.programmeStartDate === "string" ? value.programmeStartDate : null,
    blockProgress: isPlainObject(value.blockProgress)
      ? (value.blockProgress as TrainVaultSnapshot["blockProgress"])
      : {},
    blockResults: isPlainObject(value.blockResults)
      ? (value.blockResults as TrainVaultSnapshot["blockResults"])
      : {},
    workoutOverrides: isPlainObject(value.workoutOverrides)
      ? (value.workoutOverrides as TrainVaultSnapshot["workoutOverrides"])
      : {},
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
  };
}

export default function CloudBootstrap() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const attempted = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (attempted.current || programme || logs.length > 0) return;
    attempted.current = true;

    if (window.sessionStorage.getItem(BOOTSTRAP_KEY) === "done") return;
    window.sessionStorage.setItem(BOOTSTRAP_KEY, "done");

    void (async () => {
      try {
        const response = await fetch("/api/sync/pull", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as
          | { data?: unknown; updated_at?: string }
          | null;
        const snapshot = coerceSnapshot(payload?.data);

        if (!snapshot) return;

        restoreTrainVaultSnapshot(snapshot);
        const recoveredLogs = snapshot.logs.length;
        setMessage(
          `Recovered your TrainVault data${recoveredLogs > 0 ? ` · ${recoveredLogs} session${recoveredLogs === 1 ? "" : "s"}` : ""}.`,
        );
      } catch {
        // Recovery is best-effort. The explicit migration/recovery screen remains available.
      }
    })();
  }, [logs.length, programme]);

  if (!message) return null;

  return (
    <div className="fixed inset-x-3 top-16 z-[70] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--green)_42%,var(--border))] bg-[var(--surface)] px-3 py-2.5 text-sm shadow-[var(--shadow-strong)] md:left-auto md:right-5 md:mx-0 md:w-[26rem]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]">
        <CloudDownload className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 font-bold text-[var(--text)]">{message}</p>
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
