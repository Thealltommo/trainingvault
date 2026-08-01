"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Gauge,
  HeartPulse,
  MapPinned,
  Mountain,
  Pencil,
  Route,
  Sparkles,
  Timer,
} from "lucide-react";
import { useManualSessions } from "@/lib/planning-storage";
import {
  useGarminLocalState,
  type GarminActivityLap,
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
import type {
  StructuredRunningStep,
  StructuredRunningWorkout,
} from "@/lib/garmin";
import type { BlockResult, SessionLog, Workout } from "@/lib/types";

type ActivityRoutePoint = {
  lat: number;
  lon: number;
  elevationMeters: number | null;
  distanceMeters: number | null;
  timeMs: number | null;
};

type ActivityRoutePayload = {
  activityId: string;
  points: ActivityRoutePoint[];
};

type ExpandedStep = {
  step: StructuredRunningStep;
  label: string;
};

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
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatMinutes(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "—";
  return formatDuration(minutes * 60);
}

function formatDistance(meters: number | null | undefined, digits = 2) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toFixed(digits)} km`;
}

function formatPace(secondsPerKm: number | null | undefined) {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

function formatHeartRate(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)} bpm`;
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

function expandStructuredSteps(workout: StructuredRunningWorkout | null): ExpandedStep[] {
  if (!workout) return [];
  const expanded: ExpandedStep[] = [];
  let work = 0;
  let recovery = 0;

  const pushStep = (step: StructuredRunningStep) => {
    let label = "Step";
    if (step.phase === "warmup") label = "Warm-up";
    if (step.phase === "cooldown") label = "Cool-down";
    if (step.phase === "work") label = `Rep ${++work}`;
    if (step.phase === "recovery") label = `Recovery ${++recovery}`;
    expanded.push({ step, label });
  };

  for (const element of workout.steps) {
    if (element.kind === "step") {
      pushStep(element);
      continue;
    }

    for (let repetition = 0; repetition < element.repetitions; repetition += 1) {
      for (const step of element.steps) pushStep(step);
    }
  }

  return expanded;
}

function targetPace(step: StructuredRunningStep | undefined) {
  if (!step || step.target.type !== "pace") return null;
  return {
    fastest: step.target.fastestSecondsPerKm,
    slowest: step.target.slowestSecondsPerKm,
    label: `${formatPace(step.target.fastestSecondsPerKm).replace("/km", "")}–${formatPace(step.target.slowestSecondsPerKm)}`,
  };
}

function targetStatus(lap: GarminActivityLap, step: StructuredRunningStep | undefined) {
  const target = targetPace(step);
  const pace = lap.averagePaceSecondsPerKm;
  if (!target || pace == null) return null;
  if (pace < target.fastest) return `${Math.round(target.fastest - pace)}s fast`;
  if (pace > target.slowest) return `${Math.round(pace - target.slowest)}s slow`;
  return "On target";
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

function RouteMap({ activityId }: { activityId: string }) {
  const [route, setRoute] = useState<ActivityRoutePayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void fetch(`/api/garmin/activities/${encodeURIComponent(activityId)}/route`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("route unavailable");
        return (await response.json()) as ActivityRoutePayload;
      })
      .then((value) => {
        if (!Array.isArray(value.points) || value.points.length < 2) {
          setState("empty");
          return;
        }
        setRoute(value);
        setState("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("empty");
      });
    return () => controller.abort();
  }, [activityId]);

  const drawing = useMemo(() => {
    if (!route || route.points.length < 2) return null;
    const width = 760;
    const height = 390;
    const padding = 26;
    const averageLat = route.points.reduce((total, point) => total + point.lat, 0) / route.points.length;
    const lonScale = Math.max(0.2, Math.cos((averageLat * Math.PI) / 180));
    const xs = route.points.map((point) => point.lon * lonScale);
    const ys = route.points.map((point) => point.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(0.000001, maxX - minX);
    const spanY = Math.max(0.000001, maxY - minY);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const projected = route.points.map((point, index) => ({
      x: offsetX + (xs[index] - minX) * scale,
      y: height - (offsetY + (point.lat - minY) * scale),
      elevation: point.elevationMeters,
    }));
    const elevations = projected
      .map((point) => point.elevation)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const minElevation = elevations.length ? Math.min(...elevations) : null;
    const maxElevation = elevations.length ? Math.max(...elevations) : null;
    const elevationPath =
      minElevation == null || maxElevation == null
        ? null
        : projected
            .map((point, index) => {
              const value = point.elevation ?? minElevation;
              const x = (index / Math.max(1, projected.length - 1)) * width;
              const ratio = (value - minElevation) / Math.max(1, maxElevation - minElevation);
              const y = 78 - ratio * 58;
              return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
    return {
      width,
      height,
      polyline: projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      start: projected[0],
      finish: projected[projected.length - 1],
      elevationPath,
      minElevation,
      maxElevation,
    };
  }, [route]);

  if (state === "loading") {
    return <div className="grid min-h-64 place-items-center text-sm font-bold text-[var(--muted)]">Loading route…</div>;
  }

  if (state === "empty" || !drawing) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#090c09]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Route</p>
          <p className="mt-1 text-sm font-bold text-[var(--text)]">Private Garmin GPS trace</p>
        </div>
        <MapPinned className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="relative min-h-64 overflow-hidden bg-[radial-gradient(circle_at_70%_30%,rgba(215,255,47,0.10),transparent_36%),linear-gradient(145deg,#0b100b,#070807)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:34px_34px]" />
        <svg viewBox={`0 0 ${drawing.width} ${drawing.height}`} className="relative h-full min-h-64 w-full p-4" role="img" aria-label="Recorded activity route">
          <polyline points={drawing.polyline} fill="none" stroke="rgba(215,255,47,0.18)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={drawing.polyline} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={drawing.start.x} cy={drawing.start.y} r="8" fill="#070807" stroke="var(--accent)" strokeWidth="4" />
          <circle cx={drawing.finish.x} cy={drawing.finish.y} r="8" fill="var(--accent)" stroke="#070807" strokeWidth="4" />
        </svg>
      </div>
      {drawing.elevationPath ? (
        <div className="border-t border-[var(--border)] px-4 pb-3 pt-2">
          <div className="flex items-center justify-between text-[0.65rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>Elevation profile</span>
            <span>{Math.round(drawing.minElevation ?? 0)}–{Math.round(drawing.maxElevation ?? 0)} m</span>
          </div>
          <svg viewBox="0 0 760 88" className="mt-2 h-16 w-full" aria-hidden="true">
            <path d={`${drawing.elevationPath} L760,88 L0,88 Z`} fill="rgba(215,255,47,0.08)" />
            <path d={drawing.elevationPath} fill="none" stroke="var(--accent)" strokeWidth="3" />
          </svg>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Timer }) {
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
    const manualWorkout = manualSessions.find((candidate) => candidate.id === params.id)?.originalWorkout ?? null;
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
    garmin.activities.find((record) => record.activity.activityId === linkedActivityId)?.activity ?? null;

  if (!workout) {
    return (
      <section className="tv-card p-5">
        <p className="tv-label">Completed session</p>
        <h1 className="mt-2 text-3xl font-black">Session not found</h1>
        <Link href="/plan" className="tv-button-primary mt-5">Back to plan</Link>
      </section>
    );
  }

  const review = buildSessionReview({ workout, log, activity, structuredWorkout });
  const running = isRun(workout, activity);
  const completedAt = log?.completedAt ?? activity?.localStartTime ?? activity?.startTime ?? workout.date;
  const durationSeconds =
    activity?.durationSeconds ??
    (log?.actualDurationMinutes != null ? log.actualDurationMinutes * 60 : workout.durationMinutes * 60);
  const expandedSteps = expandStructuredSteps(structuredWorkout);
  const laps = activity?.laps ?? [];
  const mappedSteps = laps.length === expandedSteps.length ? expandedSteps : [];
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
        { label: "Climb", value: activity?.elevationGainMeters == null ? "—" : `${Math.round(activity.elevationGainMeters)} m`, icon: Mountain },
      ]
    : [
        { label: "Time", value: formatDuration(durationSeconds), icon: Clock3 },
        { label: "RPE", value: log ? `${log.rpe}/10` : "—", icon: Gauge },
        { label: "Result", value: log?.score ?? log?.result ?? "Recorded", icon: CheckCircle2 },
        { label: "Outcome", value: log?.sessionFeel ?? "—", icon: Sparkles },
      ];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-24 md:pb-8">
      <header>
        <Link href="/" className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--accent)]">
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
          <div className="flex gap-2">
            <Link href={`/session/${workout.id}#session-log-form`} className="tv-button-ghost">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit feedback
            </Link>
          </div>
        </div>
      </header>

      <section className={`grid grid-cols-2 gap-x-3 gap-y-5 rounded-2xl border border-[var(--border)] bg-[rgba(12,16,12,0.72)] p-4 sm:grid-cols-${running ? "6" : "4"} sm:gap-x-0 sm:p-5`}>
        {primaryMetrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} />
        ))}
      </section>

      <div className={running && linkedActivityId ? "grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]" : "grid gap-5"}>
        {running && linkedActivityId ? <RouteMap activityId={linkedActivityId} /> : null}

        <section className="rounded-2xl border border-[rgba(215,255,47,0.32)] bg-[linear-gradient(145deg,rgba(215,255,47,0.085),rgba(8,10,8,0.84)_55%)] p-5">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em]">Coach read</p>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)]">{review.title}</h2>
          <p className="mt-3 text-sm font-bold leading-relaxed text-[var(--muted)]">{review.summary}</p>
          <div className="mt-5 border-l-2 border-[var(--accent)] pl-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-[var(--accent)]">What next</p>
            <p className="mt-2 text-sm font-black leading-relaxed text-[var(--text)]">{review.nextAction}</p>
          </div>
          {review.observations.length > 0 ? (
            <ul className="mt-5 grid gap-2 text-xs font-bold leading-relaxed text-[var(--muted)]">
              {review.observations.slice(0, 3).map((observation) => (
                <li key={observation} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{observation}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/coach" className="tv-button-primary mt-5 w-full sm:w-fit">Ask Coach about this</Link>
        </section>
      </div>

      {running && laps.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,12,10,0.76)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--accent)]">Workout analysis</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--text)]">Intervals and laps</h2>
            </div>
            <p className="text-xs font-bold text-[var(--muted)]">{mappedSteps.length ? "Matched to the structured workout" : `${laps.length} Garmin laps`}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border)] text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  <th className="px-4 py-3 sm:px-5">Step</th>
                  <th className="px-3 py-3">Distance</th>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Pace</th>
                  <th className="px-3 py-3">Avg HR</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-4 py-3 sm:px-5">Read</th>
                </tr>
              </thead>
              <tbody>
                {laps.map((lap, index) => {
                  const matched = mappedSteps[index];
                  const status = targetStatus(lap, matched?.step);
                  const work = matched?.step.phase === "work";
                  return (
                    <tr key={`${lap.lapIndex ?? index}-${index}`} className={`border-b border-[var(--border)] last:border-b-0 ${work ? "bg-[rgba(215,255,47,0.045)]" : ""}`}>
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-2">
                          {work ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                          <span className="text-sm font-black text-[var(--text)]">{matched?.label ?? `Lap ${lap.lapIndex ?? index + 1}`}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatDistance(lap.distanceMeters, 2)}</td>
                      <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatDuration(lap.durationSeconds)}</td>
                      <td className="px-3 py-3 text-sm font-black text-[var(--text)]">{formatPace(lap.averagePaceSecondsPerKm)}</td>
                      <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatHeartRate(lap.averageHeartRateBpm)}</td>
                      <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{targetPace(matched?.step)?.label ?? "—"}</td>
                      <td className={`px-4 py-3 text-xs font-black uppercase sm:px-5 ${status === "On target" ? "text-[var(--accent)]" : status ? "text-amber-200" : "text-[var(--muted)]"}`}>{status ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
