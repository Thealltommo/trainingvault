"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mountain, Route, TimerReset, Trash2 } from "lucide-react";
import QuickRunLog from "@/components/QuickRunLog";
import { normalizeLimiter } from "@/lib/session-log";
import {
  deleteSessionLog,
  getAllWorkouts,
  getEffectiveProgramme,
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { BlockResult, SessionLog, WorkoutCategory } from "@/lib/types";

type CategoryFilter = "all" | WorkoutCategory | "unknown";
type ResolvedCategory = Exclude<CategoryFilter, "all">;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRpeLabel(rpe: number) {
  if (rpe <= 3) return "easy";
  if (rpe <= 6) return "moderate";
  if (rpe <= 8) return "hard";
  return "maximal";
}

function formatPace(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function getBlockResultSummary(result: BlockResult) {
  const parts = [
    result.result,
    result.calories ? `${result.calories} cals` : null,
    result.load,
    result.reps ? `${result.reps} reps` : null,
    result.time,
    result.distance,
    result.notes,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : result.status === "skipped" ? "skipped" : result.status ?? "todo";
}

export default function LogPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const workoutOverrides = useWorkoutOverrides();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const effectiveProgramme = useMemo(
    () => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null),
    [programme, workoutOverrides],
  );
  const workoutsById = useMemo(
    () => new Map((effectiveProgramme ? getAllWorkouts(effectiveProgramme) : []).map((workout) => [workout.id, workout] as const)),
    [effectiveProgramme],
  );
  const logsWithCategory = useMemo(
    () => logs.map((log) => ({
      ...log,
      resolvedCategory: log.workoutCategory ?? workoutsById.get(log.workoutId)?.category ?? "unknown" as ResolvedCategory,
      resolvedSessionType: log.workoutSessionType ?? workoutsById.get(log.workoutId)?.sessionType,
      resolvedWorkoutDate: log.workoutDate ?? workoutsById.get(log.workoutId)?.date,
    })),
    [logs, workoutsById],
  );
  const categoryFilters = useMemo(() => Array.from(new Set(logsWithCategory.map((log) => log.resolvedCategory))), [logsWithCategory]);
  const sortedLogs = useMemo(
    () => logsWithCategory
      .filter((log) => categoryFilter === "all" || log.resolvedCategory === categoryFilter)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [categoryFilter, logsWithCategory],
  );

  return (
    <div className="agoge-page">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 py-1">
        <div>
          <p className="tv-label text-[var(--accent)]">Training log</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">Work bank</h1>
          <p className="mt-1.5 max-w-2xl text-sm font-semibold text-[var(--muted)]">The evidence behind every coaching adjustment.</p>
        </div>
        <span className="tv-chip border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">{logs.length} sessions logged</span>
      </header>

      <QuickRunLog defaultOpen={!programme || logs.length === 0} />

      {logs.length > 0 ? (
        <nav aria-label="Filter logs by category" className="flex gap-2 overflow-x-auto pb-1">
          {["all" as CategoryFilter, ...categoryFilters].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setCategoryFilter(category)}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-extrabold transition-colors ${
                categoryFilter === category
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {category === "all" ? "All sessions" : category}
            </button>
          ))}
        </nav>
      ) : null}

      {sortedLogs.length === 0 ? (
        <section className="tv-card p-5">
          <p className="tv-label">No history yet</p>
          <h2 className="mt-2 text-xl font-black tracking-tight">Log the run you just did, or recover the old TrainVault history.</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">A training plan is useful, but logging does not depend on having one.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/migrate" className="tv-button-primary">Recover TrainVault data</Link>
            <Link href="/program/build" className="tv-button-ghost">Build a plan</Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-2">
          {sortedLogs.map((log) => {
            const rpeLabel = getRpeLabel(log.rpe);
            const loggedLimiter = normalizeLimiter(log.limiter);
            const hasRunMetrics = Boolean(log.distanceKm || log.averagePaceSecondsPerKm || log.elevationM || log.terrain);

            return (
              <article key={log.id} className="tv-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="tv-label">{formatDate(log.completedAt)}</p>
                    <h2 className="mt-1 break-words text-lg font-black tracking-tight">{log.workoutTitle}</h2>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-[var(--muted)]">
                      <span>{log.resolvedCategory}</span>
                      {log.resolvedSessionType ? <span>· {log.resolvedSessionType}</span> : null}
                      {log.resolvedWorkoutDate ? <span>· plan {log.resolvedWorkoutDate}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteSessionLog(log.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red)]"
                    aria-label={`Delete log for ${log.workoutTitle}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`tv-chip ${log.rpe >= 9 ? "border-[var(--red)] bg-[var(--red-soft)] text-[var(--red)]" : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
                    RPE {log.rpe} · {rpeLabel}
                  </span>
                  {log.actualDurationMinutes ? <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">{log.actualDurationMinutes} min</span> : null}
                  {log.workoutModified ? <span className="tv-chip border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]">Modified</span> : null}
                  {loggedLimiter ? <span className="tv-chip border-[var(--red)] bg-[var(--red-soft)] text-[var(--red)]">Limiter: {loggedLimiter}</span> : null}
                  {log.score ?? log.result ? <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text)]">{log.score ?? log.result}</span> : null}
                </div>

                {hasRunMetrics ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {log.distanceKm ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                        <Route className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                        <span className="text-sm font-black">{log.distanceKm.toFixed(2)} km</span>
                      </div>
                    ) : null}
                    {log.averagePaceSecondsPerKm ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                        <TimerReset className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                        <span className="text-sm font-black">{formatPace(log.averagePaceSecondsPerKm)}</span>
                      </div>
                    ) : null}
                    {log.elevationM ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                        <Mountain className="h-4 w-4 text-[var(--red)]" aria-hidden="true" />
                        <span className="text-sm font-black">{Math.round(log.elevationM)} m+</span>
                      </div>
                    ) : null}
                    {log.terrain ? (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-black capitalize">{log.terrain}</div>
                    ) : null}
                  </div>
                ) : null}

                {log.notes ? <p className="mt-3 break-words text-sm font-semibold leading-relaxed text-[var(--muted)]">{log.notes}</p> : null}

                {log.blockResults && log.blockResults.length > 0 ? (
                  <details className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                    <summary className="cursor-pointer text-xs font-black text-[var(--accent)]">Block results</summary>
                    <div className="mt-3 grid gap-2 text-sm font-semibold">
                      {log.blockResults.map((blockResult) => (
                        <div key={blockResult.blockKey} className="grid gap-1 border-t border-[var(--border)] pt-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                          <span className="break-words font-black text-[var(--text)]">{blockResult.blockName}</span>
                          <span className="break-words text-[var(--muted)]">{getBlockResultSummary(blockResult)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
