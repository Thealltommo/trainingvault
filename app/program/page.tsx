"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BrainCircuit, CheckCircle2, ChevronRight, ShieldCheck, TriangleAlert } from "lucide-react";
import WorkoutCard from "@/components/WorkoutCard";
import { auditCurrentPlan } from "@/lib/coaching";
import {
  getAllWorkouts,
  getEffectiveProgramme,
  getNextIncompleteWorkout,
  getTodaysWorkout,
  setTodayWorkoutOverride,
  useActiveProgrammeOptional,
  useNow,
  useSessionLogs,
  useTodayWorkoutOverride,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { WorkoutCategory } from "@/lib/types";

type CategoryFilter = "all" | WorkoutCategory;

const categoryFilters: CategoryFilter[] = ["all", "strength", "conditioning", "track", "gymnastics", "hybrid", "recovery"];

export default function ProgramPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const now = useNow();
  const todayOverride = useTodayWorkoutOverride();
  const workoutOverrides = useWorkoutOverrides();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const workouts = useMemo(() => (programme ? getAllWorkouts(programme) : []), [programme]);
  const effectiveProgramme = useMemo(
    () => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null),
    [programme, workoutOverrides],
  );
  const sourceWorkoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout] as const)), [workouts]);
  const todaysWorkout = programme ? getTodaysWorkout(programme, logs, now) : null;
  const completedWorkoutIds = useMemo(() => new Set(logs.map((log) => log.workoutId)), [logs]);
  const selectedTodayIsCompleted = Boolean(todaysWorkout && completedWorkoutIds.has(todaysWorkout.id));
  const upNextWorkout = programme && selectedTodayIsCompleted ? getNextIncompleteWorkout(programme, logs, todaysWorkout?.id) : null;
  const audit = useMemo(() => auditCurrentPlan(effectiveProgramme, logs, now), [effectiveProgramme, logs, now]);
  const latestLogByWorkoutId = useMemo(() => {
    const sortedLogs = [...logs].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const latest = new Map<string, string>();
    sortedLogs.forEach((log) => {
      if (!latest.has(log.workoutId)) latest.set(log.workoutId, log.completedAt);
    });
    return latest;
  }, [logs]);
  const visibleWeeks = useMemo(
    () => (effectiveProgramme?.weeks ?? [])
      .map((week) => ({
        ...week,
        days: categoryFilter === "all" ? week.days : week.days.filter((day) => day.workout.category === categoryFilter),
      }))
      .filter((week) => week.days.length > 0),
    [categoryFilter, effectiveProgramme],
  );
  const modifiedWorkoutCount = workouts.filter((workout) => workoutOverrides[workout.id]).length;

  if (!programme) {
    return (
      <div className="agoge-page">
        <section className="tv-card p-5 sm:p-6">
          <p className="tv-label text-[var(--accent)]">Training plan</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">No programme imported yet.</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--muted)]">Import a programme JSON or restore the sample block from Data & Import.</p>
          <Link href="/admin/import" className="tv-button-primary mt-5 w-fit">Import programme</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="agoge-page">
      <section className="grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="tv-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="tv-label text-[var(--accent)]">Training plan</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] sm:text-3xl">{programme.name}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-[var(--muted)]">{programme.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">{programme.durationWeeks} weeks</span>
              <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">{workouts.length} sessions</span>
              <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">{completedWorkoutIds.size} logged</span>
              {modifiedWorkoutCount > 0 ? <span className="tv-chip border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]">{modifiedWorkoutCount} adjusted</span> : null}
              {todayOverride ? <span className="tv-chip border-[var(--red)] bg-[var(--red-soft)] text-[var(--red)]">Manual today</span> : null}
            </div>
          </div>
        </article>

        <article className={`rounded-xl border p-4 ${audit.gaps.length > 0 ? "border-[color-mix(in_srgb,var(--amber)_36%,var(--border))] bg-[var(--amber-soft)]" : "border-[color-mix(in_srgb,var(--green)_36%,var(--border))] bg-[var(--green-soft)]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="tv-label">Plan audit</p>
              <p className="mt-1 text-3xl font-black tracking-tight text-[var(--text)]">{audit.score}<span className="text-sm text-[var(--muted)]">/100</span></p>
            </div>
            <ShieldCheck className={`h-5 w-5 ${audit.gaps.length > 0 ? "text-[var(--amber)]" : "text-[var(--green)]"}`} aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold leading-relaxed text-[var(--text)]">
            {audit.gaps[0] ?? "The current week has a balanced mix of quality, easy work and specificity."}
          </p>
          <Link href="/coaching" className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[var(--accent)]">
            Why this score <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>
      </section>

      <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Runs", audit.runSessions],
          ["Quality", audit.qualityRuns],
          ["Easy", audit.easyRuns],
          ["Long", audit.longRuns],
          ["Hill / fell", audit.hillSessions],
          ["CrossFit", audit.crossFitSessions],
        ].map(([label, value]) => (
          <article key={String(label)} className="tv-kpi">
            <p className="tv-label">{label}</p>
            <p className="tv-kpi-value">{value}</p>
          </article>
        ))}
      </section>

      {audit.genericRunPattern || audit.hardDayClashes > 0 || audit.lowerBodyRunClashes > 0 ? (
        <section className="rounded-xl border border-[color-mix(in_srgb,var(--red)_28%,var(--border))] bg-[var(--red-soft)] p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--red)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-[var(--red)]">This is exactly where the old plan was too generic.</p>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--text)]">
                {audit.genericRunPattern
                  ? "Threshold + intervals + long run is a useful skeleton, but repeating it unchanged leaves hill power, running economy and race-specific durability undertrained. The coaching layer now flags that pattern and recommends a rotating second quality session and varied long-run terrain."
                  : "The current issue is interference rather than session choice: hard CrossFit and key running are landing too close together. The coaching report shows what to move or protect."}
              </p>
              <Link href="/coaching" className="tv-button-ghost mt-3 w-fit bg-[var(--surface)]">
                <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                Open coaching report
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <nav aria-label="Category filter" className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {categoryFilters.map((category) => (
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

      <section className="grid gap-3">
        {visibleWeeks.map((week) => {
          const weekCompletedCount = week.days.filter((day) => completedWorkoutIds.has(day.workout.id)).length;
          const isCurrent = audit.week?.id === week.id;

          return (
            <details key={week.id} className="tv-card group overflow-hidden" open={isCurrent || categoryFilter !== "all"}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="tv-label text-[var(--accent)]">Week {week.weekNumber}</p>
                    {isCurrent ? <span className="tv-chip border-[var(--red)] bg-[var(--red-soft)] text-[var(--red)]">Current</span> : null}
                  </div>
                  <h2 className="mt-1 break-words text-lg font-black tracking-tight">{week.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {weekCompletedCount === week.days.length ? <CheckCircle2 className="h-4.5 w-4.5 text-[var(--green)]" aria-hidden="true" /> : null}
                  <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">{weekCompletedCount}/{week.days.length}</span>
                </div>
              </summary>
              <div className="grid gap-2 border-t border-[var(--border)] p-2 sm:p-3 md:grid-cols-2 xl:grid-cols-3">
                {week.days.map((day, dayIndex) => {
                  const isCompleted = completedWorkoutIds.has(day.workout.id);
                  return (
                    <WorkoutCard
                      key={day.id}
                      workout={day.workout}
                      sourceWorkout={sourceWorkoutById.get(day.workout.id)}
                      href={`/session/${day.workout.id}`}
                      eyebrow={day.label}
                      completed={isCompleted}
                      isToday={todaysWorkout?.id === day.workout.id && !isCompleted}
                      isNext={upNextWorkout?.id === day.workout.id}
                      onSetToday={() => setTodayWorkoutOverride(day.workout.id)}
                      lastCompletedAt={latestLogByWorkoutId.get(day.workout.id)}
                      index={week.weekNumber * 10 + dayIndex}
                      variant="compact"
                    />
                  );
                })}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
