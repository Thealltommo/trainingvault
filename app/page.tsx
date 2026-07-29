"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChartNoAxesCombined,
  ClipboardList,
  Dumbbell,
  Gauge,
  Upload,
} from "lucide-react";
import HeroImagePanel from "@/components/HeroImagePanel";
import WorkoutCard from "@/components/WorkoutCard";
import { HERO_IMAGES } from "@/lib/hero-images";
import { normalizeLimiter } from "@/lib/session-log";
import {
  getAllWorkouts,
  getNextIncompleteWorkout,
  getTodaysWorkout,
  useActiveProgrammeOptional,
  useNow,
  useSessionLogs,
  useTodayWorkoutOverride,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { SessionLog } from "@/lib/types";

const linkCards = [
  {
    title: "Program",
    body: "Weeks, sessions, focus tags.",
    href: "/program",
    icon: Dumbbell,
  },
  {
    title: "Log",
    body: "Completed work and notes.",
    href: "/log",
    icon: ClipboardList,
  },
  {
    title: "Progress",
    body: "Categories, RPE, totals.",
    href: "/progress",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Admin Import",
    body: "Paste or reset programme JSON.",
    href: "/admin/import",
    icon: Upload,
  },
];

function getCountdownLabel(dateValue: string | undefined, now: number) {
  if (!dateValue || now === 0) {
    return null;
  }

  const today = new Date(now);
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d ago`;
  }

  return `${diffDays}d`;
}

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
    return "Pre-start";
  }

  const currentWeek = Math.floor(diffDays / 7) + 1;

  if (currentWeek > durationWeeks) {
    return "Complete";
  }

  return `Week ${currentWeek}`;
}

function getLatestLogSummary(log: SessionLog) {
  if (log.blockResults && log.blockResults.length > 0) {
    const doneBlocks = log.blockResults.filter((block) => block.status === "done").length;
    const parts = [`${doneBlocks} blocks done`];
    const loggedLimiter = normalizeLimiter(log.limiter);

    if (loggedLimiter) {
      parts.push(`limiter: ${loggedLimiter}`);
    }

    parts.push(`RPE ${log.rpe}`);
    return parts.join(" / ");
  }

  return `RPE ${log.rpe}`;
}

export default function Home() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const now = useNow();
  const todayOverride = useTodayWorkoutOverride();
  const workoutOverrides = useWorkoutOverrides();
  const todaysWorkout = programme ? getTodaysWorkout(programme, logs, now) : null;
  const workouts = useMemo(() => (programme ? getAllWorkouts(programme) : []), [programme]);
  const sourceWorkoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout] as const)), [workouts]);
  const completedWorkoutIds = useMemo(() => new Set(logs.map((log) => log.workoutId)), [logs]);
  const selectedTodayIsCompleted = Boolean(todaysWorkout && completedWorkoutIds.has(todaysWorkout.id));
  const nextIncompleteWorkout = programme
    ? getNextIncompleteWorkout(programme, logs, selectedTodayIsCompleted ? todaysWorkout?.id : undefined)
    : null;
  const actionWorkout = selectedTodayIsCompleted ? nextIncompleteWorkout : todaysWorkout;
  const todayMode = programme
    ? selectedTodayIsCompleted
      ? todayOverride
        ? "Manual completed / up next"
        : "Completed / up next"
      : todayOverride
        ? "Manual override"
        : programme.startDate
          ? `Started ${programme.startDate}`
          : "First incomplete"
    : "No active programme";
  const recentLogs = useMemo(
    () =>
      [...logs].sort(
        (first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime(),
      ),
    [logs],
  );
  const latestLogByWorkoutId = useMemo(() => {
    const latest = new Map<string, string>();

    recentLogs.forEach((log) => {
      if (!latest.has(log.workoutId)) {
        latest.set(log.workoutId, log.completedAt);
      }
    });

    return latest;
  }, [recentLogs]);
  const lastSevenDays = useMemo(() => {
    const cutoff = now - 7 * 86_400_000;
    return logs.filter((log) => new Date(log.completedAt).getTime() >= cutoff);
  }, [logs, now]);
  const averageRpe =
    logs.length > 0 ? (logs.reduce((total, log) => total + log.rpe, 0) / logs.length).toFixed(1) : "0.0";
  const modifiedWorkoutCount = workouts.filter((workout) => workoutOverrides[workout.id]).length;
  const currentWeekLabel = programme
    ? getCurrentWeekLabel(programme.startDate, programme.durationWeeks, now)
    : "No active programme";
  const targetCountdown = getCountdownLabel(programme?.targetDate, now);
  const checkpointCountdown = getCountdownLabel(programme?.checkpointDate, now);
  const latestLog = recentLogs[0];

  if (!programme) {
    return (
      <div className="grid gap-5">
        <HeroImagePanel src={HERO_IMAGES.home} title="Build Your Engine" kicker="TrainVault" priority className="hero-media-large">
          <p className="mt-4 max-w-xl text-lg font-bold text-[var(--muted)]">
            Your plan. Your standard. Your time.
          </p>
          <Link href="/admin/import" className="tv-button-primary mt-5 w-fit">
            Import programme
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </HeroImagePanel>

        <section className="tv-card border-[rgba(215,255,47,0.28)] p-5">
          <p className="tv-label text-[var(--accent)]">No active programme</p>
          <h1 className="mt-2 text-3xl font-black uppercase">Import or reset a programme to start training.</h1>
          <p className="mt-3 max-w-2xl text-sm font-bold text-[var(--muted)]">
            Logs are kept separately, so clearing a programme does not erase completed sessions unless you choose that in Admin.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/admin/import" className="tv-button-primary">
              Import programme
            </Link>
            <Link href="/admin/import" className="tv-button-ghost">
              Restore from cloud
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {linkCards.map((card) => {
            const Icon = card.icon;

            return (
              <Link key={card.href} href={card.href} className="tv-card tv-card-hover block min-h-36 p-4">
                <Icon className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-black uppercase">{card.title}</h2>
                <p className="mt-1 text-sm font-bold text-[var(--muted)]">{card.body}</p>
              </Link>
            );
          })}
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <HeroImagePanel src={HERO_IMAGES.home} title="Build Your Engine" kicker="TrainVault" priority className="hero-media-large">
        <p className="mt-4 max-w-xl text-lg font-bold text-[var(--muted)]">
          Your plan. Your standard. Your time.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase text-[var(--muted)]">
          <span className="border border-[var(--border)] bg-black px-2 py-1">Run</span>
          <span className="border border-[var(--border)] bg-black px-2 py-1">Lift</span>
          <span className="border border-[var(--border)] bg-black px-2 py-1">Prep</span>
          {modifiedWorkoutCount > 0 ? (
            <span className="border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-[var(--accent)]">
              {modifiedWorkoutCount} adjusted
            </span>
          ) : null}
        </div>
        {actionWorkout ? (
          <Link href={`/session/${actionWorkout.id}`} className="tv-button-primary mt-5 w-fit">
            Start Session
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </HeroImagePanel>

      <section className="grid gap-2 sm:grid-cols-4">
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Current Phase</p>
          <p className="mt-1 text-sm font-black uppercase text-[var(--text)]">
            {actionWorkout?.phase ?? todaysWorkout?.phase ?? "Not set"}
          </p>
        </article>
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Current Week</p>
          <p className="mt-1 text-sm font-black uppercase text-[var(--text)]">{currentWeekLabel}</p>
        </article>
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Target Event</p>
          <p className="mt-1 text-sm font-black uppercase text-[var(--text)]">
            {targetCountdown ? `${targetCountdown} / ${programme.targetEvent ?? "Target"}` : "Not set"}
          </p>
        </article>
        <article className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="tv-label">Checkpoint</p>
          <p className="mt-1 text-sm font-black uppercase text-[var(--text)]">
            {checkpointCountdown ? `${checkpointCountdown} / ${programme.checkpointName ?? "Checkpoint"}` : "Not set"}
          </p>
        </article>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="tv-label">Today</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Session card</h2>
              <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{todayMode}</p>
            </div>
          </div>

          {selectedTodayIsCompleted && todaysWorkout ? (
            <article className="tv-card border-[rgba(215,255,47,0.28)] p-4">
              <p className="tv-label text-[var(--accent)]">Completed today</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <h3 className="min-w-0 break-words text-xl font-black uppercase">{todaysWorkout.title}</h3>
                <span className="rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-xs font-black uppercase text-[var(--accent)]">
                  Logged
                </span>
              </div>
              {actionWorkout ? (
                <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                  Up next: <span className="text-[var(--text)]">{actionWorkout.title}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm font-bold text-[var(--muted)]">No incomplete sessions remain.</p>
              )}
            </article>
          ) : null}

          {actionWorkout ? (
            <WorkoutCard
              workout={actionWorkout}
              sourceWorkout={sourceWorkoutById.get(actionWorkout.id)}
              href={`/session/${actionWorkout.id}`}
              eyebrow={selectedTodayIsCompleted ? "Up Next" : "Today's Session"}
              completed={completedWorkoutIds.has(actionWorkout.id)}
              isToday={!selectedTodayIsCompleted && todaysWorkout?.id === actionWorkout.id}
              isNext={selectedTodayIsCompleted}
              variant="featured"
              lastCompletedAt={latestLogByWorkoutId.get(actionWorkout.id)}
              ctaLabel={selectedTodayIsCompleted ? "Start Next" : undefined}
              index={0}
            />
          ) : (
            <article className="tv-card min-h-44 p-4">
              <p className="tv-label">Complete</p>
              <h3 className="mt-2 text-xl font-black uppercase">All sessions are logged</h3>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">Import the next block when you are ready.</p>
            </article>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <article className="tv-card p-4">
              <p className="tv-label">Completed 7d</p>
              <p className="mt-3 text-4xl font-black text-[var(--accent)]">{lastSevenDays.length}</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">sessions banked</p>
            </article>
            <article className="tv-card p-4">
              <p className="tv-label">Programme</p>
              <p className="mt-3 text-4xl font-black text-[var(--accent)]">{workouts.length}</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">total sessions</p>
            </article>
            <article className="tv-card p-4">
              <p className="tv-label">Average RPE</p>
              <p className="mt-3 text-4xl font-black text-[var(--accent)]">{averageRpe}</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">logged effort</p>
            </article>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <article className="tv-card p-4">
            <div className="flex items-center justify-between">
              <p className="tv-label">Readiness</p>
              <Gauge className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <p className="mt-3 text-5xl font-black text-[var(--accent)]">82</p>
            <div className="mt-4 grid gap-2 text-sm font-bold text-[var(--muted)]">
              <div className="flex justify-between border-t border-[var(--border)] pt-2">
                <span>Sleep</span>
                <span className="text-[var(--text)]">7h 18m</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2">
                <span>Stress</span>
                <span className="text-[var(--text)]">Low</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2">
                <span>Warmup</span>
                <span className="text-[var(--text)]">Extended</span>
              </div>
            </div>
          </article>

          <article className="tv-card p-4">
            <div className="flex items-center justify-between">
              <p className="tv-label">Latest Log</p>
              <Calendar className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            {latestLog ? (
              <div className="mt-3">
                <h3 className="break-words font-black uppercase">{latestLog.workoutTitle}</h3>
                <p className="mt-1 text-sm font-bold text-[var(--muted)]">{getLatestLogSummary(latestLog)}</p>
                {latestLog.result && !latestLog.blockResults?.length ? (
                  <p className="mt-3 max-h-10 overflow-hidden break-words border-l-2 border-[var(--accent)] pl-3 text-sm text-[var(--text)]">
                    {latestLog.result}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm font-bold text-[var(--muted)]">No sessions logged yet.</p>
            )}
          </article>
        </aside>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {linkCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link key={card.href} href={card.href} className="tv-card tv-card-hover block min-h-36 p-4">
              <Icon className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black uppercase">{card.title}</h2>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">{card.body}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
