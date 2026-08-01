"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Clock3,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Link2,
  Route,
  Sparkles,
} from "lucide-react";
import RunActivityAnalysis from "@/components/RunActivityAnalysis";
import { useGarminLocalState } from "@/lib/garmin-storage";
import { useManualSessions } from "@/lib/planning-storage";
import { useStructuredRunningWorkout } from "@/lib/structured-running-storage";
import { getAllWorkouts, useActiveProgrammeOptional } from "@/lib/storage";

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPace(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function datePart(value: string | null | undefined) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function activityTypeLabel(value: string | null | undefined) {
  return (value ?? "Garmin activity")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isRunningActivity(value: string | null | undefined) {
  const signal = value?.toLowerCase() ?? "";
  return signal.includes("run") || signal.includes("jog");
}

function coachRead(input: {
  activityType: string | null;
  aerobicTrainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  linked: boolean;
}) {
  const aerobic = input.aerobicTrainingEffect ?? 0;
  const anaerobic = input.anaerobicTrainingEffect ?? 0;
  const treadmill = input.activityType.toLowerCase().includes("treadmill");

  if (aerobic >= 4.5 || anaerobic >= 3.5) {
    return {
      title: "High-cost quality work",
      body: "This was a substantial stimulus. Protect the next hard session until recovery confirms the load has been absorbed.",
    };
  }

  if (treadmill && aerobic >= 3) {
    return {
      title: "Threshold stimulus landed",
      body: input.linked
        ? "The session is tied to its prescription, so the interval tab can now judge the work reps against their pace targets rather than treating 5:31/km as one blended average."
        : "The aerobic effect supports a productive tempo session. Link it to the planned workout to add target-versus-actual rep analysis.",
    };
  }

  if (
    input.averageHeartRateBpm != null &&
    input.maxHeartRateBpm != null &&
    input.maxHeartRateBpm - input.averageHeartRateBpm <= 12
  ) {
    return {
      title: "Sustained cardiovascular load",
      body: "Average and maximum heart rate stayed relatively close, suggesting prolonged work rather than a few isolated spikes. Use the interval and chart views to check whether that load was controlled across the session.",
    };
  }

  return {
    title: "Evidence captured",
    body: "The useful answer now lives in the splits, interval execution and physiological trace below—not in the headline average alone.",
  };
}

function Metric({
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
        <span className="text-[0.6rem] font-black uppercase tracking-[0.13em]">
          {label}
        </span>
      </div>
      <p className="mt-1 truncate text-lg font-black tracking-tight text-[var(--text)] sm:text-xl">
        {value}
      </p>
    </div>
  );
}

export default function GarminActivityReviewPage() {
  const params = useParams<{ activityId: string }>();
  const garmin = useGarminLocalState();
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();

  const record = garmin.activities.find(
    (candidate) => candidate.activity.activityId === params.activityId,
  );
  const activity = record?.activity ?? null;
  const explicitLink = garmin.activityLinks[params.activityId] ?? null;

  const programmeSessions = useMemo(
    () => (programme ? getAllWorkouts(programme) : []),
    [programme],
  );

  const activityDate = datePart(
    activity?.localStartTime ?? activity?.startTime,
  );
  const exactLocalCandidates = activity
    ? [
        ...manualSessions.map((session) => ({
          id: session.id,
          title: session.originalWorkout.title,
          date: session.scheduledDate,
        })),
        ...programmeSessions.map((workout) => ({
          id: workout.id,
          title: workout.title,
          date: workout.date,
        })),
      ].filter(
        (session) =>
          session.date === activityDate &&
          normalizeTitle(session.title) === normalizeTitle(activity.title),
      )
    : [];

  const matchCandidateId =
    record?.match.kind && record.match.kind !== "none"
      ? record.match.candidate.sessionId
      : null;
  const inferredSessionId =
    exactLocalCandidates.length === 1 ? exactLocalCandidates[0].id : null;
  const sessionId =
    explicitLink?.sessionId ?? matchCandidateId ?? inferredSessionId;
  const structuredWorkout = useStructuredRunningWorkout(
    sessionId ?? "__unlinked_activity__",
  );

  if (!activity || !record) {
    return (
      <section className="tv-card mx-auto max-w-3xl p-5">
        <p className="tv-label">Garmin activity</p>
        <h1 className="mt-2 text-3xl font-black">Activity not found</h1>
        <p className="mt-2 text-sm font-bold text-[var(--muted)]">
          Sync Garmin again, then reopen the activity from Today or Log.
        </p>
        <Link href="/log" className="tv-button-primary mt-5">
          Back to Log
        </Link>
      </section>
    );
  }

  const linked = Boolean(sessionId);
  const running = isRunningActivity(activity.activityType);
  const read = coachRead({
    activityType: activity.activityType ?? "",
    aerobicTrainingEffect: activity.aerobicTrainingEffect,
    anaerobicTrainingEffect: activity.anaerobicTrainingEffect,
    averageHeartRateBpm: activity.averageHeartRateBpm,
    maxHeartRateBpm: activity.maxHeartRateBpm,
    linked,
  });

  const metrics = [
    {
      label: "Distance",
      value:
        activity.distanceMeters == null
          ? "—"
          : `${(activity.distanceMeters / 1_000).toFixed(2)} km`,
      icon: Route,
    },
    {
      label: "Time",
      value: formatDuration(activity.durationSeconds),
      icon: Clock3,
    },
    {
      label: "Avg pace",
      value: formatPace(activity.averagePaceSecondsPerKm),
      icon: Gauge,
    },
    {
      label: "Avg HR",
      value:
        activity.averageHeartRateBpm == null
          ? "—"
          : `${Math.round(activity.averageHeartRateBpm)} bpm`,
      icon: HeartPulse,
    },
    {
      label: "Max HR",
      value:
        activity.maxHeartRateBpm == null
          ? "—"
          : `${Math.round(activity.maxHeartRateBpm)} bpm`,
      icon: Activity,
    },
    {
      label: "Cadence",
      value:
        activity.averageCadenceSpm == null
          ? "—"
          : `${Math.round(activity.averageCadenceSpm)} spm`,
      icon: Footprints,
    },
  ];

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 pb-24 md:pb-8">
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
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              {activityTypeLabel(activity.activityType)}
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-black leading-[0.95] tracking-tight text-[var(--text)] sm:text-6xl">
              {activity.title ?? "Completed activity"}
            </h1>
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">
              {formatDate(activity.localStartTime ?? activity.startTime)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-[0.62rem] font-black uppercase tracking-[0.1em] ${
                linked
                  ? "border-[rgba(215,255,47,0.45)] bg-[rgba(215,255,47,0.08)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-black/30 text-[var(--muted)]"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {explicitLink
                ? "Linked to plan"
                : inferredSessionId
                  ? "Plan match inferred"
                  : "Garmin activity"}
            </span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-3 gap-y-5 rounded-2xl border border-[var(--border)] bg-[rgba(12,16,12,0.72)] p-4 sm:grid-cols-3 sm:gap-x-0 sm:p-5 xl:grid-cols-6">
        {metrics.map((metric) => (
          <Metric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            icon={metric.icon}
          />
        ))}
      </section>

      {running ? (
        <RunActivityAnalysis
          activityId={params.activityId}
          structuredWorkout={structuredWorkout}
        />
      ) : (
        <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.72)] p-5">
          <p className="tv-label text-[var(--accent)]">Activity analysis</p>
          <h2 className="mt-2 text-2xl font-black">
            Detailed analysis for this activity type is still being built
          </h2>
          <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
            The Garmin summary is retained above. Running currently has the
            deepest splits, intervals and chart workspace.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-[rgba(215,255,47,0.30)] bg-[linear-gradient(145deg,rgba(215,255,47,0.075),rgba(8,10,8,0.84)_58%)] p-5">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em]">
            Coach read
          </p>
        </div>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)]">
          {read.title}
        </h2>
        <p className="mt-2 max-w-4xl text-sm font-bold leading-relaxed text-[var(--muted)]">
          {read.body}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/coach" className="tv-button-primary">
            Ask Coach about this
          </Link>
          {sessionId ? (
            <Link
              href={`/session/${sessionId}/review`}
              className="tv-button-ghost"
            >
              Review against plan
            </Link>
          ) : (
            <Link href="/log" className="tv-button-ghost">
              Match to a planned run
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Moving",
            value: formatDuration(activity.movingDurationSeconds),
            icon: Clock3,
          },
          {
            label: "Calories",
            value:
              activity.calories == null
                ? "—"
                : `${Math.round(activity.calories)} kcal`,
            icon: Flame,
          },
          {
            label: "Aerobic TE",
            value:
              activity.aerobicTrainingEffect == null
                ? "—"
                : activity.aerobicTrainingEffect.toFixed(1),
            icon: Activity,
          },
          {
            label: "Anaerobic TE",
            value:
              activity.anaerobicTrainingEffect == null
                ? "—"
                : activity.anaerobicTrainingEffect.toFixed(1),
            icon: Gauge,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="rounded-xl border border-[var(--border)] bg-black/25 p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  {metric.label}
                </p>
                <Icon
                  className="h-4 w-4 text-[var(--accent)]"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-lg font-black text-[var(--text)]">
                {metric.value}
              </p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
