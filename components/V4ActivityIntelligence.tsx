"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Brain,
  CalendarDays,
  Gauge,
  HeartPulse,
  Medal,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import type { GarminActivity, StructuredRunningWorkout } from "@/lib/garmin";
import { useGarminLocalState } from "@/lib/garmin-storage";
import type { ActivityAnalysisPayload } from "@/lib/run-activity-analysis";
import { useSessionLogs } from "@/lib/storage";
import {
  activityCoachRead,
  buildBestEfforts,
  buildIntervalIntelligence,
  buildRacePredictions,
  classifyRunRole,
  findComparableRuns,
  type BestEffort,
  type ComparableRun,
  type RacePrediction,
} from "@/lib/v4-intelligence";

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPace(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(parsed);
}

function formatRange(prediction: RacePrediction) {
  return `${formatDuration(prediction.lowerSeconds)}–${formatDuration(prediction.upperSeconds)}`;
}

function effortTone(effort: BestEffort) {
  if (effort.key === "5k") return "border-cyan-300/25 bg-cyan-300/[0.055]";
  if (effort.key === "1k") return "border-[rgba(215,255,47,0.28)] bg-[rgba(215,255,47,0.055)]";
  if (effort.key === "1mi" || effort.key === "2mi") {
    return "border-violet-300/20 bg-violet-300/[0.045]";
  }
  return "border-white/[0.08] bg-white/[0.025]";
}

function EffortGrid({ efforts }: { efforts: BestEffort[] }) {
  const visible = efforts.filter((effort) => effort.durationSeconds != null);
  if (visible.length === 0) return null;

  return (
    <section className="rounded-[1.7rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(18,23,19,0.92),rgba(7,9,7,0.95))] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            Best efforts
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            Fastest continuous work
          </h3>
        </div>
        <Medal className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {visible.map((effort) => (
          <article
            key={effort.key}
            className={`rounded-2xl border p-3.5 ${effortTone(effort)}`}
          >
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              {effort.label}
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight">
              {formatDuration(effort.durationSeconds)}
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--quiet)]">
              {formatPace((effort.durationSeconds ?? 0) / (effort.distanceMeters / 1_000))}
            </p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold leading-relaxed text-[var(--quiet)]">
        Calculated from the recorded distance-and-time stream. Recovery pauses remain part of any effort window they overlap.
      </p>
    </section>
  );
}

function PredictionCard({ predictions }: { predictions: RacePrediction[] }) {
  if (predictions.length === 0) return null;
  return (
    <section className="rounded-[1.7rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(18,23,19,0.96),rgba(7,9,7,0.98))] p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            Performance range
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">What this evidence supports</h3>
        </div>
        <Trophy className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {predictions.map((prediction) => (
          <article
            key={prediction.distance}
            className="rounded-2xl border border-white/[0.075] bg-black/25 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black">{prediction.distance}</p>
              <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[0.55rem] font-black uppercase tracking-[0.12em] text-[var(--quiet)]">
                {prediction.confidence}
              </span>
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight text-[var(--text)]">
              {formatRange(prediction)}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--quiet)]">
              From {prediction.source}; training estimate, not a race guarantee.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MatchedRuns({
  current,
  runs,
}: {
  current: GarminActivity;
  runs: ComparableRun[];
}) {
  if (runs.length === 0 || current.averagePaceSecondsPerKm == null) return null;
  const comparisonAverage =
    runs.reduce((total, run) => total + run.averagePaceSecondsPerKm, 0) /
    runs.length;
  const delta = current.averagePaceSecondsPerKm - comparisonAverage;
  const trendingFaster = delta < -2;
  const steady = Math.abs(delta) <= 2;
  const TrendIcon = steady ? ArrowRight : trendingFaster ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="rounded-[1.7rem] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(18,23,19,0.94),rgba(7,9,7,0.98))] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            Matched runs
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            {steady ? "Holding the line" : trendingFaster ? "Trending faster" : "This one cost more time"}
          </h3>
          <p className="mt-2 text-sm font-semibold text-[var(--quiet)]">
            Current {formatPace(current.averagePaceSecondsPerKm)} · matched average {formatPace(comparisonAverage)}
          </p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-full border border-[rgba(215,255,47,0.2)] bg-[rgba(215,255,47,0.06)] text-[var(--accent)]">
          <TrendIcon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-5 grid gap-2">
        {runs.slice(0, 4).map((run) => (
          <Link
            key={run.activityId}
            href={`/activity/${run.activityId}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-white/[0.065] bg-black/20 px-4 py-3 transition hover:border-[rgba(215,255,47,0.28)]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{run.title}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--quiet)]">
                {formatDate(run.startTime)} · {(run.distanceMeters / 1_000).toFixed(2)} km · {run.averageHeartRateBpm == null ? "HR —" : `${Math.round(run.averageHeartRateBpm)} bpm`}
              </p>
            </div>
            <p className="text-sm font-black text-[var(--text)]">
              {formatPace(run.averagePaceSecondsPerKm)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function V4ActivityIntelligence({
  activity,
  activityId,
  sessionId,
  structuredWorkout,
}: {
  activity: GarminActivity;
  activityId: string;
  sessionId: string | null;
  structuredWorkout: StructuredRunningWorkout | null;
}) {
  const garmin = useGarminLocalState();
  const logs = useSessionLogs();
  const [analysis, setAnalysis] = useState<ActivityAnalysisPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/garmin/activities/${encodeURIComponent(activityId)}/route`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Activity intelligence unavailable");
        return (await response.json()) as ActivityAnalysisPayload;
      })
      .then((payload) => {
        setAnalysis(payload);
        setStatus(payload.samples.length || payload.splits.length ? "ready" : "empty");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("empty");
      });
    return () => controller.abort();
  }, [activityId]);

  const role = classifyRunRole(activity.title, structuredWorkout);
  const efforts = useMemo(
    () => buildBestEfforts(analysis?.samples ?? []),
    [analysis?.samples],
  );
  const interval = useMemo(
    () => buildIntervalIntelligence(analysis?.splits ?? [], structuredWorkout),
    [analysis?.splits, structuredWorkout],
  );
  const predictions = useMemo(
    () => buildRacePredictions(efforts, activity),
    [activity, efforts],
  );
  const comparable = useMemo(
    () =>
      findComparableRuns(
        activity,
        garmin.activities.map((record) => record.activity),
      ),
    [activity, garmin.activities],
  );
  const feedback = sessionId
    ? logs
        .filter((log) => log.workoutId === sessionId)
        .sort((first, second) => second.completedAt.localeCompare(first.completedAt))[0]
    : null;

  const heartRateDrift = useMemo(() => {
    const samples = analysis?.samples ?? [];
    const withDistance = samples.filter(
      (sample) => sample.distanceMeters != null && sample.heartRateBpm != null,
    );
    const total = withDistance.at(-1)?.distanceMeters ?? 0;
    if (withDistance.length < 6 || total <= 0) return null;
    const first = withDistance.filter((sample) => (sample.distanceMeters ?? 0) <= total / 2);
    const second = withDistance.filter((sample) => (sample.distanceMeters ?? 0) > total / 2);
    const firstAverage = first.reduce((sum, sample) => sum + (sample.heartRateBpm ?? 0), 0) / first.length;
    const secondAverage = second.reduce((sum, sample) => sum + (sample.heartRateBpm ?? 0), 0) / second.length;
    return firstAverage > 0 ? ((secondAverage - firstAverage) / firstAverage) * 100 : null;
  }, [analysis?.samples]);

  const read = activityCoachRead({
    role,
    interval,
    aerobicTrainingEffect: activity.aerobicTrainingEffect,
    anaerobicTrainingEffect: activity.anaerobicTrainingEffect,
    heartRateDriftPercent: heartRateDrift,
    linkedToPlan: Boolean(sessionId),
  });

  return (
    <div className="grid gap-4 sm:gap-5">
      <section className="overflow-hidden rounded-[2rem] border border-[rgba(215,255,47,0.18)] bg-[radial-gradient(circle_at_88%_8%,rgba(215,255,47,0.12),transparent_30%),linear-gradient(145deg,#121812,#070907_68%)] shadow-[0_35px_110px_rgba(0,0,0,0.36)]">
        <div className="grid gap-0 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <p className="text-[0.66rem] font-black uppercase tracking-[0.18em]">
                Athlete intelligence · {role}
              </p>
            </div>
            <h2 className="mt-5 max-w-3xl text-3xl font-black leading-[1.02] tracking-[-0.035em] sm:text-5xl">
              {read.title}
            </h2>
            <p className="mt-4 max-w-3xl text-base font-semibold leading-relaxed text-[var(--muted)]">
              {read.body}
            </p>
            <div className="mt-6 rounded-2xl border border-white/[0.075] bg-black/25 p-4">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[var(--quiet)]">
                Next training decision
              </p>
              <p className="mt-2 text-base font-black leading-relaxed text-[var(--text)]">
                {read.next}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-white/[0.07] bg-black/20 lg:border-l lg:border-t-0">
            {[
              {
                label: "Work reps",
                value: interval ? String(interval.workCount) : "—",
                detail: interval?.targetCount
                  ? `${interval.onTargetCount}/${interval.targetCount} on target`
                  : "No structured scoring",
                icon: Zap,
              },
              {
                label: "Work pace",
                value: formatPace(interval?.averageWorkPaceSecondsPerKm),
                detail: interval?.paceVariationPercent == null
                  ? "Awaiting intervals"
                  : `${interval.paceVariationPercent.toFixed(1)}% variation`,
                icon: Gauge,
              },
              {
                label: "HR drift",
                value:
                  heartRateDrift == null
                    ? "—"
                    : `${heartRateDrift > 0 ? "+" : ""}${heartRateDrift.toFixed(1)}%`,
                detail: "first half → second half",
                icon: HeartPulse,
              },
              {
                label: "Athlete RPE",
                value: feedback ? `${feedback.rpe}/10` : "—",
                detail: feedback?.sessionFeel
                  ? feedback.sessionFeel.replaceAll("_", " ")
                  : "Add subjective context",
                icon: Brain,
              },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <article
                  key={metric.label}
                  className="min-h-36 border-b border-r border-white/[0.065] p-4 last:border-b-0 sm:p-5"
                >
                  <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                  <p className="mt-4 text-[0.59rem] font-black uppercase tracking-[0.15em] text-[var(--quiet)]">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-xl font-black tracking-tight sm:text-2xl">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs font-semibold capitalize text-[var(--quiet)]">
                    {metric.detail}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {status === "loading" ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="h-52 animate-pulse rounded-[1.7rem] bg-white/[0.04]" />
          <div className="h-52 animate-pulse rounded-[1.7rem] bg-white/[0.04]" />
        </section>
      ) : null}

      {status === "ready" ? <EffortGrid efforts={efforts} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {status === "ready" ? <MatchedRuns current={activity} runs={comparable} /> : null}
        {status === "ready" ? <PredictionCard predictions={predictions} /> : null}
      </div>

      <section className="grid gap-3 rounded-[1.7rem] border border-white/[0.08] bg-[rgba(10,13,10,0.78)] p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[rgba(215,255,47,0.18)] bg-[rgba(215,255,47,0.055)] text-[var(--accent)]">
            {feedback ? <BadgeCheck className="h-5 w-5" /> : <Target className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[var(--quiet)]">
              {feedback ? "Athlete feedback joined" : "Complete the evidence"}
            </p>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--text)]">
              {feedback
                ? `${feedback.execution?.replaceAll("_", " ") ?? "Completed"} · ${feedback.sessionFeel?.replaceAll("_", " ") ?? "feel not recorded"}${feedback.limiter ? ` · limiter: ${feedback.limiter}` : ""}`
                : "Garmin tells TrainVault what happened. Your RPE, feel and limiter explain what it cost."}
            </p>
          </div>
        </div>
        {sessionId ? (
          <Link href={`/session/${sessionId}/review`} className="tv-button-ghost w-full sm:w-auto">
            <Activity className="h-4 w-4" aria-hidden="true" />
            {feedback ? "Edit feedback" : "Add feedback"}
          </Link>
        ) : (
          <Link href="/log" className="tv-button-ghost w-full sm:w-auto">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Link to plan
          </Link>
        )}
      </section>
    </div>
  );
}
