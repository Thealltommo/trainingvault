"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BatteryCharging,
  Clock3,
  Gauge,
  HeartPulse,
  Layers3,
  Mountain,
  Route,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Watch,
  Zap,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import GarminActivityAutoSync from "@/components/GarminActivityAutoSync";
import GarminRecoverySync from "@/components/GarminRecoverySync";
import {
  getGarminCompletedSessionIds,
  useGarminLocalState,
} from "@/lib/garmin-storage";
import {
  buildPerformanceLabV2Snapshot,
  classifyGarminActivity,
  type PerformanceSignalV2,
} from "@/lib/performance-lab-v2";
import {
  getCalendarSessions,
  useManualSessions,
  useSessionLifecycleOverrides,
} from "@/lib/planning-storage";
import { useRecoveryRecords } from "@/lib/recovery-storage";
import { getStructuredRunningMetrics } from "@/lib/structured-running";
import { useStructuredRunningWorkouts } from "@/lib/structured-running-storage";
import {
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";

function formatPace(secondsPerKm: number | null) {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) return "—";
  const total = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previously";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function signalTone(signal: PerformanceSignalV2) {
  switch (signal.status) {
    case "positive":
      return "border-[rgba(215,255,47,0.5)] bg-[rgba(215,255,47,0.055)]";
    case "watch":
      return "border-amber-300/35 bg-amber-300/[0.035]";
    default:
      return "border-[var(--border)]";
  }
}

function confidenceTone(confidence: PerformanceSignalV2["confidence"]) {
  if (confidence === "high") {
    return "border-[var(--accent)] text-[var(--accent)]";
  }
  if (confidence === "moderate") {
    return "border-amber-300/50 text-amber-200";
  }
  return "border-[var(--border)] text-[var(--muted)]";
}

function familyLabel(value: ReturnType<typeof classifyGarminActivity>) {
  switch (value) {
    case "run":
      return "Run";
    case "trail":
      return "Trail / fell";
    case "walk_hike":
      return "Walk / hike";
    case "cycle":
      return "Cycle";
    case "strength":
      return "Strength";
    case "cardio":
      return "Cardio";
    default:
      return "Other";
  }
}

function deltaText(value: number | null, suffix = "") {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}${suffix}`;
}

export default function PerformanceLabDashboard() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const workoutOverrides = useWorkoutOverrides();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const garmin = useGarminLocalState();
  const structuredRuns = useStructuredRunningWorkouts();
  const recovery = useRecoveryRecords();

  const garminCompletedIds = useMemo(
    () => getGarminCompletedSessionIds(garmin),
    [garmin],
  );
  const calendarSessions = useMemo(
    () =>
      getCalendarSessions(
        programme,
        manualSessions,
        logs,
        workoutOverrides,
        lifecycle,
        garminCompletedIds,
      ),
    [
      garminCompletedIds,
      lifecycle,
      logs,
      manualSessions,
      programme,
      workoutOverrides,
    ],
  );
  const plannedGarminSessions = useMemo(
    () =>
      calendarSessions
        .filter(
          (session) =>
            Boolean(session.scheduledDate) &&
            ["run", "fell-trail", "race"].includes(session.type),
        )
        .map((session) => {
          const structured = structuredRuns[session.id];
          const metrics = structured
            ? getStructuredRunningMetrics(structured)
            : null;
          return {
            sessionId: session.id,
            title: session.workout.title,
            date: session.scheduledDate,
            plannedDurationSeconds:
              metrics?.plannedDurationSeconds ??
              session.workout.durationMinutes * 60,
            plannedDistanceMeters: metrics?.plannedDistanceMeters ?? null,
            plannedPaceSecondsPerKm:
              metrics?.plannedPaceSecondsPerKm ?? null,
            plannedHeartRateRange: metrics?.plannedHeartRateRange ?? null,
            plannedElevationMeters: null,
            plannedIntervalCount: metrics?.plannedIntervalCount ?? null,
          };
        }),
    [calendarSessions, structuredRuns],
  );

  const snapshot = useMemo(
    () =>
      buildPerformanceLabV2Snapshot(
        garmin.activities.map((record) => record.activity),
        recovery,
        logs,
      ),
    [garmin.activities, logs, recovery],
  );
  const maxFamilyMinutes = Math.max(
    1,
    ...snapshot.families.map((family) => family.minutes),
  );
  const maxManualMinutes = Math.max(
    1,
    ...snapshot.manualCategories.map((category) => category.minutes),
  );
  const trendUp = (snapshot.run.distanceTrendPercent ?? 0) >= 0;
  const TrendIcon = trendUp ? TrendingUp : TrendingDown;
  const latestRecovery = snapshot.recovery.latest;
  const hasRunEvidence = snapshot.run.activities28d > 0;
  const currentDate = localDateKey();

  return (
    <div className="grid gap-5">
      <GarminActivityAutoSync plannedSessions={plannedGarminSessions} />

      <header className="relative overflow-hidden border-b border-[var(--border)] pb-6">
        <div className="absolute right-0 top-0 hidden text-[var(--accent)] opacity-[0.07] sm:block">
          <Activity className="h-36 w-36" strokeWidth={1} aria-hidden="true" />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/insights"
              className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Insight index
            </Link>
            <p className="mt-3 tv-label text-[var(--accent)]">Performance Lab · v2</p>
            <h1 className="mt-2 text-5xl font-black uppercase leading-[0.9] sm:text-6xl">
              Engine state.
              <span className="block text-[var(--accent)]">Evidence first.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)] sm:text-base">
              Garmin physiology and activity, TrainVault session logs, terrain and recovery are kept traceable rather than collapsed into a mystery score. Where the evidence is weak, the Lab says so.
            </p>
          </div>
          <div className="grid min-w-60 gap-2 rounded-sm border border-[var(--border)] bg-black/45 p-3 text-xs font-black uppercase">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--muted)]">Garmin bank</span>
              <span className={garmin.lastSyncedAt ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
                {garmin.lastSyncedAt ? "live" : "waiting"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--muted)]">Last activity sync</span>
              <span>{formatDateTime(garmin.lastSyncedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[var(--muted)]">Recovery coverage</span>
              <span>{snapshot.source.recoveryDays14d}/14 days</span>
            </div>
          </div>
        </div>
      </header>

      {snapshot.source.activities28d > 0 && !hasRunEvidence ? (
        <section className="border border-[rgba(215,255,47,0.35)] bg-[rgba(215,255,47,0.055)] p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-[var(--accent)] text-black">
              <Watch className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Sync is working</p>
              <h2 className="mt-1 text-xl font-black uppercase">No recent run-distance evidence yet</h2>
              <p className="mt-2 max-w-4xl text-sm font-bold leading-relaxed text-[var(--muted)]">
                TrainVault has {snapshot.source.activities28d} Garmin activities across {snapshot.source.activeDays28d} days in the current 28-day window. They currently classify as non-running work, so the running cards stay at zero instead of pretending the Garmin connection is broken or manufacturing mileage.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          {
            label: "28d running",
            value: `${snapshot.run.distanceKm28d.toFixed(1)} km`,
            detail: `${snapshot.run.activities28d} runs · ${snapshot.run.days28d} days`,
            icon: Route,
          },
          {
            label: "Longest run",
            value:
              snapshot.run.longestRunDistanceKm == null
                ? "—"
                : `${snapshot.run.longestRunDistanceKm.toFixed(1)} km`,
            detail:
              snapshot.run.longestRunMinutes == null
                ? "waiting for a run"
                : `${snapshot.run.longestRunMinutes} min`,
            icon: Timer,
          },
          {
            label: "Vertical",
            value: `${snapshot.run.elevationGainM28d.toLocaleString("en-GB")} m`,
            detail:
              snapshot.run.elevationPerKm == null
                ? "terrain model waiting"
                : `${snapshot.run.elevationPerKm.toFixed(0)} m / km`,
            icon: Mountain,
          },
          {
            label: "Weighted pace",
            value: formatPace(snapshot.run.averagePaceSecondsPerKm),
            detail:
              snapshot.run.averageHeartRateBpm == null
                ? "HR unavailable"
                : `${snapshot.run.averageHeartRateBpm.toFixed(0)} bpm`,
            icon: Gauge,
          },
          {
            label: "Garmin hours",
            value: `${snapshot.source.totalHours28d.toFixed(1)} h`,
            detail: `${snapshot.source.activeDays28d} active days`,
            icon: Clock3,
          },
          {
            label: "Recovery data",
            value: `${snapshot.source.recoveryCoveragePercent}%`,
            detail: `${snapshot.source.recoveryDays14d}/14 days`,
            icon: HeartPulse,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="tv-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="tv-label">{metric.label}</p>
                <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-2xl font-black tracking-tight text-[var(--accent)] xl:text-3xl">
                {metric.value}
              </p>
              <p className="mt-1 text-[0.68rem] font-black uppercase text-[var(--muted)]">
                {metric.detail}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.55fr_0.75fr]">
        <article className="tv-card overflow-hidden p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Eight-week engine trace</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Running volume meets vertical</h2>
            </div>
            <span className="text-xs font-black uppercase text-[var(--muted)]">
              run + trail only
            </span>
          </div>
          <div className="mt-5 h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 320 }}>
              <ComposedChart data={snapshot.weekly} margin={{ left: -18, right: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#a3a3a3", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="distance" tick={{ fill: "#a3a3a3", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="elevation" orientation="right" tick={{ fill: "#737373", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }} />
                <Bar yAxisId="elevation" dataKey="elevationM" name="Elevation m" fill="rgba(255,255,255,0.18)" radius={[2, 2, 0, 0]} />
                <Line yAxisId="distance" type="monotone" dataKey="runDistanceKm" name="Run distance km" stroke="#d7ff2f" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="tv-card border-[rgba(215,255,47,0.3)] p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black">
              <TrendIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Seven-day delta</p>
              <h2 className="text-xl font-black uppercase">Volume movement</h2>
            </div>
          </div>
          <p className="mt-6 text-6xl font-black tracking-tight">
            {snapshot.run.distanceTrendPercent == null
              ? "—"
              : `${snapshot.run.distanceTrendPercent > 0 ? "+" : ""}${snapshot.run.distanceTrendPercent.toFixed(0)}%`}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Current 7d</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">
                {snapshot.run.current7dDistanceKm.toFixed(1)} km
              </p>
            </div>
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Previous 7d</p>
              <p className="mt-1 text-2xl font-black">
                {snapshot.run.previous7dDistanceKm.toFixed(1)} km
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black uppercase">
            <div className="border border-[var(--border)] p-3">
              <span className="text-[var(--muted)]">Current 14d</span>
              <span className="mt-1 block">{snapshot.run.current14dDistanceKm.toFixed(1)} km</span>
            </div>
            <div className="border border-[var(--border)] p-3">
              <span className="text-[var(--muted)]">Previous 14d</span>
              <span className="mt-1 block">{snapshot.run.previous14dDistanceKm.toFixed(1)} km</span>
            </div>
          </div>
          <p className="mt-4 text-xs font-bold leading-relaxed text-[var(--muted)]">
            Workload comparison only. Readiness and session decisions stay with the deterministic coaching rules.
          </p>
        </article>
      </section>

      <section className="tv-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Fourteen-day runway</p>
            <h2 className="mt-1 text-2xl font-black uppercase">Work happened here</h2>
          </div>
          <p className="max-w-xl text-right text-xs font-bold text-[var(--muted)]">
            Garmin minutes and TrainVault logged minutes are plotted as separate evidence streams because a watch activity and a manual session can describe the same workout.
          </p>
        </div>
        <div className="mt-5 h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 288 }}>
            <ComposedChart data={snapshot.dailyLoad} margin={{ left: -18, right: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fill: "#a3a3a3", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="minutes" tick={{ fill: "#a3a3a3", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="distance" orientation="right" tick={{ fill: "#737373", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }} />
              <Bar yAxisId="minutes" dataKey="garminMinutes" name="Garmin min" fill="rgba(215,255,47,0.36)" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="minutes" dataKey="manualMinutes" name="TrainVault min" fill="rgba(255,255,255,0.18)" radius={[2, 2, 0, 0]} />
              <Line yAxisId="distance" type="monotone" dataKey="runKm" name="Run km" stroke="#d7ff2f" strokeWidth={2.5} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="tv-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Recovery trace</p>
              <h2 className="mt-1 text-2xl font-black uppercase">HRV, resting HR and sleep</h2>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
              <HeartPulse className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              {snapshot.source.recoveryDays14d}/14 days
            </span>
          </div>
          {snapshot.recoverySeries.length > 0 ? (
            <div className="mt-5 h-72 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 840, height: 288 }}>
                <ComposedChart data={snapshot.recoverySeries} margin={{ left: -18, right: 2 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a3a3a3", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="physiology" tick={{ fill: "#a3a3a3", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={{ fill: "#737373", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#050505", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4 }} />
                  <Line yAxisId="physiology" type="monotone" dataKey="hrvMs" name="HRV ms" stroke="#d7ff2f" strokeWidth={2.5} connectNulls dot={false} />
                  <Line yAxisId="physiology" type="monotone" dataKey="restingHeartRate" name="Resting HR" stroke="#ffffff" strokeOpacity={0.58} strokeWidth={2} connectNulls dot={false} />
                  <Bar yAxisId="score" dataKey="sleepScore" name="Sleep score" fill="rgba(255,255,255,0.12)" radius={[2, 2, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-6 text-sm font-bold text-[var(--muted)]">
              Recovery data will appear here as Garmin sync and manual check-ins build a streak.
            </div>
          )}
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Latest physiology</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Morning context</h2>
            </div>
            <BatteryCharging className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          {latestRecovery ? (
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                ["HRV", latestRecovery.hrvMs == null ? "—" : `${latestRecovery.hrvMs.toFixed(0)} ms`],
                ["Resting HR", latestRecovery.restingHeartRate == null ? "—" : `${latestRecovery.restingHeartRate.toFixed(0)} bpm`],
                ["Sleep", latestRecovery.sleepScore == null ? "—" : `${latestRecovery.sleepScore.toFixed(0)}/100`],
                ["Body battery", latestRecovery.bodyBattery == null ? "—" : `${latestRecovery.bodyBattery.toFixed(0)}`],
                ["Readiness", latestRecovery.readiness == null ? "—" : `${latestRecovery.readiness.toFixed(0)}/100`],
                ["Sleep h", latestRecovery.sleepHours == null ? "—" : `${latestRecovery.sleepHours.toFixed(1)} h`],
              ].map(([label, value]) => (
                <div key={label} className="border border-[var(--border)] bg-black/45 p-3">
                  <p className="tv-label">{label}</p>
                  <p className="mt-1 text-xl font-black">{value}</p>
                </div>
              ))}
              <div className="col-span-2 mt-1 border-t border-[var(--border)] pt-3 text-xs font-bold text-[var(--muted)]">
                Latest: {latestRecovery.label} · HRV vs recent baseline {deltaText(snapshot.recovery.hrvDeltaVsBaselinePercent, "%")} · resting HR {deltaText(snapshot.recovery.restingHeartRateDeltaVsBaseline, " bpm")}
              </div>
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              No recovery record is available yet. The Garmin refresh below can start the evidence streak.
            </p>
          )}
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Garmin fingerprint</p>
              <h2 className="mt-1 text-2xl font-black uppercase">What the watch saw</h2>
            </div>
            <Watch className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Last 28 days · activity families from Garmin. This is source evidence, not TrainVault categorisation of planned sessions.
          </p>
          {snapshot.families.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {snapshot.families.map((family) => (
                <div key={family.family}>
                  <div className="flex items-center justify-between gap-3 text-xs font-black uppercase">
                    <span>{family.label}</span>
                    <span className="text-[var(--muted)]">
                      {family.activities} · {family.minutes} min
                      {family.distanceKm > 0 ? ` · ${family.distanceKm.toFixed(1)} km` : ""}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden bg-white/10">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(6, (family.minutes / maxFamilyMinutes) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              Garmin activity families appear after activity sync.
            </p>
          )}
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">TrainVault fingerprint</p>
              <h2 className="mt-1 text-2xl font-black uppercase">What you logged</h2>
            </div>
            <Layers3 className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Manual/completed TrainVault sessions stay separate from Garmin to avoid fake precision from accidental double-counting.
          </p>
          {snapshot.manualCategories.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {snapshot.manualCategories.map((category) => (
                <div key={category.category}>
                  <div className="flex items-center justify-between gap-3 text-xs font-black uppercase">
                    <span>{category.category}</span>
                    <span className="text-[var(--muted)]">
                      {category.sessions} sessions · {category.minutes} min
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden bg-white/10">
                    <div className="h-full bg-white/55" style={{ width: `${Math.max(6, (category.minutes / maxManualMinutes) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              Complete or manually log sessions to build the TrainVault side of the hybrid fingerprint.
            </p>
          )}
        </article>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Engine reads</p>
            <h2 className="mt-1 text-3xl font-black uppercase">What TrainVault can defend</h2>
          </div>
          <p className="max-w-xl text-right text-xs font-bold text-[var(--muted)]">
            These are deterministic descriptions with evidence thresholds. Coach can interpret them later, but it does not get to rewrite the underlying facts.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {snapshot.signals.map((signal) => (
            <article key={signal.id} className={`border p-4 ${signalTone(signal)}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="tv-label text-[var(--accent)]">TrainVault signal</p>
                <span className={`rounded-sm border px-2 py-1 text-[0.62rem] font-black uppercase ${confidenceTone(signal.confidence)}`}>
                  {signal.confidence}
                </span>
              </div>
              <h3 className="mt-3 text-xl font-black uppercase leading-tight">{signal.title}</h3>
              <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">{signal.body}</p>
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="tv-label">Evidence</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {signal.evidence.map((item) => (
                    <span key={item} className="border border-[var(--border)] bg-black/45 px-2 py-1 text-[0.65rem] font-black uppercase text-[var(--muted)]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="tv-card border-[rgba(215,255,47,0.3)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Aerobic efficiency gate</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Pace at comparable HR</h2>
            </div>
            <Sparkles className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Current 14d</p>
              <p className="mt-2 text-2xl font-black">{formatPace(snapshot.paceHeartRate.currentPaceSecondsPerKm)}</p>
              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {snapshot.paceHeartRate.currentHeartRateBpm == null ? "HR —" : `${snapshot.paceHeartRate.currentHeartRateBpm.toFixed(0)} bpm`} · {snapshot.paceHeartRate.currentRuns} runs
              </p>
            </div>
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Previous 14d</p>
              <p className="mt-2 text-2xl font-black">{formatPace(snapshot.paceHeartRate.previousPaceSecondsPerKm)}</p>
              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {snapshot.paceHeartRate.previousHeartRateBpm == null ? "HR —" : `${snapshot.paceHeartRate.previousHeartRateBpm.toFixed(0)} bpm`} · {snapshot.paceHeartRate.previousRuns} runs
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm font-bold leading-relaxed text-[var(--muted)]">
            {snapshot.paceHeartRate.comparable
              ? `Comparable: weighted HR differs by only ${Math.abs(snapshot.paceHeartRate.heartRateDeltaBpm ?? 0).toFixed(0)} bpm. Pace movement is ${deltaText(snapshot.paceHeartRate.paceDeltaSecondsPerKm, " sec/km")}.`
              : "Locked until both 14-day windows have at least two runs with usable pace and heart-rate data and weighted HR sits within 5 bpm. No apples-to-oranges efficiency claims."}
          </p>
        </article>

        <article className="tv-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Recent Garmin evidence</p>
              <h2 className="mt-1 text-2xl font-black uppercase">The records underneath the claims</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
              <Watch className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              synced {formatDateTime(garmin.lastSyncedAt)}
            </div>
          </div>
          {snapshot.recentActivities.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {snapshot.recentActivities.slice(0, 8).map((activity, index) => {
                const date = activity.localStartTime ?? activity.startTime;
                const family = classifyGarminActivity(activity);
                return (
                  <article key={activity.activityId ?? `${date}-${index}`} className="border border-[var(--border)] bg-black/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tv-label">{formatDate(date)} · {familyLabel(family)}</p>
                        <h3 className="mt-1 truncate text-sm font-black uppercase">
                          {activity.title || activity.activityType || "Garmin activity"}
                        </h3>
                      </div>
                      <Activity className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="tv-label">Duration</p>
                        <p className="mt-1 font-black">{formatDuration(activity.movingDurationSeconds ?? activity.durationSeconds)}</p>
                      </div>
                      <div>
                        <p className="tv-label">Distance</p>
                        <p className="mt-1 font-black">{activity.distanceMeters == null ? "—" : `${(activity.distanceMeters / 1_000).toFixed(1)} km`}</p>
                      </div>
                      <div>
                        <p className="tv-label">HR</p>
                        <p className="mt-1 font-black">{activity.averageHeartRateBpm == null ? "—" : `${Math.round(activity.averageHeartRateBpm)}`}</p>
                      </div>
                      <div>
                        <p className="tv-label">Aerobic TE</p>
                        <p className="mt-1 font-black">{activity.aerobicTrainingEffect == null ? "—" : activity.aerobicTrainingEffect.toFixed(1)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-6">
              <p className="text-lg font-black uppercase">No Garmin activities in the local bank yet</p>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                This page now attempts a bounded automatic sync. If the bridge is offline, open Log for the visible retry surface.
              </p>
              <Link href="/log" className="tv-button-primary mt-4">Open Garmin sync</Link>
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr]">
        <GarminRecoverySync date={currentDate} />
        <article className="tv-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-sm bg-[var(--accent)] text-black">
              <Zap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Next unlocks</p>
              <h2 className="text-xl font-black uppercase">The Lab gets smarter by use, not by guessing</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm font-bold text-[var(--muted)]">
            <p className="border-l-2 border-[var(--accent)] pl-3"><strong className="text-[var(--text)]">4+ comparable runs:</strong> a basic running trend becomes defensible.</p>
            <p className="border-l-2 border-[var(--accent)] pl-3"><strong className="text-[var(--text)]">7+ recovery days:</strong> HRV / resting-HR context starts to matter.</p>
            <p className="border-l-2 border-[var(--accent)] pl-3"><strong className="text-[var(--text)]">Two 14-day run windows:</strong> pace-at-HR efficiency can be compared.</p>
            <p className="border-l-2 border-[var(--accent)] pl-3"><strong className="text-[var(--text)]">Cloud history:</strong> months of Garmin + Hawkeye + fell + race data become one evidence base for Coach.</p>
          </div>
        </article>
      </section>
    </div>
  );
}
