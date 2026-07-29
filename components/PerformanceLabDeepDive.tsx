"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Gauge,
  HeartPulse,
  Mountain,
  Route,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
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
  buildPerformanceLabV2Snapshot,
  type PerformanceSignalV2,
} from "@/lib/performance-lab-v2";
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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatSigned(value: number | null, suffix = "") {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}${suffix}`;
}

function signalTone(signal: PerformanceSignalV2) {
  if (signal.status === "positive") {
    return "border-[rgba(215,255,47,0.45)] bg-[rgba(215,255,47,0.05)]";
  }
  if (signal.status === "watch") {
    return "border-amber-300/40 bg-amber-300/[0.04]";
  }
  return "border-[var(--border)] bg-[var(--surface)]";
}

function confidenceTone(confidence: PerformanceSignalV2["confidence"]) {
  if (confidence === "high") return "text-[var(--accent)] border-[var(--accent)]";
  if (confidence === "moderate") return "text-amber-200 border-amber-300/50";
  return "text-[var(--muted)] border-[var(--border)]";
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-[var(--border)] bg-black/50 p-3">
      <p className="tv-label">{label}</p>
      <p className="mt-1 text-2xl font-black text-[var(--accent)]">{value}</p>
      {detail ? (
        <p className="mt-1 text-[0.68rem] font-bold uppercase text-[var(--muted)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default function PerformanceLabDeepDive() {
  const garmin = useGarminLocalState();
  const recovery = useRecoveryRecords();
  const logs = useSessionLogs();
  const snapshot = useMemo(
    () =>
      buildPerformanceLabV2Snapshot(
        garmin.activities.map((record) => record.activity),
        recovery,
        logs,
      ),
    [garmin.activities, logs, recovery],
  );

  const comparison = snapshot.paceHeartRate;
  const paceImproved = (comparison.paceDeltaSecondsPerKm ?? 0) < 0;
  const PaceIcon = paceImproved ? TrendingUp : TrendingDown;
  const hasDailyLoad = snapshot.dailyLoad.some(
    (day) => day.garminMinutes > 0 || day.manualMinutes > 0 || day.runKm > 0,
  );

  return (
    <section className="grid gap-5 border-t border-[var(--border)] pt-7">
      <header className="relative overflow-hidden border border-[rgba(215,255,47,0.25)] bg-[rgba(215,255,47,0.035)] p-5">
        <BrainCircuit
          className="absolute -right-5 -top-5 h-36 w-36 text-[var(--accent)] opacity-[0.05]"
          strokeWidth={1}
          aria-hidden="true"
        />
        <div className="relative max-w-4xl">
          <p className="tv-label text-[var(--accent)]">Adaptation deep dive</p>
          <h2 className="mt-2 text-3xl font-black uppercase leading-none sm:text-5xl">
            Is the work becoming fitness?
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
            This layer looks for overlap between training volume, run efficiency, recovery and deliberate TrainVault logs. It will show comparisons only when the sample is genuinely comparable.
          </p>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.45fr_0.85fr]">
        <article className="tv-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Fourteen-day load map</p>
              <h3 className="mt-1 text-2xl font-black uppercase">Garmin, running and manual work</h3>
            </div>
            <span className="text-xs font-black uppercase text-[var(--muted)]">
              Parallel evidence · never blindly summed
            </span>
          </div>

          {hasDailyLoad ? (
            <div className="mt-5 h-80 min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 900, height: 320 }}
              >
                <ComposedChart data={snapshot.dailyLoad} margin={{ left: -18, right: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#a3a3a3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="minutes"
                    tick={{ fill: "#a3a3a3", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="distance"
                    orientation="right"
                    tick={{ fill: "#d7ff2f", fontSize: 10 }}
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
                    yAxisId="minutes"
                    dataKey="garminMinutes"
                    name="Garmin min"
                    fill="rgba(255,255,255,0.18)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    yAxisId="minutes"
                    dataKey="manualMinutes"
                    name="TrainVault min"
                    fill="rgba(215,255,47,0.28)"
                    radius={[2, 2, 0, 0]}
                  />
                  <Line
                    yAxisId="distance"
                    type="monotone"
                    dataKey="runKm"
                    name="Run km"
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
              <Activity className="mx-auto h-8 w-8 text-[var(--accent)]" aria-hidden="true" />
              <p className="mt-3 text-lg font-black uppercase">The load map is waiting</p>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                Garmin activities and completed TrainVault sessions will appear side by side without pretending they are independent when they describe the same workout.
              </p>
            </div>
          )}
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent)] text-black">
              <PaceIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="tv-label text-[var(--accent)]">Efficiency checkpoint</p>
              <h3 className="text-xl font-black uppercase">Pace against heart rate</h3>
            </div>
          </div>

          {comparison.comparable ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Fact
                  label="Current pace"
                  value={formatPace(comparison.currentPaceSecondsPerKm)}
                  detail={`${comparison.currentRuns} comparable runs`}
                />
                <Fact
                  label="Previous pace"
                  value={formatPace(comparison.previousPaceSecondsPerKm)}
                  detail={`${comparison.previousRuns} comparable runs`}
                />
                <Fact
                  label="Pace delta"
                  value={formatSigned(comparison.paceDeltaSecondsPerKm, " sec/km")}
                  detail="negative is faster"
                />
                <Fact
                  label="HR delta"
                  value={formatSigned(comparison.heartRateDeltaBpm, " bpm")}
                  detail="context, not a verdict"
                />
              </div>
              <p className="mt-4 text-xs font-bold leading-relaxed text-[var(--muted)]">
                Faster pace at similar or lower heart rate is useful evidence. Heat, hills, fatigue and session intent still matter, so TrainVault keeps this as a comparison rather than a universal fitness score.
              </p>
            </>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] p-5">
              <p className="text-lg font-black uppercase">Not comparable yet</p>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                Current window: {comparison.currentRuns} suitable runs. Previous window: {comparison.previousRuns}. TrainVault needs enough runs with usable pace and heart-rate data on both sides before making an efficiency call.
              </p>
            </div>
          )}
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Running profile</p>
              <h3 className="mt-1 text-2xl font-black uppercase">What the last 28 days actually contain</h3>
            </div>
            <Route className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact
              label="Average run"
              value={
                snapshot.run.averageRunDistanceKm === null
                  ? "—"
                  : `${snapshot.run.averageRunDistanceKm.toFixed(1)} km`
              }
            />
            <Fact
              label="Longest run"
              value={
                snapshot.run.longestRunDistanceKm === null
                  ? "—"
                  : `${snapshot.run.longestRunDistanceKm.toFixed(1)} km`
              }
              detail={
                snapshot.run.longestRunMinutes === null
                  ? undefined
                  : `${Math.round(snapshot.run.longestRunMinutes)} min`
              }
            />
            <Fact
              label="Run days"
              value={`${snapshot.run.days28d}`}
              detail={`${snapshot.run.activities28d} activities`}
            />
            <Fact
              label="Current 14d"
              value={`${snapshot.run.current14dDistanceKm.toFixed(1)} km`}
            />
            <Fact
              label="Previous 14d"
              value={`${snapshot.run.previous14dDistanceKm.toFixed(1)} km`}
            />
            <Fact
              label="Terrain"
              value={
                snapshot.run.elevationPerKm === null
                  ? "—"
                  : `${Math.round(snapshot.run.elevationPerKm)} m/km`
              }
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Fact
              label="Aerobic effect"
              value={
                snapshot.run.averageAerobicTrainingEffect === null
                  ? "—"
                  : snapshot.run.averageAerobicTrainingEffect.toFixed(1)
              }
              detail={`${snapshot.run.trainingEffectActivities} runs measured`}
            />
            <Fact
              label="Anaerobic effect"
              value={
                snapshot.run.averageAnaerobicTrainingEffect === null
                  ? "—"
                  : snapshot.run.averageAnaerobicTrainingEffect.toFixed(1)
              }
              detail="Garmin average"
            />
          </div>
        </article>

        <article className="tv-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Seven-day recovery averages</p>
              <h3 className="mt-1 text-2xl font-black uppercase">Is the work being absorbed?</h3>
            </div>
            <HeartPulse className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact
              label="HRV"
              value={
                snapshot.recovery.averageHrv7d === null
                  ? "—"
                  : `${Math.round(snapshot.recovery.averageHrv7d)} ms`
              }
              detail={
                snapshot.recovery.hrvDeltaVsBaselinePercent === null
                  ? "baseline unavailable"
                  : `${formatSigned(snapshot.recovery.hrvDeltaVsBaselinePercent, "%")} vs baseline`
              }
            />
            <Fact
              label="Resting HR"
              value={
                snapshot.recovery.averageRestingHeartRate7d === null
                  ? "—"
                  : `${Math.round(snapshot.recovery.averageRestingHeartRate7d)} bpm`
              }
              detail={
                snapshot.recovery.restingHeartRateDeltaVsBaseline === null
                  ? "baseline unavailable"
                  : `${formatSigned(snapshot.recovery.restingHeartRateDeltaVsBaseline, " bpm")} vs baseline`
              }
            />
            <Fact
              label="Sleep score"
              value={
                snapshot.recovery.averageSleepScore7d === null
                  ? "—"
                  : `${Math.round(snapshot.recovery.averageSleepScore7d)}`
              }
            />
            <Fact
              label="Sleep duration"
              value={
                snapshot.recovery.averageSleepHours7d === null
                  ? "—"
                  : `${snapshot.recovery.averageSleepHours7d.toFixed(1)} h`
              }
            />
            <Fact
              label="Body Battery"
              value={
                snapshot.recovery.averageBodyBattery7d === null
                  ? "—"
                  : `${Math.round(snapshot.recovery.averageBodyBattery7d)}`
              }
            />
            <Fact
              label="Readiness"
              value={
                snapshot.recovery.averageReadiness7d === null
                  ? "—"
                  : `${Math.round(snapshot.recovery.averageReadiness7d)}`
              }
              detail={`${snapshot.source.recoveryCoveragePercent}% coverage`}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <div>
              <p className="tv-label">Latest recovery</p>
              <p className="mt-1 text-sm font-black uppercase">
                {snapshot.recovery.latest
                  ? `${snapshot.recovery.latest.label} · readiness ${snapshot.recovery.latest.readiness ?? "—"}`
                  : "No recovery snapshot yet"}
              </p>
            </div>
            <Link href="/" className="tv-button-ghost">
              Open Today
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Evidence calls</p>
            <h3 className="mt-1 text-2xl font-black uppercase">What TrainVault can defend today</h3>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--muted)]">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Every call includes its evidence
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.signals.map((signal) => (
            <article key={signal.id} className={`border p-4 ${signalTone(signal)}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {signal.status === "positive" ? (
                    <TrendingUp className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                  ) : signal.status === "watch" ? (
                    <Gauge className="h-5 w-5 text-amber-200" aria-hidden="true" />
                  ) : (
                    <Zap className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                  )}
                  <p className="tv-label text-[var(--accent)]">Adaptation signal</p>
                </div>
                <span
                  className={`border px-2 py-1 text-[0.65rem] font-black uppercase ${confidenceTone(signal.confidence)}`}
                >
                  {signal.confidence}
                </span>
              </div>
              <h4 className="mt-3 text-xl font-black uppercase">{signal.title}</h4>
              <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">
                {signal.body}
              </p>
              <div className="mt-4 grid gap-1 border-t border-[var(--border)] pt-3">
                {signal.evidence.map((item) => (
                  <p key={item} className="text-[0.68rem] font-black uppercase text-[var(--muted)]">
                    · {item}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-black/40 p-4">
        <div>
          <p className="tv-label text-[var(--accent)]">Next evidence milestone</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Last activity {formatDate(snapshot.source.lastActivityAt)} · last classified run {formatDate(snapshot.source.lastRunAt)}. Keep Garmin synced and log session intent/RPE so future comparisons can separate adaptation from fatigue.
          </p>
        </div>
        <Link href="/coach" className="tv-button-primary">
          <BrainCircuit className="h-4 w-4" aria-hidden="true" />
          Ask Coach about this data
        </Link>
      </div>
    </section>
  );
}
