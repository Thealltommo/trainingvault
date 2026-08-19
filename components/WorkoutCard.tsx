"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Check, Clock, Dumbbell, Gauge, Pin, Play } from "lucide-react";
import WorkoutMovePanel from "@/components/WorkoutMovePanel";
import { HERO_IMAGES, getHeroImageForWorkout } from "@/lib/hero-images";
import { applyWorkoutOverride, useWorkoutOverrides } from "@/lib/storage";
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

const darkChip = "border-white/15 bg-[#07162a]/75 text-[#c8d4e4]";

const intensityClasses = {
  easy: "border-white/15 bg-[#07162a]/75 text-[#b2c3d7]",
  moderate: "border-[rgba(79,140,255,0.38)] bg-[rgba(79,140,255,0.14)] text-[#a9c7ff]",
  hard: "border-[rgba(255,65,87,0.52)] bg-[rgba(255,65,87,0.15)] text-[#ff8795]",
};

function getPriorityClasses(priority: Workout["priority"]) {
  switch (priority) {
    case "High":
      return "border-[var(--red)] bg-[var(--red)] text-white";
    case "Target":
      return "border-[rgba(255,65,87,0.55)] bg-[rgba(255,65,87,0.16)] text-[#ff8b98]";
    case "Medium":
    case "Primer":
      return "border-[rgba(79,140,255,0.4)] bg-[rgba(79,140,255,0.13)] text-[#a7c5ff]";
    case "Recovery":
    case "Optional":
    case "Low":
    default:
      return darkChip;
  }
}

function formatCompletedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatSessionDate(value: string | undefined) {
  if (!value) return "No date";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function StatusChip({ completed, isToday, isNext }: { completed: boolean; isToday: boolean; isNext: boolean }) {
  if (completed) {
    return (
      <span className="tv-chip border-[rgba(76,199,122,0.46)] bg-[rgba(76,199,122,0.14)] text-[#83dfa4]">
        <Check className="h-4 w-4" aria-hidden="true" />
        Completed
      </span>
    );
  }

  if (isToday) {
    return (
      <span className="tv-chip border-[rgba(79,140,255,0.54)] bg-[rgba(79,140,255,0.16)] text-[#a7c5ff]">
        <span className="h-2 w-2 rounded-full bg-[#69a0ff] shadow-[0_0_12px_rgba(79,140,255,0.8)]" />
        Today
      </span>
    );
  }

  if (isNext) {
    return <span className="tv-chip border-[rgba(255,65,87,0.46)] bg-[rgba(255,65,87,0.13)] text-[#ff8996]">Up next</span>;
  }

  return <span className={`tv-chip ${darkChip}`}>Upcoming</span>;
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
    <div className="flex flex-wrap gap-1.5 text-sm font-bold">
      <span className={`tv-chip ${darkChip}`}>
        <Clock className="h-4 w-4" aria-hidden="true" />
        {workout.minimumMinutes ? `Full ${workout.durationMinutes} min` : `${workout.durationMinutes} min`}
      </span>
      {workout.minimumMinutes ? <span className={`tv-chip ${darkChip}`}>Min {workout.minimumMinutes} min</span> : null}
      {workout.date ? (
        <span className={`tv-chip ${darkChip}`}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {formatSessionDate(workout.date)}
        </span>
      ) : null}
      {override ? <span className="tv-chip border-[rgba(79,140,255,0.46)] bg-[rgba(79,140,255,0.14)] text-[#a7c5ff]">Modified</span> : null}
      {moved ? (
        <>
          <span className="tv-chip border-[rgba(255,65,87,0.46)] bg-[rgba(255,65,87,0.13)] text-[#ff8996]">Moved</span>
          <span className={`tv-chip ${darkChip}`}>From {formatSessionDate(sourceWorkout.date)}</span>
        </>
      ) : null}
      <span className={`tv-chip ${intensityClasses[workout.intensity]}`}>
        <Gauge className="h-4 w-4" aria-hidden="true" />
        {workout.intensity}
      </span>
      <span className="tv-chip border-[rgba(79,140,255,0.4)] bg-[rgba(79,140,255,0.13)] text-[#a7c5ff]">
        <Dumbbell className="h-4 w-4" aria-hidden="true" />
        {workout.category}
      </span>
      {workout.sessionType ? <span className={`tv-chip ${darkChip}`}>{workout.sessionType}</span> : null}
      {workout.phase ? <span className={`tv-chip ${darkChip}`}>Phase: {workout.phase}</span> : null}
      {workout.priority ? <span className={`tv-chip ${getPriorityClasses(workout.priority)}`}>{workout.priority}</span> : null}
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
  const override = overrides[originalWorkout.id] ?? null;
  const effectiveWorkout = applyWorkoutOverride(originalWorkout, override);
  const heroSrc = getHeroImageForWorkout(effectiveWorkout, index);
  const featured = variant === "featured";
  const compact = variant === "compact";
  const titleClass = featured
    ? "break-words text-3xl font-black leading-none text-white sm:text-4xl"
    : compact
      ? "break-words text-lg font-black leading-tight text-white"
      : "break-words text-2xl font-black leading-tight text-white";

  return (
    <article
      className={`premium-workout-card group relative isolate grid overflow-hidden rounded-xl border border-white/12 bg-[#07162a] ${
        featured ? "min-h-[18rem] p-4 sm:min-h-[20rem] sm:p-5" : compact ? "min-h-40 p-3.5" : "min-h-[15rem] p-4"
      } ${completed ? "premium-workout-card-completed" : ""} ${isToday && !completed ? "premium-workout-card-today" : ""} ${isNext && !completed ? "premium-workout-card-next" : ""} ${className}`}
    >
      <Image
        src={heroSrc}
        alt=""
        fill
        sizes={featured ? "(max-width: 768px) 100vw, 760px" : "(max-width: 768px) 100vw, 50vw"}
        className={`premium-workout-card-image object-cover ${featured ? "opacity-70" : "opacity-48"}`}
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

      <div className="relative z-10 grid h-full gap-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? <p className="mb-2 text-[0.67rem] font-black uppercase tracking-[0.13em] text-[#78aaff]">{eyebrow}</p> : null}
            <h3 className={titleClass}>{effectiveWorkout.title}</h3>
            {lastCompletedAt ? <p className="mt-2 text-xs font-bold text-[#9db0c7]">Last completed {formatCompletedDate(lastCompletedAt)}</p> : null}
          </div>
          {isToday && !completed ? (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgba(79,140,255,0.52)] bg-[#07162a]/80 text-[#7eacff] shadow-[0_0_24px_rgba(79,140,255,0.2)]">
              <Pin className="h-4.5 w-4.5" aria-hidden="true" />
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

        <div className="flex flex-wrap gap-1.5">
          {effectiveWorkout.focus.map((focus) => (
            <span key={focus} className="max-w-full break-words rounded-full border border-white/12 bg-[#07162a]/70 px-2 py-1 text-[0.68rem] font-bold text-[#9eb1c7] backdrop-blur">
              {focus}
            </span>
          ))}
        </div>

        {featured && (effectiveWorkout.targetStimulus || effectiveWorkout.prescribedLoadsOrPace) ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {effectiveWorkout.targetStimulus ? (
              <div className="rounded-lg border-l-2 border-[#69a0ff] bg-[#07162a]/74 p-3 backdrop-blur">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#8bb4ff]">Today&apos;s intent</p>
                <p className="mt-1 text-sm font-semibold text-white">{effectiveWorkout.targetStimulus}</p>
              </div>
            ) : null}
            {effectiveWorkout.prescribedLoadsOrPace ? (
              <div className="rounded-lg border-l-2 border-[#ff5367] bg-[#07162a]/74 p-3 backdrop-blur">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#ff8996]">Load / pace</p>
                <p className="mt-1 text-sm font-semibold text-white">{effectiveWorkout.prescribedLoadsOrPace}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2">
          {href ? (
            <Link href={href} className="tv-button-primary min-w-28">
              <Play className="h-4 w-4" aria-hidden="true" />
              {ctaLabel ?? (featured ? "Start session" : "Open")}
            </Link>
          ) : null}
          {featured && href ? <Link href={href} className="tv-button-ghost border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">Details</Link> : null}
          {onSetToday ? (
            <button type="button" onClick={onSetToday} className="tv-button-ghost border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Pin className="h-4 w-4" aria-hidden="true" />
              Set today
            </button>
          ) : null}
          <WorkoutMovePanel workout={effectiveWorkout} sourceWorkout={originalWorkout} />
        </div>
      </div>
    </article>
  );
}
