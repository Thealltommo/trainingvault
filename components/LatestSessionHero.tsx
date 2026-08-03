"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  MapPinned,
  Mountain,
  Route,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import {
  useGarminLocalState,
  type GarminStoredActivity,
} from "@/lib/garmin-storage";
import { useSessionLogs } from "@/lib/storage";
import type { SessionLog } from "@/lib/types";

type RoutePoint = {
  lat: number;
  lon: number;
  elevationMeters: number | null;
  distanceMeters: number | null;
  timeMs: number | null;
};

type RouteResponse = {
  activityId: string;
  points: RoutePoint[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
};

type RouteState = {
  activityId: string | null;
  status: "idle" | "loading" | "ready" | "empty";
  route: RouteResponse | null;
};

type LatestEvidence = {
  record: GarminStoredActivity | null;
  log: SessionLog | null;
  sessionId: string | null;
  timestamp: number;
};

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function datePart(value: string | null | undefined) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titlesDescribeSameSession(
  activityTitle: string | null,
  workoutTitle: string,
) {
  const activity = normalizeTitle(activityTitle);
  const workout = normalizeTitle(workoutTitle);

  if (!activity || !workout) return false;
  if (activity === workout) return true;
  if (Math.min(activity.length, workout.length) < 8) return false;
  return activity.includes(workout) || workout.includes(activity);
}

function durationIsCompatible(
  record: GarminStoredActivity,
  log: SessionLog,
) {
  const actualSeconds = record.activity.durationSeconds;
  const loggedMinutes = log.actualDurationMinutes;

  if (!actualSeconds || !loggedMinutes) return true;
  return Math.abs(actualSeconds / 60 - loggedMinutes) / loggedMinutes <= 0.25;
}

function activityTimestamp(record: GarminStoredActivity) {
  const start = timestamp(
    record.activity.localStartTime ??
      record.activity.startTime ??
      record.importedAt,
  );
  return start + Math.max(0, record.activity.durationSeconds ?? 0) * 1_000;
}

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

function formatPace(secondsPerKm: number | null | undefined) {
  if (
    secondsPerKm == null ||
    !Number.isFinite(secondsPerKm) ||
    secondsPerKm <= 0
  ) {
    return "—";
  }
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Latest evidence";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Latest evidence";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function activityLabel(value: string | null | undefined) {
  if (!value) return "Activity";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isOutdoorGpsCandidate(record: GarminStoredActivity | null) {
  const type = record?.activity.activityType?.toLowerCase() ?? "";
  if (/(treadmill|indoor|virtual)/.test(type)) return false;
  return /(run|trail|hike|walk|cycling|bike)/.test(type);
}

function isRunning(record: GarminStoredActivity | null) {
  const type = record?.activity.activityType?.toLowerCase() ?? "";
  return type.includes("run") || type.includes("jog");
}

function coachRead(record: GarminStoredActivity | null, log: SessionLog | null) {
  if (record) {
    const activity = record.activity;
    const type = activity.activityType?.toLowerCase() ?? "";
    const aerobic = activity.aerobicTrainingEffect ?? 0;
    const anaerobic = activity.anaerobicTrainingEffect ?? 0;

    if (log?.rpe && log.rpe >= 8) {
      return "Garmin confirms the work, and your feedback says the cost was high. Protect the next hard session until recovery supports it.";
    }
    if (aerobic >= 4 || anaerobic >= 3.5) {
      return "A meaningful training hit. Use the interval and chart views to check whether the cost came from the intended work or from pace drift and recovery breakdown.";
    }
    if (type.includes("treadmill") && aerobic >= 3) {
      return "A productive indoor quality session. The useful answer is in the work-rep pace and heart-rate trace, not the blended session average.";
    }
    if (/(trail|hike)/.test(type) && (activity.elevationGainMeters ?? 0) >= 500) {
      return "The vertical load matters as much as distance here. Review the route, elevation and heart-rate response before placing the next quality session.";
    }
    if (isRunning(record)) {
      return "Garmin evidence and your athlete feedback now describe one session. Review the route, splits, heart rate and training effect before the next decision.";
    }
    return "This session is now part of the athlete history. Its value comes from how it changes the next decision, not from another isolated score.";
  }

  if (log) {
    if (log.rpe >= 8) {
      return "High subjective cost. Treat the next hard session as conditional until the morning recovery check supports it.";
    }
    if (log.limiter) {
      return `You logged ${log.limiter} as the limiter. Keep that visible when the next session is adapted.`;
    }
    return "The session is logged. Garmin evidence will be merged into this record automatically when the watch activity arrives.";
  }

  return "Complete a session or sync Garmin to unlock the latest-session review.";
}

function samplePoints<T>(points: T[], maximum = 480) {
  if (points.length <= maximum) return points;
  const stride = Math.ceil(points.length / maximum);
  return points.filter(
    (_, index) => index % stride === 0 || index === points.length - 1,
  );
}

function RouteTrace({ route }: { route: RouteResponse }) {
  const geometry = useMemo(() => {
    if (route.points.length < 2 || !route.bounds) return null;
    const width = 840;
    const height = 360;
    const padding = 38;
    const averageLat =
      route.points.reduce((total, point) => total + point.lat, 0) /
      route.points.length;
    const lonScale = Math.max(0.2, Math.cos((averageLat * Math.PI) / 180));
    const points = samplePoints(route.points).map((point) => ({
      x: point.lon * lonScale,
      y: point.lat,
    }));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const spanX = Math.max(0.000001, maxX - minX);
    const spanY = Math.max(0.000001, maxY - minY);
    const scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const projected = points.map((point) => ({
      x: offsetX + (point.x - minX) * scale,
      y: height - (offsetY + (point.y - minY) * scale),
    }));
    return {
      width,
      height,
      path: projected
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
        )
        .join(" "),
      start: projected[0],
      finish: projected.at(-1)!,
    };
  }, [route]);

  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="h-72 w-full sm:h-80"
      role="img"
      aria-label="Private GPS route trace"
    >
      <path
        d={geometry.path}
        fill="none"
        stroke="rgba(215,255,47,0.14)"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={geometry.path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={geometry.start.x}
        cy={geometry.start.y}
        r="8"
        fill="#071007"
        stroke="var(--accent)"
        strokeWidth="4"
      />
      <circle
        cx={geometry.finish.x}
        cy={geometry.finish.y}
        r="8"
        fill="var(--accent)"
        stroke="#071007"
        strokeWidth="4"
      />
    </svg>
  );
}

function PerformancePanel({
  record,
  reviewHref,
  reason,
}: {
  record: GarminStoredActivity;
  reviewHref: string;
  reason: "indoor" | "no-route";
}) {
  const activity = record.activity;
  const metrics = [
    {
      label: "Moving",
      value: formatDuration(activity.movingDurationSeconds),
      icon: Timer,
    },
    {
      label: "Max HR",
      value:
        activity.maxHeartRateBpm == null
          ? "—"
          : `${Math.round(activity.maxHeartRateBpm)} bpm`,
      icon: HeartPulse,
    },
    {
      label: "Cadence",
      value:
        activity.averageCadenceSpm == null
          ? "—"
          : `${Math.round(activity.averageCadenceSpm)} spm`,
      icon: Footprints,
    },
    {
      label: "Energy",
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
      icon: Zap,
    },
    {
      label: "Anaerobic TE",
      value:
        activity.anaerobicTrainingEffect == null
          ? "—"
          : activity.anaerobicTrainingEffect.toFixed(1),
      icon: Gauge,
    },
  ];

  return (
    <div className="grid h-full min-w-0 content-between gap-6 rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_78%_12%,rgba(215,255,47,0.10),transparent_34%),linear-gradient(145deg,#0c110c,#070907)] p-5 sm:p-7">
      <div>
        <p className="tv-label text-[var(--accent)]">
          {reason === "indoor" ? "Indoor performance" : "Activity fingerprint"}
        </p>
        <h3 className="mt-3 max-w-lg text-3xl font-black leading-[0.98] tracking-[-0.04em] sm:text-4xl">
          {reason === "indoor"
            ? "No fake map. Open the work itself."
            : "Garmin returned no usable route trace."}
        </h3>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-[var(--muted)]">
          {reason === "indoor"
            ? "This session is better explained by its intervals, pace, heart-rate and cadence traces than by an empty GPS panel."
            : "The recorded physiology and split data remain available even without GPS geometry."}
        </p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border)] sm:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="border-b border-r border-[var(--border)] p-3 last:border-r-0"
            >
              <div className="flex items-center gap-1.5 text-[0.58rem] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
                <Icon className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                {metric.label}
              </div>
              <p className="mt-2 text-lg font-black text-[var(--text)]">
                {metric.value}
              </p>
            </div>
          );
        })}
      </div>

      <Link href={reviewHref} className="tv-button-primary w-full sm:w-fit">
        Open splits, intervals & charts
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function LatestSessionHero() {
  const garmin = useGarminLocalState();
  const logs = useSessionLogs();
  const [routeState, setRouteState] = useState<RouteState>({
    activityId: null,
    status: "idle",
    route: null,
  });

  const latest = useMemo<LatestEvidence | null>(() => {
    const logsByWorkout = new Map<string, SessionLog>();

    for (const log of [...logs].sort(
      (first, second) => timestamp(second.completedAt) - timestamp(first.completedAt),
    )) {
      if (!logsByWorkout.has(log.workoutId)) {
        logsByWorkout.set(log.workoutId, log);
      }
    }

    const representedLogs = new Set<string>();
    const candidates: LatestEvidence[] = garmin.activities.map((record) => {
      const activityId = record.activity.activityId;
      const explicitSessionId = activityId
        ? garmin.activityLinks[activityId]?.sessionId ?? null
        : null;
      const matchedSessionId =
        record.match.kind === "matched" ? record.match.candidate.sessionId : null;
      let sessionId = explicitSessionId ?? matchedSessionId;
      let attachedLog = sessionId ? logsByWorkout.get(sessionId) ?? null : null;

      if (!attachedLog) {
        const activityDate = datePart(
          record.activity.localStartTime ?? record.activity.startTime,
        );
        const fallbackLogs = logs.filter((log) => {
          const logDate = datePart(log.completedAt) ?? log.workoutDate ?? null;
          return (
            activityDate === logDate &&
            titlesDescribeSameSession(record.activity.title, log.workoutTitle) &&
            durationIsCompatible(record, log)
          );
        });

        if (fallbackLogs.length === 1) {
          attachedLog = fallbackLogs[0];
          sessionId = attachedLog.workoutId;
        }
      }

      if (attachedLog) {
        representedLogs.add(attachedLog.id);
      }

      return {
        record,
        log: attachedLog,
        sessionId,
        timestamp: Math.max(
          activityTimestamp(record),
          attachedLog ? timestamp(attachedLog.completedAt) : 0,
        ),
      };
    });

    for (const log of logs) {
      if (!representedLogs.has(log.id)) {
        candidates.push({
          record: null,
          log,
          sessionId: log.workoutId,
          timestamp: timestamp(log.completedAt),
        });
      }
    }

    return candidates.sort((first, second) => second.timestamp - first.timestamp)[0] ?? null;
  }, [garmin.activities, garmin.activityLinks, logs]);

  const selectedRecord = latest?.record ?? null;
  const activity = selectedRecord?.activity ?? null;
  const log = latest?.log ?? null;
  const activityId = activity?.activityId ?? null;
  const outdoorCandidate = isOutdoorGpsCandidate(selectedRecord);

  useEffect(() => {
    if (!activityId || !outdoorCandidate) {
      setRouteState({
        activityId,
        status: activityId ? "empty" : "idle",
        route: null,
      });
      return;
    }

    const controller = new AbortController();
    setRouteState({ activityId, status: "loading", route: null });

    void fetch(
      `/api/garmin/activities/${encodeURIComponent(activityId)}/route`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Route unavailable");
        return (await response.json()) as RouteResponse;
      })
      .then((route) => {
        const usable = route.points.length > 1 && route.bounds;
        setRouteState({
          activityId,
          status: usable ? "ready" : "empty",
          route: usable ? route : null,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRouteState({ activityId, status: "empty", route: null });
      });

    return () => controller.abort();
  }, [activityId, outdoorCandidate]);

  if (!activity && !log) return null;

  const title = activity?.title ?? log?.workoutTitle ?? "Latest session";
  const type = activityLabel(
    activity?.activityType ?? log?.workoutSessionType ?? log?.workoutCategory,
  );
  const completedAt =
    activity?.localStartTime ?? activity?.startTime ?? log?.completedAt;
  const duration = activity?.durationSeconds
    ? formatDuration(activity.durationSeconds)
    : log?.actualDurationMinutes
      ? `${log.actualDurationMinutes} min`
      : "—";
  const reviewHref = activityId
    ? `/activity/${activityId}`
    : log?.workoutId
      ? `/session/${log.workoutId}/review`
      : "/log";
  const readyRoute =
    routeState.activityId === activityId && routeState.status === "ready"
      ? routeState.route
      : null;

  return (
    <section className="tv-session-hero relative overflow-hidden rounded-[1.35rem] border">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(215,255,47,0.7),transparent)] opacity-60" />
      <div className="relative grid min-w-0 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <div className="min-w-0 p-5 sm:p-7 lg:p-8 xl:p-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tv-session-kicker">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Latest session
            </span>
            <span className="h-1 w-1 rounded-full bg-[var(--quiet)]" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {formatDate(completedAt)}
            </span>
          </div>

          <div className="mt-7">
            <p className="text-[0.7rem] font-[820] uppercase tracking-[0.18em] text-[var(--accent)]">
              {type}
            </p>
            <h2 className="tv-session-title mt-3">{title}</h2>
          </div>

          <div className="tv-metric-strip mt-7">
            <div className="tv-metric-tile">
              <Clock3 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span className="tv-label">Time</span>
              <strong>{duration}</strong>
            </div>
            {activity?.distanceMeters ? (
              <div className="tv-metric-tile">
                <Route className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="tv-label">Distance</span>
                <strong>{(activity.distanceMeters / 1_000).toFixed(2)} km</strong>
              </div>
            ) : null}
            {activity?.averagePaceSecondsPerKm ? (
              <div className="tv-metric-tile">
                <Gauge className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="tv-label">Pace</span>
                <strong>{formatPace(activity.averagePaceSecondsPerKm)}</strong>
              </div>
            ) : null}
            {activity?.averageHeartRateBpm ? (
              <div className="tv-metric-tile">
                <HeartPulse className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="tv-label">Avg HR</span>
                <strong>{Math.round(activity.averageHeartRateBpm)} bpm</strong>
              </div>
            ) : null}
            {activity?.elevationGainMeters ? (
              <div className="tv-metric-tile">
                <Mountain className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="tv-label">Climb</span>
                <strong>{Math.round(activity.elevationGainMeters)} m</strong>
              </div>
            ) : null}
            {log?.rpe ? (
              <div className="tv-metric-tile">
                <Activity className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span className="tv-label">RPE</span>
                <strong>{log.rpe}/10</strong>
              </div>
            ) : null}
          </div>

          <div className="tv-coach-note mt-7">
            <p className="tv-label text-[var(--accent)]">Coach read</p>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-[1.7] text-[#d9ded5]">
              {coachRead(selectedRecord, log)}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href={reviewHref} className="tv-button-primary">
              Review activity
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/coach" className="tv-button-ghost">
              Ask Coach
            </Link>
          </div>
        </div>

        <div className="min-w-0 border-t border-[var(--border)] p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6 xl:p-7">
          {activity && selectedRecord ? (
            readyRoute ? (
              <div className="grid h-full content-start gap-3">
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                  <div>
                    <p className="tv-label text-[var(--accent)]">Route memory</p>
                    <h3 className="mt-1.5 text-xl font-[780] tracking-[-0.03em]">
                      The shape of the work
                    </h3>
                  </div>
                  <span className="tv-route-pill">
                    <MapPinned className="h-3 w-3 text-[var(--accent)]" />
                    {readyRoute.points.length} GPS points
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_70%_30%,rgba(215,255,47,0.10),transparent_36%),linear-gradient(145deg,#0b100b,#070807)] p-3">
                  <RouteTrace route={readyRoute} />
                </div>
                <Link href={reviewHref} className="tv-button-primary w-full sm:w-fit">
                  Open full activity analysis
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <PerformancePanel
                record={selectedRecord}
                reviewHref={reviewHref}
                reason={outdoorCandidate ? "no-route" : "indoor"}
              />
            )
          ) : (
            <div className="grid h-full min-h-64 content-between rounded-2xl border border-white/[0.08] bg-[linear-gradient(145deg,rgba(215,255,47,0.055),transparent_48%),#080b08] p-6 sm:p-8">
              <div>
                <p className="tv-label text-[var(--accent)]">Session fingerprint</p>
                <h3 className="mt-3 max-w-sm text-3xl font-[780] leading-[0.98] tracking-[-0.045em]">
                  Work done. Garmin reconciliation pending.
                </h3>
              </div>
              <div className="grid gap-3">
                {log?.result ? (
                  <p className="border-l-2 border-[var(--accent)] pl-3 text-sm font-semibold">
                    {log.result}
                  </p>
                ) : null}
                {log?.notes ? (
                  <p className="text-sm font-semibold leading-relaxed text-[var(--muted)]">
                    {log.notes}
                  </p>
                ) : null}
                <Link href={reviewHref} className="tv-button-primary w-full sm:w-fit">
                  Review session
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
