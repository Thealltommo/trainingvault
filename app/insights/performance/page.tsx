"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Database,
  Gauge,
  HeartPulse,
  Mountain,
  RefreshCw,
  Route,
  ShieldCheck,
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
import {
  buildPerformanceLabSnapshot,
  classifyActivityFamily,
  type ActivityFamily,
} from "@/lib/performance-lab";
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

function formatMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function coveragePercent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function confidenceTone(confidence: "low" | "moderate" | "high") {
  if (confidence === "high") return "border-[var(--accent)] text-[var(--accent)]";
  if (confidence === "moderate") return "border-amber-300/50 text-amber-200";
  return "border-[var(--border)] text-[var(--muted)]";
}

function briefTone(tone: "build" | "hold" | "recover" | "observe") {
  if (tone === "build") return "border-[var(--accent)] bg-[rgba(215,255,47,0.08)]";
  if (tone === "hold") return "border-amber-300/40 bg-amber-300/[0.05]";
  if (tone === "recover") return "border-red-300/40 bg-red-300/[0.05]";
  return "border-[var(--border)] bg-[var(--surface)]";
}

function familyLabel(family: ActivityFamily) {
  switch (family) {
    case "run":
      return "Running";
    case "walk_hike":
      return "Walk / hike";
    case "cycle":
      return "Cycling";
    case "swim":
      return "Swimming";
    case "strength":
      return "Strength";
    case "cardio":
      return "Cardio";
    default:
      return "Other";
  }
}

function trendValue(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <article className="tv-card p-4">
      <div className="flex items-center justify-between">
        <p className="tv-label">{label}</p>
        <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-[var(--accent)] sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function RecoveryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-black/50 p-3">
      <p className="tv-label">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
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
  const hasWeeklyEvidence = snapshot.weekly.some((point) => point.activities > 0);
  const maxFamilyMinutes = Math.max(
    1,
    ...snapshot.activityFamilies.map((family) => family.minutes),
  );
  const maxCategoryMinutes = Math.max(
    1,
    ...snapshot.categories.map((category) => category.minutes),
  );
  const minutesTrendUp = (snapshot.durationTrendPercent ?? 0) >= 0;
  const MinutesTrendIcon = minutesTrendUp ? TrendingUp : TrendingDown;
  const latestRecovery = snapshot.latestRecovery;
  const coverageRows = [
    {
      label: "Duration",
      value: snapshot.coverage.timedActivities,
      icon: Timer,
    },
    {
      label: "Heart rate",
      value: snapshot.coverage.heartRateActivities,
      icon: HeartPulse,
    },
    {
      label: "Distance",
      value: snapshot.coverage.distanceActivities,
      icon: Route,
    },
    {
      label: "Elevation",
      value: snapshot.coverage.elevationActivities,
      icon: Mountain,
    },
    {
      label: "Training effect",
      value: snapshot.coverage.trainingEffectActivities,
      icon: Gauge,
    },
  ];

  return (
    <div className="grid gap-5">
      <header className="relative overflow-hidden border-b border-[var(--border)] pb-6">
        <div className="absolute right-0 top-0 hidden text-[var(--accent)] opacity-[0.06] sm:block">
          <Activity className="h-44 w-44" strokeWidth={1} aria-hidden="true" />
        </div>
        <Link
          href="/insights"
          className="relative inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Insights
        </Link>
        <div className="relative mt-3 max-w-4xl">
          <p className="tv-label text-[var(--accent)]">Performance command centre</p>
          <h1 className="mt-2 text-5xl font-black uppercase leading-[0.88] sm:text-7xl">
            Your engine,
            <span className="block text-[var(--accent)]">under load.</span>
          </h1>
          <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--muted)] sm:text-base">
            Garmin activity, recovery and TrainVault logs combined into one traceable athlete picture. All-training evidence stays visible even when running data is sparse; pace and mileage calls remain locked until real runs support them.
          </p>
        </div>
      </header>

      <section className={`border p-5 ${briefTone(snapshot.coachBrief.tone)}`}>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <p className="tv-label text-[var(--accent)]">{snapshot.coachBrief.eyebrow}</p>
            </div>
            <h2 className="mt-3 max-w-3xl text-3xl font-black uppercase leading-none sm:text-4xl">
              {snapshot.coachBrief.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
              {snapshot.coachBrief.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {snapshot.coachBrief.evidence.map((evidence) => (
                <span
                  key={evidence}
                  className="border border-[var(--border)] bg-black/40 px-3 py-2 text-xs font-black uppercase text-[var(--muted)]"
                >
                  {evidence}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/coach" className="tv-button-primary">
              Ask Coach
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/log" className="tv-button-ghost">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sync evidence
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="28d training"
          value={`${snapshot.totalHours28d.toFixed(1)} h`}
          detail={`${snapshot.activities28d} Garmin activities`}
          icon={Timer}
        />
        <MetricCard
          label="Active days"
          value={`${snapshot.trainingDays28d}`}
          detail="of the last 28 days"
          icon={CalendarDays}
        />
        <MetricCard
          label="28d running"
          value={`${snapshot.runningDistanceKm28d.toFixed(1)} km`}
          detail={`${snapshot.runningActivities28d} classified runs`}
          icon={Route}
        />
        <MetricCard
          label="Vertical"
          value={`${snapshot.elevationGainM28d.toLocaleString("en-GB")} m`}
          detail={
            snapshot.elevationPerKm === null
              ? "waiting for running terrain"
              : `${snapshot.elevationPerKm.toFixed(0)} m climb / km`
          }
          icon={Mountain}
        />
        <MetricCard
          label="Weighted pace"
          value={formatPace(snapshot.averagePaceSecondsPerKm)}
          detail={
            snapshot.averageHeartRateBpm === null
              ? "running HR unavailable"
              : `${snapshot.averageHeartRateBpm.toFixed(0)} bpm running average`
          }
          icon={Gauge}
        />
        <MetricCard
          label="Recovery"
          value={`${snapshot.recoveryDays14d}/14`}
          detail="days captured"
          icon={HeartPulse}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.55fr_0.85fr]">
        <article className="tv-card overflow-hidden p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Eight-week engine trace</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Training time meets running distance</h2>
            </div>
            <span className="text-xs font-black uppercase text-[var(--muted)]">
              Bars: all Garmin hours · line: running km
            </span>
          </div>
          {hasWeeklyEvidence ? (
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
                    tick={{ fill: "#d7ff2f", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="hours"
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
                    yAxisId="hours"
                    dataKey="trainingHours"
                    name="All training h"
                    fill="rgba(255,255,255,0.18)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="distance"
                    type="monotone"
                    dataKey="distanceKm"
                    name="Running km"
                    stroke="#d7ff2f"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-8 text-center">
              <Database className="mx-auto h-8 w-8 text-[var(--accent)]" aria-hidden="true" />
              <p className="mt-3 text-lg font-black uppercase">No timed Garmin evidence yet</p>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                Sync recent activities from Log. Strength, cardio, hiking and running all contribute to the bars; only genuine running contributes to the line.
              </p>
            </div>
          )}
        </article>

        <article className="tv-card border-[rgba(215,255,47,0.3)] p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black">
              <MinutesTrendIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Seven-day movement</p>
              <h2 className="text-xl font-black uppercase">Load, without fake precision</h2>
            </div>
          </div>

          <div className="mt-6 border-b border-[var(--border)] pb-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="tv-label">All training time</p>
                <p className="mt-1 text-5xl font-black">{trendValue(snapshot.durationTrendPercent)}</p>
              </div>
              <Timer className="h-7 w-7 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <RecoveryValue label="Current 7d" value={formatMinutes(snapshot.current7dMinutes)} />
              <RecoveryValue label="Previous 7d" value={formatMinutes(snapshot.previous7dMinutes)} />
            </div>
          </div>

          <div className="pt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="tv-label">Running distance</p>
                <p className="mt-1 text-4xl font-black text-[var(--accent)]">
                  {trendValue(snapshot.distanceTrendPercent)}
                </p>
              </div>
              <Route className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <RecoveryValue label="Current 7d" value={`${snapshot.current7dDistanceKm.toFixed(1)} km`} />
              <RecoveryValue label="Previous 7d" value={`${snapshot.previous7dDistanceKm.toFixed(1)} km`} />
            </div>
          </div>

          <p className="mt-4 text-xs font-bold text-[var(--muted)]">
            These are workload comparisons, not automatic instructions to add or remove volume.
          </p>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
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

          {snapshot.recovery.length >= 2 ? (
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
                    strokeOpacity={0.6}
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
          ) : latestRecovery ? (
            <div className="mt-5">
              <div className="border border-[rgba(215,255,47,0.25)] bg-black/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="tv-label text-[var(--accent)]">Latest recovery snapshot</p>
                    <h3 className="mt-1 text-xl font-black uppercase">{latestRecovery.label}</h3>
                  </div>
                  <span className="text-xs font-black uppercase text-[var(--muted)]">
                    A trend needs at least two days
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <RecoveryValue
                    label="Sleep"
                    value={latestRecovery.sleepScore == null ? "—" : `${Math.round(latestRecovery.sleepScore)}`}
                  />
                  <RecoveryValue
                    label="HRV"
                    value={latestRecovery.hrvMs == null ? "—" : `${Math.round(latestRecovery.hrvMs)} ms`}
                  />
                  <RecoveryValue
                    label="Resting HR"
                    value={latestRecovery.restingHeartRate == null ? "—" : `${Math.round(latestRecovery.restingHeartRate)} bpm`}
                  />
                  <RecoveryValue
                    label="Body Battery"
                    value={latestRecovery.bodyBattery == null ? "—" : `${Math.round(latestRecovery.bodyBattery)}`}
                  />
                  <RecoveryValue
                    label="Readiness"
                    value={latestRecovery.readiness == null ? "—" : `${Math.round(latestRecovery.readiness)}`}
                  />
                </div>
              </div>
              <Link href="/" className="tv-button-ghost mt-3">
                Build recovery streak
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-6 text-sm font-bold text-[var(--muted)]">
              Recovery data will appear here after Garmin recovery sync or manual check-ins begin building a streak.
            </div>
          )}
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Garmin activity bank</p>
              <h2 className="mt-1 text-2xl font-black uppercase">Where the time went</h2>
            </div>
            <Watch className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Last 28 days · classified from Garmin activity type and title. This keeps strength and cardio visible instead of pretending only running matters.
          </p>

          {snapshot.activityFamilies.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {snapshot.activityFamilies.map((family) => (
                <div key={family.family}>
                  <div className="flex items-center justify-between gap-3 text-xs font-black uppercase">
                    <span>{family.label}</span>
                    <span className="text-right text-[var(--muted)]">
                      {family.sessions} sessions · {family.minutes} min
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden bg-white/10">
                    <div
                      className="h-full bg-[var(--accent)]"
                      style={{
                        width: `${Math.max(6, (family.minutes / maxFamilyMinutes) * 100)}%`,
                      }}
                    />
                  </div>
                  {family.distanceKm > 0 || family.elevationM > 0 ? (
                    <p className="mt-1 text-[0.68rem] font-bold uppercase text-[var(--muted)]">
                      {family.distanceKm > 0 ? `${family.distanceKm.toFixed(1)} km` : ""}
                      {family.distanceKm > 0 && family.elevationM > 0 ? " · " : ""}
                      {family.elevationM > 0 ? `${family.elevationM} m climb` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              Sync Garmin activities to build the training-time mix.
            </p>
          )}
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">TrainVault hybrid bank</p>
              <h2 className="mt-1 text-2xl font-black uppercase">What you deliberately logged</h2>
            </div>
            <Zap className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Last 28 days · manual and completed TrainVault sessions. Kept separate from Garmin activity volume to avoid double counting.
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
                        width: `${Math.max(6, (category.minutes / maxCategoryMinutes) * 100)}%`,
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

        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Evidence quality</p>
              <h2 className="mt-1 text-2xl font-black uppercase">What Garmin can actually support</h2>
            </div>
            <Database className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs font-bold text-[var(--muted)]">
            Coverage is shown explicitly so missing metrics cannot masquerade as poor performance.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {coverageRows.map((row) => {
              const Icon = row.icon;
              const percent = coveragePercent(row.value, snapshot.coverage.totalActivities);
              return (
                <div key={row.label} className="border border-[var(--border)] bg-black/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                      <p className="tv-label">{row.label}</p>
                    </div>
                    <span className="text-sm font-black">{percent}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden bg-white/10">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-[0.68rem] font-bold uppercase text-[var(--muted)]">
                    {row.value} of {snapshot.coverage.totalActivities} activities
                  </p>
                </div>
              );
            })}
            <div className="border border-[rgba(215,255,47,0.25)] bg-[rgba(215,255,47,0.04)] p-3 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="tv-label text-[var(--accent)]">Aerobic training effect</p>
                  <p className="mt-1 text-2xl font-black">
                    {snapshot.averageAerobicTrainingEffect === null
                      ? "Not available"
                      : `${snapshot.averageAerobicTrainingEffect.toFixed(1)} weighted average`}
                  </p>
                </div>
                <p className="text-xs font-black uppercase text-[var(--muted)]">
                  {snapshot.highAerobicEffectActivities28d} sessions at 3.5+
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <h2 className="mt-1 text-2xl font-black uppercase">The evidence underneath the calls</h2>
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
              const family = classifyActivityFamily(activity);
              const durationMinutes =
                (activity.durationSeconds ?? activity.movingDurationSeconds ?? 0) / 60;
              return (
                <article
                  key={activity.activityId ?? `${date}-${index}`}
                  className="border border-[var(--border)] bg-black/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tv-label">{formatDate(date)} · {familyLabel(family)}</p>
                      <h3 className="mt-1 truncate text-sm font-black uppercase">
                        {activity.title || activity.activityType || "Garmin activity"}
                      </h3>
                    </div>
                    <Activity className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
                    <div>
                      <p className="tv-label">Time</p>
                      <p className="mt-1 font-black">{formatMinutes(durationMinutes)}</p>
                    </div>
                    <div>
                      <p className="tv-label">Distance</p>
                      <p className="mt-1 font-black">
                        {(activity.distanceMeters ?? 0) <= 0
                          ? "—"
                          : `${((activity.distanceMeters ?? 0) / 1_000).toFixed(1)} km`}
                      </p>
                    </div>
                    <div>
                      <p className="tv-label">Pace</p>
                      <p className="mt-1 font-black">{formatPace(activity.averagePaceSecondsPerKm)}</p>
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
                      <p className="tv-label">Aerobic TE</p>
                      <p className="mt-1 font-black">
                        {activity.aerobicTrainingEffect === null
                          ? "—"
                          : activity.aerobicTrainingEffect.toFixed(1)}
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
                The analytics layer is installed; it simply refuses to hallucinate before real Garmin evidence arrives. Sync activities and recovery days and the blank state becomes your athlete history.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
