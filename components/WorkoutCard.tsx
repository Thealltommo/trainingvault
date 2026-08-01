"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Check, Clock, Dumbbell, Gauge, Pin, Play } from "lucide-react";
import CompletedSessionReview from "@/components/CompletedSessionReview";
import WorkoutMovePanel from "@/components/WorkoutMovePanel";
import { useGarminLocalState } from "@/lib/garmin-storage";
import { HERO_IMAGES, getHeroImageForWorkout } from "@/lib/hero-images";
import { applyWorkoutOverride, useSessionLogs, useWorkoutOverrides } from "@/lib/storage";
import type { Workout, WorkoutOverride } from "@/lib/types";

type WorkoutCardVariant = "default" | "featured" | "compact";

type WorkoutCardProps = {
  workout: Workout;
  sourceWorkout?: Workout;
  eyebrow?: string;
  href?: string;
  completed?: boolean;
  isToday?: boolean;
  isNext?: boolean;
  onSetToday?: () => void;
  variant?: WorkoutCardVariant;
  className?: string;
  lastCompletedAt?: string | null;
  ctaLabel?: string;
  index?: number;
};

const intensityClasses = {
  easy: "border-[var(--border)] bg-black/70 text-[var(--muted)]",
  moderate: "border-[rgba(215,255,47,0.35)] bg-[rgba(215,255,47,0.1)] text-[var(--text)]",
  hard: "border-[var(--accent)] bg-[rgba(215,255,47,0.16)] text-[var(--accent)]",
};

function getPriorityClasses(priority: Workout["priority"]) {
  switch (priority) {
    case "High":
      return "border-[var(--accent)] bg-[var(--accent)] text-black";
    case "Target":
      return "border-[var(--accent)] bg-[rgba(215,255,47,0.18)] text-[var(--accent)] shadow-[0_0_24px_rgba(215,255,47,0.16)]";
    case "Medium":
    case "Primer":
      return "border-[rgba(215,255,47,0.35)] bg-black/70 text-[var(--text)]";
    case "Recovery":
    case "Optional":
    case "Low":
      return "border-[var(--border)] bg-black/70 text-[var(--muted)]";
    default:
      return "border-[var(--border)] bg-black/70 text-[var(--muted)]";
  }
}

function formatCompletedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatSessionDate(value: string | undefined) {
  if (!value) {
    return "No date";
  }

  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function StatusChip({ completed, isToday, isNext }: { completed: boolean; isToday: boolean; isNext: boolean }) {
  if (completed) {
    return (
      <span className="tv-chip border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]">
        <Check className="h-4 w-4" aria-hidden="true" />
        Completed
      </span>
    );
  }

  if (isToday) {
    return (
      <span className="tv-chip border-[var(--accent)] bg-[rgba(215,255,47,0.14)] text-[var(--accent)]">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_14px_rgba(215,255,47,0.9)]" />
        Today
      </span>
    );
  }

  if (isNext) {
    return (
      <span className="tv-chip border-[rgba(215,255,47,0.42)] bg-black/70 text-[var(--accent)]">
        Up next
      </span>
    );
  }

  return <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--muted)]">Upcoming</span>;
}

function MetadataChips({
  workout,
  sourceWorkout,
  override,
  completed,
  isToday,
  isNext,
}: {
  workout: Workout;
  sourceWorkout: Workout;
  override: WorkoutOverride | null;
  completed: boolean;
  isToday: boolean;
  isNext: boolean;
}) {
  const moved = (workout.date ?? "") !== (sourceWorkout.date ?? "");

  return (
    <div className="flex flex-wrap gap-2 text-sm font-bold text-[var(--muted)]">
      <span className="tv-chip border-[var(--border)] bg-black/70">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {workout.minimumMinutes ? `Full ${workout.durationMinutes} min` : `${workout.durationMinutes} min`}
      </span>
      {workout.minimumMinutes ? (
        <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--muted)]">
          Min {workout.minimumMinutes} min
        </span>
      ) : null}
      {workout.date ? (
        <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--muted)]">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {formatSessionDate(workout.date)}
        </span>
      ) : null}
      {override ? (
        <span className="tv-chip border-[rgba(215,255,47,0.42)] bg-black/70 text-[var(--accent)]">
          Modified
        </span>
      ) : null}
      {moved ? (
        <>
          <span className="tv-chip border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]">
            Moved
          </span>
          <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--muted)]">
            From {formatSessionDate(sourceWorkout.date)}
          </span>
        </>
      ) : null}
      <span className={`tv-chip uppercase ${intensityClasses[workout.intensity]}`}>
        <Gauge className="h-4 w-4" aria-hidden="true" />
        {workout.intensity}
      </span>
      <span className="tv-chip border-[rgba(215,255,47,0.35)] bg-black/70 text-[var(--accent)]">
        <Dumbbell className="h-4 w-4" aria-hidden="true" />
        {workout.category}
      </span>
      {workout.sessionType ? (
        <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--text)]">{workout.sessionType}</span>
      ) : null}
      {workout.phase ? (
        <span className="tv-chip border-[var(--border)] bg-black/70 text-[var(--muted)]">Phase: {workout.phase}</span>
      ) : null}
      {workout.priority ? (
        <span className={`tv-chip uppercase ${getPriorityClasses(workout.priority)}`}>{workout.priority}</span>
      ) : null}
      <StatusChip completed={completed} isToday={isToday} isNext={isNext} />
    </div>
  );
}

export default function WorkoutCard({
  workout,
  sourceWorkout,
  eyebrow,
  href,
  completed = false,
  isToday = false,
  isNext = false,
  onSetToday,
  variant = "default",
  className = "",
  lastCompletedAt,
  ctaLabel,
  index,
}: WorkoutCardProps) {
  const originalWorkout = sourceWorkout ?? workout;
  const overrides = useWorkoutOverrides();
  const logs = useSessionLogs();
  const garmin = useGarminLocalState();
  const override = overrides[originalWorkout.id] ?? null;
  const effectiveWorkout = applyWorkoutOverride(originalWorkout, override);
  const heroSrc = getHeroImageForWorkout(effectiveWorkout, index);
  const featured = variant === "featured";
  const compact = variant === "compact";
  const latestLog = logs
    .filter((log) => log.workoutId === effectiveWorkout.id)
    .sort(
      (first, second) =>
        new Date(second.completedAt).getTime() -
        new Date(first.completedAt).getTime(),
    )[0] ?? null;
  const linkedActivityId = Object.values(garmin.activityLinks).find(
    (link) => link.sessionId === effectiveWorkout.id,
  )?.activityId;
  const linkedActivity =
    garmin.activities.find(
      (record) => record.activity.activityId === linkedActivityId,
    )?.activity ?? null;
  const reviewHref = completed && href ? `${href}#post-session-review` : href;
  const titleClass = featured
    ? "break-words text-4xl font-black uppercase leading-none text-[var(--text)] sm:text-5xl"
    : compact
      ? "break-words text-lg font-black uppercase leading-tight text-[var(--text)]"
      : "break-words text-2xl font-black uppercase leading-tight text-[var(--text)]";

  return (
    <article
      className={`premium-workout-card group relative isolate grid overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[0_22px_70px_rgba(0,0,0,0.38)] ${
        featured ? "min-h-[21rem] p-5 sm:min-h-[24rem] sm:p-6" : compact ? "min-h-44 p-4" : "min-h-[18rem] p-4"
      } ${completed ? "premium-workout-card-completed" : ""} ${isToday && !completed ? "premium-workout-card-today" : ""} ${isNext && !completed ? "premium-workout-card-next" : ""} ${className}`}
    >
      <Image
        src={heroSrc}
        alt=""
        fill
        sizes={featured ? "(max-width: 768px) 100vw, 760px" : "(max-width: 768px) 100vw, 50vw"}
        className={`premium-workout-card-image object-cover ${featured ? "opacity-70" : "opacity-42"}`}
        style={{ objectPosition: featured ? "62% center" : "72% center" }}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.src = HERO_IMAGES.fallback;
        }}
      />
      <div className="premium-workout-card-overlay" aria-hidden="true" />
      <div className="premium-workout-card-gloss" aria-hidden="true" />
      <div className="premium-workout-card-beam" aria-hidden="true" />
      <div className="premium-workout-card-rule" aria-hidden="true" />

      <div className="relative z-10 grid h-full gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? <p className="tv-label mb-2 text-[var(--accent)]">{eyebrow}</p> : null}
            <h3 className={titleClass}>{effectiveWorkout.title}</h3>
            {lastCompletedAt ? (
              <p className="mt-2 text-xs font-black uppercase text-[var(--muted)]">
                Last completed {formatCompletedDate(lastCompletedAt)}
              </p>
            ) : null}
          </div>
          {isToday && !completed ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--accent)] bg-black/70 text-[var(--accent)] shadow-[0_0_28px_rgba(215,255,47,0.18)]">
              <Pin className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <MetadataChips
          workout={effectiveWorkout}
          sourceWorkout={originalWorkout}
          override={override}
          completed={completed}
          isToday={isToday}
          isNext={isNext}
        />

        <div className="flex flex-wrap gap-2">
          {effectiveWorkout.focus.map((focus) => (
            <span
              key={focus}
              className="max-w-full break-words rounded-sm border border-[var(--border)] bg-black/70 px-2 py-1 text-xs font-bold uppercase text-[var(--muted)] backdrop-blur"
            >
              {focus}
            </span>
          ))}
        </div>

        {featured && (effectiveWorkout.targetStimulus || effectiveWorkout.prescribedLoadsOrPace) ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {effectiveWorkout.targetStimulus ? (
              <div className="border-l-2 border-[var(--accent)] bg-black/70 p-3 backdrop-blur">
                <p className="tv-label text-[var(--accent)]">Today&apos;s Intent</p>
                <p className="mt-1 text-sm font-bold text-[var(--text)]">{effectiveWorkout.targetStimulus}</p>
              </div>
            ) : null}
            {effectiveWorkout.prescribedLoadsOrPace ? (
              <div className="border-l-2 border-[rgba(215,255,47,0.45)] bg-black/70 p-3 backdrop-blur">
                <p className="tv-label text-[var(--accent)]">Load / Pace</p>
                <p className="mt-1 text-sm font-bold text-[var(--text)]">{effectiveWorkout.prescribedLoadsOrPace}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {featured && completed ? (
          <CompletedSessionReview
            workout={effectiveWorkout}
            log={latestLog}
            activity={linkedActivity}
            compact
          />
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2">
          {reviewHref ? (
            <Link href={reviewHref} className="tv-button-primary min-w-32">
              <Play className="h-4 w-4" aria-hidden="true" />
              {ctaLabel ?? (featured ? "Start Session" : "Open")}
            </Link>
          ) : null}
          {featured && reviewHref ? (
            <Link href={reviewHref} className="tv-button-ghost">
              {completed ? "Debrief" : "Details"}
            </Link>
          ) : null}
          {onSetToday ? (
            <button type="button" onClick={onSetToday} className="tv-button-ghost">
              <Pin className="h-4 w-4" aria-hidden="true" />
              Set Today
            </button>
          ) : null}
          <WorkoutMovePanel workout={effectiveWorkout} sourceWorkout={originalWorkout} />
        </div>
      </div>
    </article>
  );
}
