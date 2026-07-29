"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteSessionLog, saveSessionLog, useSessionLogs } from "@/lib/storage";
import type { SessionLog } from "@/lib/types";

const DEBUG_LIMITER_LOG_ID = "debug-limiter-grip-log";

function createLimiterDebugLog(): SessionLog {
  return {
    id: DEBUG_LIMITER_LOG_ID,
    workoutId: "debug-limiter-workout",
    workoutTitle: "Limiter Debug Session",
    workoutCategory: "conditioning",
    completedAt: new Date().toISOString(),
    rpe: 7,
    actualDurationMinutes: 1,
    score: "manual limiter check",
    limiter: "grip",
    result: "manual limiter check",
    notes: "Debug-safe limiter persistence check.",
    blockResults: [],
  };
}

export default function LimiterDebugClient() {
  const logs = useSessionLogs();
  const [status, setStatus] = useState("");
  const debugLog = useMemo(() => logs.find((log) => log.id === DEBUG_LIMITER_LOG_ID), [logs]);

  function handleSave() {
    saveSessionLog(createLimiterDebugLog());
    setStatus("Saved grip log");
  }

  function handleDelete() {
    deleteSessionLog(DEBUG_LIMITER_LOG_ID);
    setStatus("Removed grip log");
  }

  return (
    <section className="tv-card p-5">
      <p className="tv-label text-[var(--accent)]">Debug</p>
      <h1 className="mt-2 text-3xl font-black uppercase">Limiter Manual Check</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={handleSave} className="tv-button-primary">
          Save grip log
        </button>
        <button type="button" onClick={handleDelete} className="tv-button-ghost">
          Remove debug log
        </button>
        <Link href="/log" className="tv-button-ghost">
          Open log
        </Link>
        <Link href="/progress" className="tv-button-ghost">
          Open progress
        </Link>
      </div>
      <div className="mt-4 grid gap-2 text-sm font-bold text-[var(--muted)]">
        <p>{status || "No debug action yet."}</p>
        {debugLog ? (
          <p>
            Stored debug limiter: <span className="text-[var(--accent)]">{debugLog.limiter}</span>
          </p>
        ) : (
          <p>No debug limiter log stored.</p>
        )}
      </div>
    </section>
  );
}
