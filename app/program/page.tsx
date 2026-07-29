"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HeroImagePanel from "@/components/HeroImagePanel";
import WorkoutCard from "@/components/WorkoutCard";
import { getHeroImage } from "@/lib/hero-images";
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

const categoryFilters: CategoryFilter[] = [
  "all",
  "strength",
  "conditioning",
  "track",
  "gymnastics",
  "hybrid",
  "recovery",
];

function getCurrentWeekLabel(startDate: string | null | undefined, durationWeeks: number, now: number) {
  if (!startDate || now === 0) {
    return "No start date";
  }

  const start = new Date(`${startDate}T00:00:00`);
  const today = new Date(now);
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return "Starts soon";
  }

  const currentWeek = Math.floor(diffDays / 7) + 1;

  if (currentWeek > durationWeeks) {
    return "Programme complete";
  }

  return `Week ${currentWeek}`;
}

export default function ProgramPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const now = useNow();
  const todayOverride = useTodayWorkoutOverride();
  const workoutOverrides = useWorkoutOverrides();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const workouts = useMemo(() => (programme ? getAllWorkouts(programme) : []), [programme]);
  const effectiveProgramme = useMemo(() => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null), [programme, workoutOverrides]);
  const sourceWorkoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout] as const)), [workouts]);
  const todaysWorkout = programme ? getTodaysWorkout(programme, logs, now) : null;
  const completedWorkoutIds = useMemo(() => new Set(logs.map((log) => log.workoutId)), [logs]);
  const selectedTodayIsCompleted = Boolean(todaysWorkout && completedWorkoutIds.has(todaysWorkout.id));
  const upNextWorkout = programme && selectedTodayIsCompleted
    ? getNextIncompleteWorkout(programme, logs, todaysWorkout?.id)
    : null;
  const latestLogByWorkoutId = useMemo(() => {
    const sortedLogs = [...logs].sort(
      (first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime(),
    );
    const latest = new Map<string, string>();

    sortedLogs.forEach((log) => {
      if (!latest.has(log.workoutId)) {
        latest.set(log.workoutId, log.completedAt);
      }
    });

    return latest;
  }, [logs]);
  const currentWeekLabel = programme
    ? getCurrentWeekLabel(programme.startDate, programme.durationWeeks, now)
    : "No programme";
  const visibleWeeks = useMemo(
    () =>
      (effectiveProgramme?.weeks ?? [])
        .map((week) => ({
          ...week,
          days:
            categoryFilter === "all"
              ? week.days
              : week.days.filter((day) => day.workout.category === categoryFilter),
        }))
        .filter((week) => week.days.length > 0),
    [categoryFilter, effectiveProgramme],
  );
  const modifiedWorkoutCount = workouts.filter((workout) => workoutOverrides[workout.id]).length;

  if (!programme) {
    return (
      <div className="grid gap-5">
        <header className="border-b border-[var(--border)] pb-5">
          <p className="tv-label text-[var(--accent)]">Programme</p>
          <h1 className="mt-2 text-5xl font-black uppercase leading-none sm:text-6xl">No programme imported yet</h1>
          <p className="mt-3 max-w-2xl text-base font-bold text-[var(--muted)]">
            Import a programme JSON or reset to the sample programme from Admin.
          </p>
          <Link href="/admin/import" className="tv-button-primary mt-5 w-fit">
            Import programme
          </Link>
        </header>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <HeroImagePanel src={getHeroImage("hybrid")} title={programme.name} kicker="Programme" className="hero-media-compact">
        <p className="mt-3 max-w-3xl text-base font-bold text-[var(--muted)]">{programme.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase">
          <span className="border border-[var(--border)] bg-black px-2 py-1 text-[var(--text)]">
            {programme.durationWeeks} weeks
          </span>
          <span className="border border-[var(--border)] bg-black px-2 py-1 text-[var(--text)]">
            {workouts.length} sessions
          </span>
          <span className="border border-[var(--border)] bg-black px-2 py-1 text-[var(--text)]">
            {completedWorkoutIds.size} completed
          </span>
          <span className="border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-[var(--accent)]">
            {currentWeekLabel}
          </span>
          {todayOverride ? (
            <span className="border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-[var(--accent)]">
              {selectedTodayIsCompleted ? "Manual today completed" : "Today selected"}
            </span>
          ) : null}
          {modifiedWorkoutCount > 0 ? (
            <span className="border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-[var(--accent)]">
              {modifiedWorkoutCount} adjusted
            </span>
          ) : null}
          {upNextWorkout ? (
            <span className="border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-[var(--accent)]">
              Up next: {upNextWorkout.title}
            </span>
          ) : null}
        </div>
      </HeroImagePanel>

      <nav aria-label="Category filter" className="flex max-w-full gap-2 overflow-x-auto pb-1">
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

      <section className="grid gap-3">
        {visibleWeeks.map((week) => {
          const weekCompletedCount = week.days.filter((day) => completedWorkoutIds.has(day.workout.id)).length;

          return (
            <details key={week.id} className="tv-card group overflow-hidden" open>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div className="min-w-0">
                  <p className="tv-label">Week {week.weekNumber}</p>
                  <h2 className="mt-1 break-words text-xl font-black uppercase">{week.title}</h2>
                </div>
                <span className="shrink-0 rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--muted)]">
                  {weekCompletedCount}/{week.days.length}
                </span>
              </summary>
              <div className="grid gap-3 p-3 md:grid-cols-2">
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
