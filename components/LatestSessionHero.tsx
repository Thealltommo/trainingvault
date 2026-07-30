"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Footprints,
  Gauge,
  HeartPulse,
  MapPinned,
  Mountain,
  Route,
  Sparkles,
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

function RouteTrace({ route }: { route: RouteResponse | null }) {
  const geometry = useMemo(() => {
    if (!route || route.points.length < 2 || !route.bounds) return null;
    const width = 720;
    const height = 300;
    const pad = 26;
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
    const points = route.points.map((point) => ({
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
      <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-white/10 bg-black/30 px-6 text-center">
        <div>
          <MapPinned className="mx-auto h-7 w-7 text-[var(--accent)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-black uppercase">Route trace unavailable</p>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">GPS activities will draw here without sending your route to a third-party map provider.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#080b08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(215,255,47,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(215,255,47,0.05)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(215,255,47,0.12),transparent_32%),linear-gradient(180deg,transparent,rgba(0,0,0,0.42))]" />
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="relative h-64 w-full" role="img" aria-label="Private GPS route trace">
        <path d={geometry.path} fill="none" stroke="rgba(215,255,47,0.18)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <path d={geometry.path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={geometry.start.x} cy={geometry.start.y} r="7" fill="#050505" stroke="var(--accent)" strokeWidth="4" />
        <circle cx={geometry.end.x} cy={geometry.end.y} r="7" fill="var(--accent)" stroke="#050505" strokeWidth="4" />
      </svg>
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-wide text-[var(--muted)] backdrop-blur">
        <MapPinned className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
        Private GPS trace · no map tiles
      </div>
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

  return (
    <section className="tv-session-hero relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d0a] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(215,255,47,0.15),transparent_30%),radial-gradient(circle_at_90%_100%,rgba(215,255,47,0.07),transparent_32%)]" />
      <div className="relative grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(215,255,47,0.34)] bg-[rgba(215,255,47,0.09)] px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Latest session
            </span>
            <span className="text-xs font-black uppercase text-[var(--muted)]">{formatDate(completedAt)}</span>
          </div>

          <p className="mt-7 text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">{type}</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.035em] sm:text-5xl">{title}</h2>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="tv-metric-tile"><Clock3 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Time</span><strong>{duration}</strong></div>
            {activity?.distanceMeters ? <div className="tv-metric-tile"><Route className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Distance</span><strong>{(activity.distanceMeters / 1000).toFixed(1)} km</strong></div> : null}
            {activity?.averagePaceSecondsPerKm ? <div className="tv-metric-tile"><Gauge className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Pace</span><strong>{formatPace(activity.averagePaceSecondsPerKm)}</strong></div> : null}
            {activity?.averageHeartRateBpm ? <div className="tv-metric-tile"><HeartPulse className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Avg HR</span><strong>{Math.round(activity.averageHeartRateBpm)} bpm</strong></div> : null}
            {activity?.elevationGainMeters ? <div className="tv-metric-tile"><Mountain className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Climb</span><strong>{Math.round(activity.elevationGainMeters)} m</strong></div> : null}
            {log?.rpe ? <div className="tv-metric-tile"><Activity className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">RPE</span><strong>{log.rpe}/10</strong></div> : null}
            {log?.score ? <div className="tv-metric-tile"><Footprints className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" /><span className="tv-label">Score</span><strong>{log.score}</strong></div> : null}
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center gap-2 text-[var(--accent)]"><Sparkles className="h-4 w-4" aria-hidden="true" /><span className="tv-label text-[var(--accent)]">Coach read</span></div>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[#dedede]">{coachRead(latestGarmin, log)}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/log" className="tv-button-primary">Review session <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link href="/coach" className="tv-button-ghost">Ask Coach</Link>
          </div>
        </div>

        <div className="border-t border-white/10 p-4 sm:p-5 xl:border-l xl:border-t-0">
          {isMapActivity(latestGarmin) ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div><p className="tv-label text-[var(--accent)]">Route memory</p><p className="mt-1 text-sm font-black uppercase">What the watch saw</p></div>
                <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">{routeLoading ? "Loading GPS…" : activeRoute?.points.length ? `${activeRoute.points.length} points` : "Private"}</span>
              </div>
              <RouteTrace route={activeRoute} />
            </>
          ) : (
            <div className="grid h-full min-h-72 content-between rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(215,255,47,0.08),transparent_48%),#080808] p-6">
              <div><p className="tv-label text-[var(--accent)]">Session fingerprint</p><h3 className="mt-2 text-3xl font-black uppercase leading-none">Work done.<br />Context retained.</h3></div>
              <div className="grid gap-2">
                {log?.result ? <p className="border-l-2 border-[var(--accent)] pl-3 text-sm font-bold">{log.result}</p> : null}
                {log?.notes ? <p className="text-sm font-bold text-[var(--muted)]">{log.notes}</p> : null}
                <p className="text-xs font-bold text-[var(--muted)]">Strength, hybrid and CrossFit sessions stay human-readable instead of being forced into fake GPS-style metrics.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
