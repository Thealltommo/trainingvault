"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Gauge,
  HeartPulse,
  Mountain,
  Route,
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
import { useGarminLocalState } from "@/lib/garmin-storage";
import { buildPerformanceLabSnapshot } from "@/lib/performance-lab";
import { useRecoveryRecords } from "@/lib/recovery-storage";
import { useSessionLogs } from "@/lib/storage";

function formatPace(secondsPerKm: number | null) {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm)) return "—";
  const total = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function confidenceTone(confidence: "low" | "moderate" | "high") {
  if (confidence === "high") return "border-[var(--accent)] text-[var(--accent)]";
  if (confidence === "moderate") return "border-amber-300/50 text-amber-200";
  return "border-[var(--border)] text-[var(--muted)]";
}

export default function PerformanceLabPage() {
  const garmin = useGarminLocalState();
  const recovery = useRecoveryRecords();
  const logs = useSessionLogs();
  const snapshot = useMemo(
    () =>
      buildPerformanceLabSnapshot(
        garmin.activities.map((record) => record.activity),
        recovery,
        logs,
      ),
    [garmin.activities, logs, recovery],
  );

  const hasGarmin = snapshot.activities28d > 0;
  const maxCategorySessions = Math.max(
    1,
    ...snapshot.categories.map((category) => category.sessions),
  );
  const trendUp = (snapshot.distanceTrendPercent ?? 0) >= 0;
  const TrendIcon = trendUp ? TrendingUp : TrendingDown;

  return (
    <div className="grid gap-5">
      <header className="relative overflow-hidden border-b border-[var(--border)] pb-6">
        <div className="absolute right-0 top-0 hidden text-[var(--accent)] opacity-[0.08] sm:block">
          <Activity className="h-40 w-40" strokeWidth={1} aria-hidden="true" />
        </div>
        <Link
          href="/insights"
          className="relative inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Insights
        </Link>
        <div className="relative mt-3 max-w-3xl">
          <p className="tv-label text-[var(--accent)]">Performance Lab</p>
          <h1 className="mt-2 text-5xl font-black uppercase leading-[0.88] sm:text-7xl">
            Your engine,
            <span className="block text-[var(--accent)]">under load.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-bold text-[var(--muted)] sm:text-base">
            Garmin activity, recovery and TrainVault logs combined into a rolling athlete picture. No invented fitness score and no fake precision — every call below is traceable to the data you actually have.
          </p>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "28d running",
            value: `${snapshot.runningDistanceKm28d.toFixed(1)} km`,
            detail: `${snapshot.runningActivities28d} Garmin runs`,
            icon: Route,
          },
          {
            label: "Vertical",
            value: `${snapshot.elevationGainM28d.toLocaleString("en-GB")} m`,
            detail:
              snapshot.elevationPerKm === null
                ? "waiting for terrain data"
                : `${snapshot.elevationPerKm.toFixed(0)} m climb / km`,
            icon: Mountain,
          },
          {
            label: "Running time",
            value: `${snapshot.runningHours28d.toFixed(1)} h`,
            detail: `${snapshot.trainingDays28d} active Garmin days`,
            icon: Timer,
          },
          {
            label: "Weighted pace",
            value: formatPace(snapshot.averagePaceSecondsPerKm),
            detail:
              snapshot.averageHeartRateBpm === null
                ? "HR unavailable"
                : `${snapshot.averageHeartRateBpm.toFixed(0)} bpm weighted avg`,
            icon: Gauge,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="tv-card p-4">
              <div className="flex items-center justify-between">
                <p className="tv-label">{metric.label}</p>
                <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-3xl font-black tracking-tight text-[var(--accent)] sm:text-4xl">
                {metric.value}
              </p>
              <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">
                {metric.detail}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.6fr_0.8fr]">
        <article className="tv-card overflow-hidden p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Eight-week engine trace</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Distance meets climbing</h2>
            </div>
            <span className="text-xs font-black uppercase text-[var(--muted)]">
              Garmin running only
            </span>
          </div>
          <div className="mt-5 h-80 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 900, height: 320 }}
            >
              <ComposedChart data={snapshot.weekly} margin={{ left: -18, right: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="distance"
                  tick={{ fill: "#a3a3a3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="elevation"
                  orientation="right"
                  tick={{ fill: "#737373", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#050505",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 4,
                  }}
                />
                <Bar
                  yAxisId="elevation"
                  dataKey="elevationM"
                  name="Elevation m"
                  fill="rgba(255,255,255,0.18)"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="distance"
                  type="monotone"
                  dataKey="distanceKm"
                  name="Distance km"
                  stroke="#d7ff2f"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
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
            {snapshot.distanceTrendPercent === null
              ? "—"
              : `${snapshot.distanceTrendPercent > 0 ? "+" : ""}${snapshot.distanceTrendPercent.toFixed(0)}%`}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Current 7d</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">
                {snapshot.current7dDistanceKm.toFixed(1)} km
              </p>
            </div>
            <div className="border border-[var(--border)] bg-black/50 p-3">
              <p className="tv-label">Previous 7d</p>
              <p className="mt-1 text-2xl font-black">
                {snapshot.previous7dDistanceKm.toFixed(1)} km
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs font-bold text-[var(--muted)]">
            This is a workload comparison, not a recommendation to increase or decrease mileage by itself.
          </p>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.35fr_0.85fr]">
        <article className="tv-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Recovery trace</p>
              <h2 className="mt-1 text-2xl font-black uppercase">HRV, resting HR and sleep</h2>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
              <HeartPulse className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              {snapshot.recoveryDays14d}/14 days captured
            </span>
          </div>
          {snapshot.recovery.length > 0 ? (
            <div className="mt-5 h-72 min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 840, height: 288 }}
              >
                <ComposedChart data={snapshot.recovery} margin={{ left: -18, right: 2 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#a3a3a3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="physiology"
                    tick={{ fill: "#a3a3a3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="score"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fill: "#737373", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#050505",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 4,
                    }}
                  />
                  <Line
                    yAxisId="physiology"
                    type="monotone"
                    dataKey="hrvMs"
                    name="HRV ms"
                    stroke="#d7ff2f"
                    strokeWidth={2.5}
                    connectNulls
                    dot={false}
                  />
                  <Line
                    yAxisId="physiology"
                    type="monotone"
                    dataKey="restingHeartRate"
                    name="Resting HR"
                    stroke="#ffffff"
                    strokeOpacity={0.55}
                    strokeWidth={2}
                    connectNulls
                    dot={false}
                  />
                  <Bar
                    yAxisId="score"
                    dataKey="sleepScore"
                    name="Sleep score"
                    fill="rgba(255,255,255,0.12)"
                    radius={[2, 2, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-6 text-sm font-bold text-[var(--muted)]">
              Recovery data will appear here after Garmin recovery sync or manual check-ins begin building a streak.
            </div>
          )}
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="tv-label text-[var(--accent)]">Hybrid bank</p>
              <h2 className="mt-1 text-2xl font-black uppercase">What you actually logged</h2>
            </div>
            <Zap className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Last 28 days · TrainVault session logs. Kept separate from Garmin activity volume to avoid double counting.
          </p>
          {snapshot.categories.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {snapshot.categories.map((category) => (
                <div key={category.category}>
                  <div className="flex items-center justify-between gap-3 text-xs font-black uppercase">
                    <span>{category.category}</span>
                    <span className="text-[var(--muted)]">
                      {category.sessions} sessions · {category.minutes} min
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden bg-white/10">
                    <div
                      className="h-full bg-[var(--accent)]"
                      style={{
                        width: `${Math.max(8, (category.sessions / maxCategorySessions) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              Complete or manually log sessions to build the hybrid training split.
            </p>
          )}
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {snapshot.signals.map((signal) => (
          <article key={signal.title} className="tv-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="tv-label text-[var(--accent)]">TrainVault signal</p>
              <span
                className={`rounded-sm border px-2 py-1 text-[0.65rem] font-black uppercase ${confidenceTone(signal.confidence)}`}
              >
                {signal.confidence}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-black uppercase">{signal.title}</h2>
            <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
              {signal.body}
            </p>
          </article>
        ))}
      </section>

      <section className="tv-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Recent Garmin feed</p>
            <h2 className="mt-1 text-2xl font-black uppercase">The evidence underneath the charts</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
            <Watch className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            {garmin.lastSyncedAt ? `Synced ${formatDate(garmin.lastSyncedAt)}` : "Not synced yet"}
          </div>
        </div>

        {snapshot.recentActivities.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {snapshot.recentActivities.map((activity, index) => {
              const date = activity.localStartTime ?? activity.startTime;
              return (
                <article
                  key={activity.activityId ?? `${date}-${index}`}
                  className="border border-[var(--border)] bg-black/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tv-label">{formatDate(date)}</p>
                      <h3 className="mt-1 truncate text-sm font-black uppercase">
                        {activity.title || activity.activityType || "Garmin activity"}
                      </h3>
                    </div>
                    <Activity className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="tv-label">Distance</p>
                      <p className="mt-1 font-black">
                        {activity.distanceMeters === null
                          ? "—"
                          : `${(activity.distanceMeters / 1_000).toFixed(1)} km`}
                      </p>
                    </div>
                    <div>
                      <p className="tv-label">Pace</p>
                      <p className="mt-1 font-black">
                        {formatPace(activity.averagePaceSecondsPerKm)}
                      </p>
                    </div>
                    <div>
                      <p className="tv-label">HR</p>
                      <p className="mt-1 font-black">
                        {activity.averageHeartRateBpm === null
                          ? "—"
                          : `${Math.round(activity.averageHeartRateBpm)}`}
                      </p>
                    </div>
                    <div>
                      <p className="tv-label">Climb</p>
                      <p className="mt-1 font-black">
                        {activity.elevationGainMeters === null
                          ? "—"
                          : `${Math.round(activity.elevationGainMeters)} m`}
                      </p>
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
              Open Log and run Sync latest. Once activities arrive, this page lights up automatically.
            </p>
            <Link href="/log" className="tv-button-primary mt-4">
              Open Garmin sync
            </Link>
          </div>
        )}
      </section>

      {!hasGarmin ? (
        <section className="border border-[rgba(215,255,47,0.35)] bg-[rgba(215,255,47,0.06)] p-4">
          <div className="flex items-start gap-3">
            <Watch className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <p className="tv-label text-[var(--accent)]">Performance Lab is ready</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                The analytics layer is installed; it simply refuses to hallucinate a dashboard before real Garmin data arrives. Sync a few activities and recovery days and the blank state becomes your athlete history.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
