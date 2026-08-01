"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Mountain,
  Pencil,
  Route,
  Sparkles,
} from "lucide-react";
import RunActivityAnalysis from "@/components/RunActivityAnalysis";
import { useManualSessions } from "@/lib/planning-storage";
import {
  useGarminLocalState,
  type NormalizedGarminActivity,
} from "@/lib/garmin-storage";
import { buildSessionReview } from "@/lib/session-review";
import { useStructuredRunningWorkout } from "@/lib/structured-running-storage";
import {
  applyWorkoutOverride,
  getAllWorkouts,
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { BlockResult, SessionLog, Workout } from "@/lib/types";

function formatDate(value: string | undefined | null) {
  if (!value) return "Date unavailable";
  const parsed = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDistance(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "—";
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatPace(secondsPerKm: number | null | undefined) {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

function formatHeartRate(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)} bpm`;
}

function formatCadence(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)} spm`;
}

function isRun(workout: Workout, activity: NormalizedGarminActivity | null) {
  const signal = `${workout.category} ${workout.sessionType ?? ""} ${activity?.activityType ?? ""}`.toLowerCase();
  return signal.includes("run") || signal.includes("track") || signal.includes("trail") || signal.includes("race");
}

function latestLogForWorkout(logs: SessionLog[], workoutId: string) {
  return logs
    .filter((log) => log.workoutId === workoutId)
    .sort(
      (first, second) =>
        new Date(second.completedAt).getTime() -
        new Date(first.completedAt).getTime(),
    )[0] ?? null;
}

function feedbackLabel(log: SessionLog | null) {
  if (!log) return "Athlete feedback missing";
  const execution = {
    as_planned: "As planned",
    modified: "Modified",
    cut_short: "Cut short",
  }[log.execution ?? "as_planned"];
  const feel = {
    strong: "Strong",
    controlled: "Controlled",
    struggled: "Struggled",
  }[log.sessionFeel ?? "controlled"];
  const recovery = {
    none: "No recovery concern",
    monitor: "Monitor recovery",
    protect_next: "Protect next quality",
  }[log.recoveryConcern ?? "none"];
  return `RPE ${log.rpe} · ${execution} · ${feel} · ${recovery}`;
}

function resultSummary(result: BlockResult) {
  return [
    result.result,
    result.load,
    result.reps ? `${result.reps} reps` : null,
    result.time,
    result.distance,
    result.calories ? `${result.calories} cal` : null,
    result.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="min-w-0 border-l border-[var(--border)] pl-3 first:border-l-0 first:pl-0 sm:pl-4">
      <div className="flex items-center gap-1.5 text-[var(--muted)]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[0.62rem] font-black uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-1 truncate text-lg font-black tracking-tight text-[var(--text)] sm:text-xl">{value}</p>
    </div>
  );
}

export default function CompletedSessionReportPage() {
  const params = useParams<{ id: string }>();
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const garmin = useGarminLocalState();
  const structuredWorkout = useStructuredRunningWorkout(params.id);

  const sourceWorkout = useMemo(() => {
    const programmeWorkout = programme
      ? getAllWorkouts(programme).find((candidate) => candidate.id === params.id) ?? null
      : null;
    const manualWorkout = manualSessions.find(
      (candidate) => candidate.id === params.id,
    )?.originalWorkout ?? null;
    return programmeWorkout ?? manualWorkout;
  }, [manualSessions, params.id, programme]);

  const workout = sourceWorkout
    ? applyWorkoutOverride(sourceWorkout, overrides[sourceWorkout.id] ?? null)
    : null;
  const log = latestLogForWorkout(logs, params.id);
  const linkedActivityId = Object.values(garmin.activityLinks).find(
    (link) => link.sessionId === params.id,
  )?.activityId;
  const activity =
    garmin.activities.find(
      (record) => record.activity.activityId === linkedActivityId,
    )?.activity ?? null;

  if (!workout) {
    return (
      <section className="tv-card p-5">
        <p className="tv-label">Completed session</p>
        <h1 className="mt-2 text-3xl font-black">Session not found</h1>
        <Link href="/plan" className="tv-button-primary mt-5">Back to plan</Link>
      </section>
    );
  }

  const review = buildSessionReview({
    workout,
    log,
    activity,
    structuredWorkout,
  });
  const running = isRun(workout, activity);
  const completedAt =
    log?.completedAt ??
    activity?.localStartTime ??
    activity?.startTime ??
    workout.date;
  const durationSeconds =
    activity?.durationSeconds ??
    (log?.actualDurationMinutes != null
      ? log.actualDurationMinutes * 60
      : workout.durationMinutes * 60);
  const completedBlocks = (log?.blockResults ?? []).filter(
    (result) => result.status === "done" || resultSummary(result),
  );

  const primaryMetrics = running
    ? [
        { label: "Distance", value: formatDistance(activity?.distanceMeters), icon: Route },
        { label: "Time", value: formatDuration(durationSeconds), icon: Clock3 },
        { label: "Avg pace", value: formatPace(activity?.averagePaceSecondsPerKm), icon: Gauge },
        { label: "Avg HR", value: formatHeartRate(activity?.averageHeartRateBpm), icon: HeartPulse },
        { label: "Max HR", value: formatHeartRate(activity?.maxHeartRateBpm), icon: Activity },
        {
          label: "Climb",
          value: activity?.elevationGainMeters == null ? "—" : `${Math.round(activity.elevationGainMeters)} m`,
          icon: Mountain,
        },
      ]
    : [
        { label: "Time", value: formatDuration(durationSeconds), icon: Clock3 },
        { label: "RPE", value: log ? `${log.rpe}/10` : "—", icon: Gauge },
        { label: "Result", value: log?.score ?? log?.result ?? "Recorded", icon: CheckCircle2 },
        { label: "Outcome", value: log?.sessionFeel ?? "—", icon: Sparkles },
      ];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 pb-24 md:pb-8">
      <header>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Today
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Completed session
            </div>
            <h1 className="mt-2 max-w-4xl text-4xl font-black leading-[0.95] tracking-tight text-[var(--text)] sm:text-6xl">
              {workout.title}
            </h1>
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">{formatDate(completedAt)}</p>
          </div>
          <Link href={`/session/${workout.id}#session-log-form`} className="tv-button-ghost">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit feedback
          </Link>
        </div>
      </header>

      <section className={`grid grid-cols-2 gap-x-3 gap-y-5 rounded-2xl border border-[var(--border)] bg-[rgba(12,16,12,0.72)] p-4 sm:gap-x-0 sm:p-5 ${running ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-4"}`}>
        {primaryMetrics.map((metric) => (
          <SummaryMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            icon={metric.icon}
          />
        ))}
      </section>

      {running && activity ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              label: "Moving time",
              value: formatDuration(activity.movingDurationSeconds),
              icon: Clock3,
            },
            {
              label: "Cadence",
              value: formatCadence(activity.averageCadenceSpm),
              icon: Footprints,
            },
            {
              label: "Calories",
              value: activity.calories == null ? "—" : `${Math.round(activity.calories)} kcal`,
              icon: Flame,
            },
            {
              label: "Training effect",
              value:
                activity.aerobicTrainingEffect == null
                  ? "—"
                  : `${activity.aerobicTrainingEffect.toFixed(1)} aerobic`,
              icon: Activity,
            },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="rounded-xl border border-[var(--border)] bg-black/30 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.62rem] font-black uppercase tracking-[0.13em] text-[var(--muted)]">{metric.label}</p>
                  <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                </div>
                <p className="mt-2 text-lg font-black text-[var(--text)]">{metric.value}</p>
              </article>
            );
          })}
        </section>
      ) : null}

      {running && linkedActivityId ? (
        <RunActivityAnalysis
          key={linkedActivityId}
          activityId={linkedActivityId}
          structuredWorkout={structuredWorkout}
        />
      ) : running ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.72)] p-5">
          <p className="tv-label text-[var(--accent)]">Detailed run analysis</p>
          <h2 className="mt-2 text-2xl font-black">Link the Garmin activity to unlock the trace</h2>
          <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
            Distance and summary data may already be present, but splits and charts require the completed Garmin activity to be matched to this planned session.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[rgba(215,255,47,0.32)] bg-[linear-gradient(145deg,rgba(215,255,47,0.085),rgba(8,10,8,0.84)_55%)] p-5">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em]">Coach read</p>
        </div>
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-[var(--text)]">{review.title}</h2>
            <p className="mt-3 text-sm font-bold leading-relaxed text-[var(--muted)]">{review.summary}</p>
            {review.observations.length > 0 ? (
              <ul className="mt-5 grid gap-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
                {review.observations.slice(0, 4).map((observation) => (
                  <li key={observation} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{observation}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <aside className="border-l-2 border-[var(--accent)] pl-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-[var(--accent)]">What next</p>
            <p className="mt-2 text-sm font-black leading-relaxed text-[var(--text)]">{review.nextAction}</p>
            <Link href="/coach" className="tv-button-primary mt-5 w-full sm:w-fit">Ask Coach about this</Link>
          </aside>
        </div>
      </section>

      {!running && completedBlocks.length > 0 ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,12,10,0.76)] p-4 sm:p-5">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--accent)]">What you completed</p>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {completedBlocks.map((result) => (
              <div key={result.blockKey} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <p className="text-sm font-black text-[var(--text)]">{result.blockName}</p>
                <p className="text-sm font-bold text-[var(--muted)]">{resultSummary(result) || "Completed"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(10,12,10,0.64)] p-4">
        <div className="min-w-0">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">Your feedback</p>
          <p className="mt-1 break-words text-sm font-black text-[var(--text)]">{feedbackLabel(log)}</p>
          {log?.notes ? <p className="mt-1 text-xs font-bold text-[var(--muted)]">{log.notes}</p> : null}
        </div>
        <Link href={`/session/${workout.id}#session-log-form`} className="tv-button-ghost shrink-0">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {log ? "Edit" : "Add feedback"}
        </Link>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/session/${workout.id}`} className="tv-button-ghost">View original workout</Link>
        <Link href="/plan" className="tv-button-ghost">Back to plan</Link>
      </div>
    </div>
  );
}
