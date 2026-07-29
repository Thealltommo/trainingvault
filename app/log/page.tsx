"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
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
  if (rpe <= 3) {
    return "easy";
  }

  if (rpe <= 6) {
    return "moderate";
  }

  if (rpe <= 8) {
    return "hard";
  }

  return "brutal";
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

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return result.status === "skipped" ? "skipped" : result.status ?? "todo";
}

export default function LogPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const workoutOverrides = useWorkoutOverrides();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const effectiveProgramme = useMemo(() => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null), [programme, workoutOverrides]);

  const workoutsById = useMemo(() => {
    return new Map((effectiveProgramme ? getAllWorkouts(effectiveProgramme) : []).map((workout) => [workout.id, workout] as const));
  }, [effectiveProgramme]);

  const logsWithCategory = useMemo(
    () =>
      logs.map((log) => {
        const resolvedCategory: ResolvedCategory =
          log.workoutCategory ?? workoutsById.get(log.workoutId)?.category ?? "unknown";

        return {
          ...log,
          resolvedCategory,
          resolvedSessionType: log.workoutSessionType ?? workoutsById.get(log.workoutId)?.sessionType,
          resolvedWorkoutDate: log.workoutDate ?? workoutsById.get(log.workoutId)?.date,
        };
      }),
    [logs, workoutsById],
  );

  const categoryFilters = useMemo(() => {
    return Array.from(new Set(logsWithCategory.map((log) => log.resolvedCategory)));
  }, [logsWithCategory]);

  const sortedLogs = useMemo(
    () =>
      logsWithCategory
        .filter((log) => categoryFilter === "all" || log.resolvedCategory === categoryFilter)
        .sort((first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime()),
    [categoryFilter, logsWithCategory],
  );

  function handleDelete(id: string) {
    deleteSessionLog(id);
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Training Log</p>
        <h1 className="mt-2 text-5xl font-black uppercase leading-none sm:text-6xl">Work Bank</h1>
        <p className="mt-3 max-w-2xl text-base font-bold text-[var(--muted)]">
          Completed sessions, effort, results, and field notes.
        </p>
      </header>

      {logs.length > 0 ? (
        <nav aria-label="Filter logs by category" className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`min-h-11 shrink-0 rounded-md border px-4 text-sm font-black uppercase ${
              categoryFilter === "all"
                ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                : "border-[var(--border)] bg-black text-[var(--muted)]"
            }`}
          >
            All
          </button>
          {categoryFilters.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setCategoryFilter(category)}
              className={`min-h-11 shrink-0 rounded-md border px-4 text-sm font-black uppercase ${
                categoryFilter === category
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : "border-[var(--border)] bg-black text-[var(--muted)]"
              }`}
            >
              {category}
            </button>
          ))}
        </nav>
      ) : null}

      {sortedLogs.length === 0 ? (
        <section className="tv-card p-5">
          <p className="tv-label">No logs</p>
          <h2 className="mt-2 text-2xl font-black uppercase">Nothing banked yet</h2>
          <p className="mt-2 text-sm font-bold text-[var(--muted)]">Complete a session to start building history.</p>
          <Link href="/program" className="tv-button-primary mt-5">
            Open program
          </Link>
        </section>
      ) : (
        <section className="grid gap-3">
          {sortedLogs.map((log: SessionLog & { resolvedCategory: ResolvedCategory; resolvedSessionType?: string; resolvedWorkoutDate?: string }) => {
            const rpeLabel = getRpeLabel(log.rpe);
            const loggedLimiter = normalizeLimiter(log.limiter);

            return (
              <article key={log.id} className="tv-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="tv-label">{formatDate(log.completedAt)}</p>
                    <h2 className="mt-1 break-words text-xl font-black uppercase">{log.workoutTitle}</h2>
                    <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{log.resolvedCategory}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(log.id)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border)] bg-black text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    aria-label={`Delete log for ${log.workoutTitle}`}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-sm font-black uppercase">
                  <span className="rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-[var(--accent)]">
                    RPE {log.rpe} / {rpeLabel}
                  </span>
                  {log.actualDurationMinutes ? (
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-[var(--muted)]">
                      {log.actualDurationMinutes} min
                    </span>
                  ) : null}
                  {log.resolvedSessionType ? (
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-[var(--muted)]">
                      {log.resolvedSessionType}
                    </span>
                  ) : null}
                  {log.resolvedWorkoutDate ? (
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-[var(--muted)]">
                      Plan date {log.resolvedWorkoutDate}
                    </span>
                  ) : null}
                  {log.workoutModified ? (
                    <span className="rounded-sm border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-[var(--accent)]">
                      Modified
                    </span>
                  ) : null}
                  {loggedLimiter ? (
                    <span className="rounded-sm border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-[var(--accent)]">
                      Limiter: {loggedLimiter}
                    </span>
                  ) : null}
                  {log.score ?? log.result ? (
                    <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-[var(--text)]">
                      {log.score ?? log.result}
                    </span>
                  ) : null}
                </div>

                {log.notes ? <p className="mt-4 break-words text-sm font-bold text-[var(--muted)]">{log.notes}</p> : null}
                {log.blockResults && log.blockResults.length > 0 ? (
                  <details className="mt-4 rounded-md border border-[var(--border)] bg-black/60 p-3">
                    <summary className="cursor-pointer text-xs font-black uppercase text-[var(--accent)]">
                      Block results
                    </summary>
                    <div className="mt-3 grid gap-2 text-sm font-bold">
                      {log.blockResults.map((blockResult) => (
                        <div key={blockResult.blockKey} className="grid gap-1 border-t border-[var(--border)] pt-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                          <span className="break-words font-black uppercase text-[var(--text)]">{blockResult.blockName}</span>
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
