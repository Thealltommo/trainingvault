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
import { useGarminLocalState, type GarminStoredActivity } from "@/lib/garmin-storage";
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

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPace(secondsPerKm: number | null | undefined) {
  if (!secondsPerKm || secondsPerKm <= 0) return "—";
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
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMapActivity(record: GarminStoredActivity | null) {
  const type = record?.activity.activityType?.toLowerCase() ?? "";
  return /(run|trail|hike|walk|cycling|bike)/.test(type);
}

function coachRead(record: GarminStoredActivity | null, log: SessionLog | null) {
  if (record) {
    const activity = record.activity;
    const type = activity.activityType?.toLowerCase() ?? "";
    const durationMinutes = (activity.durationSeconds ?? 0) / 60;
    const climb = activity.elevationGainMeters ?? 0;
    const aerobic = activity.aerobicTrainingEffect ?? 0;
    const anaerobic = activity.anaerobicTrainingEffect ?? 0;

    if (aerobic >= 4 || anaerobic >= 3.5) {
      return "This was a meaningful training hit, not background volume. Protect the next quality session until recovery confirms you absorbed it.";
    }
    if (/(trail|hike)/.test(type) && climb >= 500) {
      return "The vertical load matters as much as the distance here. Expect more eccentric cost than a flat run of the same duration.";
    }
    if (/(run|trail)/.test(type) && durationMinutes >= 75) {
      return "A solid endurance deposit. The useful next move is to absorb it rather than chase another hard stimulus immediately.";
    }
    if (/(run|trail)/.test(type)) {
      return "Clean running evidence is now in the bank. TrainVault can compare this against recovery and the next planned session instead of judging pace in isolation.";
    }
    return "This session is now part of the athlete history. Its value comes from how it changes the next decision, not from another standalone score.";
  }

  if (log) {
    if (log.rpe >= 8) {
      return "High subjective cost. Treat the next hard session as conditional until the morning recovery check supports it.";
    }
    if (log.limiter) {
      return `You logged ${log.limiter} as the limiter. Keep that visible when the next session is adapted rather than treating all fatigue as the same.`;
    }
    return "The session is logged. Recovery and the next planned stimulus now decide whether this was productive load or simply more load.";
  }

  return "Complete a session or sync Garmin to unlock the latest-session review.";
}

function samplePoints<T>(points: T[], maximum = 360) {
  if (points.length <= maximum) return points;
  const stride = Math.ceil(points.length / maximum);
  return points.filter((_, index) => index % stride === 0 || index === points.length - 1);
}

function RouteTrace({ route }: { route: RouteResponse | null }) {
  const geometry = useMemo(() => {
    if (!route || route.points.length < 2 || !route.bounds) return null;
    const width = 840;
    const height = 390;
    const pad = 44;
    const lonSpan = Math.max(0.000001, route.bounds.maxLon - route.bounds.minLon);
    const latSpan = Math.max(0.000001, route.bounds.maxLat - route.bounds.minLat);
    const usableWidth = width - pad * 2;
    const usableHeight = height - pad * 2;
    const scale = Math.min(usableWidth / lonSpan, usableHeight / latSpan);
    const drawnWidth = lonSpan * scale;
    const drawnHeight = latSpan * scale;
    const xOffset = (width - drawnWidth) / 2;
    const yOffset = (height - drawnHeight) / 2;
    const bounds = route.bounds;
    const points = samplePoints(route.points, 520).map((point) => ({
      x: xOffset + (point.lon - bounds.minLon) * scale,
      y: yOffset + (bounds.maxLat - point.lat) * scale,
    }));
    return {
      path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      start: points[0],
      end: points[points.length - 1],
      width,
      height,
    };
  }, [route]);

  if (!geometry) {
    return (
      <div className="grid min-h-[22rem] place-items-center px-6 text-center">
        <div>
          <MapPinned className="mx-auto h-7 w-7 text-[var(--accent)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-[800]">Route trace unavailable</p>
          <p className="mt-1 max-w-sm text-xs font-semibold leading-relaxed text-[var(--muted)]">
            GPS activities draw here directly from Garmin without sending the route to a third-party map provider.
          </p>
        </div>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="relative h-[22rem] w-full sm:h-[25rem]" role="img" aria-label="Private GPS route trace">
      <defs>
        <linearGradient id="tv-route-gradient" x1="0%" y1="10%" x2="100%" y2="90%">
          <stop offset="0%" stopColor="#f3ffb1" />
          <stop offset="42%" stopColor="#d7ff2f" />
          <stop offset="100%" stopColor="#9cd400" />
        </linearGradient>
        <filter id="tv-route-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={geometry.path} fill="none" stroke="rgba(215,255,47,0.1)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
      <path d={geometry.path} fill="none" stroke="url(#tv-route-gradient)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#tv-route-glow)" />
      <circle cx={geometry.start.x} cy={geometry.start.y} r="9" fill="#071007" stroke="#d7ff2f" strokeWidth="4" />
      <circle cx={geometry.start.x} cy={geometry.start.y} r="2.7" fill="#d7ff2f" />
      <circle cx={geometry.end.x} cy={geometry.end.y} r="9" fill="#d7ff2f" stroke="#071007" strokeWidth="4" />
      <text x={Math.min(geometry.width - 78, geometry.start.x + 15)} y={Math.max(24, geometry.start.y - 14)} fill="#aab3a5" fontSize="12" fontWeight="800" letterSpacing="1.5">START</text>
      <text x={Math.min(geometry.width - 88, geometry.end.x + 15)} y={Math.max(24, geometry.end.y - 14)} fill="#d7ff2f" fontSize="12" fontWeight="800" letterSpacing="1.5">FINISH</text>
    </svg>
  );
}

function ElevationProfile({ route }: { route: RouteResponse | null }) {
  const geometry = useMemo(() => {
    if (!route) return null;
    const elevations = samplePoints(
      route.points.filter((point): point is RoutePoint & { elevationMeters: number } => Number.isFinite(point.elevationMeters)),
      320,
    );
    if (elevations.length < 2) return null;

    const values = elevations.map((point) => point.elevationMeters);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = Math.max(1, maximum - minimum);
    const width = 760;
    const height = 96;
    const padY = 9;
    const usableHeight = height - padY * 2;
    const points = elevations.map((point, index) => ({
      x: (index / (elevations.length - 1)) * width,
      y: padY + (1 - (point.elevationMeters - minimum) / span) * usableHeight,
    }));
    const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;

    return { line, area, width, height, minimum, maximum };
  }, [route]);

  if (!geometry) return null;

  return (
    <div className="tv-elevation-panel">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Elevation profile</p>
          <p className="mt-1 text-[0.68rem] font-semibold text-[var(--muted)]">Terrain shape from recorded GPS altitude</p>
        </div>
        <div className="text-right text-[0.62rem] font-bold text-[var(--muted)]">
          <span>{Math.round(geometry.minimum)} m</span>
          <span className="mx-1.5 text-[var(--quiet)]">→</span>
          <span className="text-[var(--text)]">{Math.round(geometry.maximum)} m</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="h-20 w-full" aria-label="Elevation profile">
        <defs>
          <linearGradient id="tv-elevation-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(215,255,47,0.22)" />
            <stop offset="100%" stopColor="rgba(215,255,47,0.01)" />
          </linearGradient>
        </defs>
        <path d={geometry.area} fill="url(#tv-elevation-fill)" />
        <path d={geometry.line} fill="none" stroke="#d7ff2f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function LatestSessionHero() {
  const garmin = useGarminLocalState();
  const logs = useSessionLogs();
  const [route, setRoute] = useState<RouteResponse | null>(null);

  const latestGarmin = useMemo(() => {
    return [...garmin.activities].sort((a, b) => {
      const aTime = timestamp(a.activity.startTime ?? a.activity.localStartTime ?? a.importedAt);
      const bTime = timestamp(b.activity.startTime ?? b.activity.localStartTime ?? b.importedAt);
      return bTime - aTime;
    })[0] ?? null;
  }, [garmin.activities]);

  const latestLog = useMemo(() => {
    return [...logs].sort((a, b) => timestamp(b.completedAt) - timestamp(a.completedAt))[0] ?? null;
  }, [logs]);

  const garminTime = latestGarmin
    ? timestamp(latestGarmin.activity.startTime ?? latestGarmin.activity.localStartTime ?? latestGarmin.importedAt)
    : 0;
  const logTime = latestLog ? timestamp(latestLog.completedAt) : 0;
  const useGarmin = Boolean(latestGarmin && garminTime >= logTime);
  const activity = useGarmin ? latestGarmin?.activity ?? null : null;
  const log = !useGarmin ? latestLog : null;
  const activityId = useGarmin ? latestGarmin?.activity.activityId ?? null : null;
  const activeRoute = route && activityId && route.activityId === activityId ? route : null;

  useEffect(() => {
    if (!useGarmin || !activityId || !isMapActivity(latestGarmin)) return;

    let cancelled = false;
    void fetch(`/api/garmin/activities/${encodeURIComponent(activityId)}/route`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as RouteResponse;
      })
      .then((data) => {
        if (!cancelled && data) setRoute(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activityId, latestGarmin, useGarmin]);

  if (!activity && !log) return null;

  const title = activity?.title ?? log?.workoutTitle ?? "Latest session";
  const type = activityLabel(activity?.activityType ?? log?.workoutSessionType ?? log?.workoutCategory);
  const completedAt = activity?.localStartTime ?? activity?.startTime ?? log?.completedAt;
  const duration = activity?.durationSeconds
    ? formatDuration(activity.durationSeconds)
    : log?.actualDurationMinutes
      ? `${log.actualDurationMinutes} min`
      : "—";
  const routeLoading = Boolean(activityId && isMapActivity(latestGarmin) && !activeRoute);
  const secondaryMetrics = activity
    ? [
        { label: "Moving", value: formatDuration(activity.movingDurationSeconds), icon: Timer },
        { label: "Max HR", value: activity.maxHeartRateBpm ? `${Math.round(activity.maxHeartRateBpm)} bpm` : "—", icon: HeartPulse },
        { label: "Cadence", value: activity.averageCadenceSpm ? `${Math.round(activity.averageCadenceSpm)} spm` : "—", icon: Activity },
        { label: "Energy", value: activity.calories ? `${Math.round(activity.calories)} kcal` : "—", icon: Flame },
        { label: "Aerobic TE", value: activity.aerobicTrainingEffect != null ? activity.aerobicTrainingEffect.toFixed(1) : "—", icon: Zap },
        { label: "Anaerobic TE", value: activity.anaerobicTrainingEffect != null ? activity.anaerobicTrainingEffect.toFixed(1) : "—", icon: Gauge },
      ]
    : [];

  return (
    <section className="tv-session-hero relative overflow-hidden rounded-[1.35rem] border">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(215,255,47,0.7),transparent)] opacity-60" />
      <div className="relative grid min-w-0 gap-0 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="min-w-0 p-5 sm:p-7 lg:p-8 xl:p-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="tv-session-kicker"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Latest session</span>
            <span className="h-1 w-1 rounded-full bg-[var(--quiet)]" />
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{formatDate(completedAt)}</span>
          </div>

          <div className="mt-8">
            <p className="text-[0.7rem] font-[820] uppercase tracking-[0.18em] text-[var(--accent)]">{type}</p>
            <h2 className="tv-session-title mt-3">{title}</h2>
          </div>

          <div className="tv-metric-strip mt-7">
            <div className="tv-metric-tile"><Clock3 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Time</span><strong>{duration}</strong></div>
            {activity?.distanceMeters ? <div className="tv-metric-tile"><Route className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Distance</span><strong>{(activity.distanceMeters / 1000).toFixed(1)} km</strong></div> : null}
            {activity?.averagePaceSecondsPerKm ? <div className="tv-metric-tile"><Gauge className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Pace</span><strong>{formatPace(activity.averagePaceSecondsPerKm)}</strong></div> : null}
            {activity?.averageHeartRateBpm ? <div className="tv-metric-tile"><HeartPulse className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Avg HR</span><strong>{Math.round(activity.averageHeartRateBpm)} bpm</strong></div> : null}
            {activity?.elevationGainMeters ? <div className="tv-metric-tile"><Mountain className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Climb</span><strong>{Math.round(activity.elevationGainMeters)} m</strong></div> : null}
            {log?.rpe ? <div className="tv-metric-tile"><Activity className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">RPE</span><strong>{log.rpe}/10</strong></div> : null}
            {log?.score ? <div className="tv-metric-tile"><Footprints className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Score</span><strong>{log.score}</strong></div> : null}
          </div>

          <div className="tv-coach-note mt-7">
            <p className="tv-label text-[var(--accent)]">Coach read</p>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-[1.7] text-[#d9ded5]">{coachRead(latestGarmin, log)}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/log" className="tv-button-primary">Review session <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/coach" className="tv-button-ghost">Ask Coach</Link>
          </div>
        </div>

        <div className="tv-route-panel min-w-0 p-4 sm:p-5 lg:p-6 xl:p-7">
          {isMapActivity(latestGarmin) ? (
            <div className="grid h-full min-w-0 content-start gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-1">
                <div>
                  <p className="tv-label text-[var(--accent)]">Route memory</p>
                  <h3 className="mt-1.5 text-xl font-[780] tracking-[-0.03em]">The shape of the work</h3>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span className="tv-route-pill"><span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> Garmin direct</span>
                  <span className="tv-route-pill">{routeLoading ? "Loading GPS" : activeRoute?.points.length ? `${activeRoute.points.length} points` : "Private GPS"}</span>
                </div>
              </div>

              <div className="tv-route-canvas">
                <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1.5 sm:left-4 sm:top-4">
                  {activity?.distanceMeters ? <span className="tv-route-pill"><Route className="h-3 w-3 text-[var(--accent)]" /> {(activity.distanceMeters / 1000).toFixed(1)} km</span> : null}
                  {activity?.elevationGainMeters ? <span className="tv-route-pill"><Mountain className="h-3 w-3 text-[var(--accent)]" /> +{Math.round(activity.elevationGainMeters)} m</span> : null}
                </div>
                <div className="pointer-events-none absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
                  <span className="tv-route-pill"><MapPinned className="h-3 w-3 text-[var(--accent)]" /> Private trace</span>
                </div>
                <RouteTrace route={activeRoute} />
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 sm:bottom-4 sm:left-4">
                  <span className="tv-route-pill">No third-party map tiles</span>
                </div>
              </div>

              <ElevationProfile route={activeRoute} />

              {secondaryMetrics.length > 0 ? (
                <div className="tv-route-stat-grid overflow-hidden rounded-[0.85rem]">
                  {secondaryMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div key={metric.label} className="tv-route-stat">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                          <span>{metric.label}</span>
                        </div>
                        <strong>{metric.value}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid h-full min-h-[30rem] content-between rounded-2xl border border-white/[0.08] bg-[linear-gradient(145deg,rgba(215,255,47,0.055),transparent_48%),#080b08] p-6 sm:p-8">
              <div>
                <p className="tv-label text-[var(--accent)]">Session fingerprint</p>
                <h3 className="mt-3 max-w-sm text-4xl font-[780] leading-[0.96] tracking-[-0.045em]">Work done. Context retained.</h3>
              </div>
              <div className="grid gap-3">
                {log?.result ? <p className="border-l-2 border-[var(--accent)] pl-3 text-sm font-semibold">{log.result}</p> : null}
                {log?.notes ? <p className="text-sm font-semibold leading-relaxed text-[var(--muted)]">{log.notes}</p> : null}
                <p className="text-xs font-semibold leading-relaxed text-[var(--quiet)]">Strength, hybrid and CrossFit sessions stay human-readable instead of being forced into fake GPS-style metrics.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}