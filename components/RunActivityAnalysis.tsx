"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Footprints,
  Gauge,
  HeartPulse,
  MapPinned,
  Route,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useGarminLocalState } from "@/lib/garmin-storage";
import type { StructuredRunningWorkout } from "@/lib/garmin";
import {
  average,
  bestEffort,
  buildChartData,
  buildKilometreSplits,
  buildMovementSummary,
  expandStructuredSteps,
  interpolateClock,
  maximum,
  minimum,
  monotonicSamples,
  standardDeviation,
  targetPace,
  targetRead,
  type ActivityAnalysisPayload,
  type AnalysisPoint,
  type AnalysisSplit,
  type ChartDatum,
  type KilometreSplit,
  type MovementState,
  type MovementSummary,
} from "@/lib/run-activity-analysis";

type AxisMode = "distance" | "time";
type ActivityTab = "overview" | "stats" | "intervals" | "charts";
type IntervalFilter = "all" | "warmup" | "work" | "recovery" | "cooldown";

const CHART_COLOURS = {
  pace: "#58a6ff",
  heartRate: "#ff5f6d",
  cadence: "#e96cff",
  elevation: "#d7ff2f",
  temperature: "#b6bdc8",
};

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatPace(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}/km`;
}

function formatHeartRate(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)} bpm`;
}

function formatCadence(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${Math.round(value)} spm`;
}

function formatDistance(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "—";
  return meters >= 1_000
    ? `${(meters / 1_000).toFixed(2)} km`
    : `${Math.round(meters)} m`;
}

function formatSpeed(metersPerSecond: number | null | undefined) {
  if (
    metersPerSecond == null ||
    !Number.isFinite(metersPerSecond) ||
    metersPerSecond <= 0
  ) {
    return "—";
  }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatTarget(step: ReturnType<typeof targetPace>) {
  if (!step) return "—";
  return `${formatPace(step.fastest).replace("/km", "")}–${formatPace(step.slowest)}`;
}

function trainingEffectLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "No reading";
  if (value < 1) return "No meaningful benefit";
  if (value < 2) return "Minor benefit";
  if (value < 3) return "Maintaining";
  if (value < 4) return "Improving";
  if (value < 5) return "Highly improving";
  return "Overreaching stimulus";
}

function RouteTrace({ points }: { points: AnalysisPoint[] }) {
  const drawing = useMemo(() => {
    if (points.length < 2) return null;
    const width = 760;
    const height = 390;
    const padding = 30;
    const averageLat =
      points.reduce((total, point) => total + point.lat, 0) / points.length;
    const lonScale = Math.max(
      0.2,
      Math.cos((averageLat * Math.PI) / 180),
    );
    const xs = points.map((point) => point.lon * lonScale);
    const ys = points.map((point) => point.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(0.000001, maxX - minX);
    const spanY = Math.max(0.000001, maxY - minY);
    const scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const projected = points.map((point, index) => ({
      x: offsetX + (xs[index] - minX) * scale,
      y: height - (offsetY + (point.lat - minY) * scale),
    }));
    return {
      width,
      height,
      polyline: projected
        .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(" "),
      start: projected[0],
      finish: projected.at(-1)!,
    };
  }, [points]);

  if (!drawing) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#080b08]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Route</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            Private Garmin GPS trace · {points.length} points
          </p>
        </div>
        <MapPinned className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="relative min-h-64 overflow-hidden bg-[radial-gradient(circle_at_68%_28%,rgba(215,255,47,0.11),transparent_35%),linear-gradient(145deg,#0c120c,#060706)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:32px_32px]" />
        <svg
          viewBox={`0 0 ${drawing.width} ${drawing.height}`}
          className="relative h-full min-h-64 w-full p-4"
          role="img"
          aria-label="Recorded running route"
        >
          <polyline
            points={drawing.polyline}
            fill="none"
            stroke="rgba(215,255,47,0.17)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={drawing.polyline}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={drawing.start.x}
            cy={drawing.start.y}
            r="8"
            fill="#070807"
            stroke="var(--accent)"
            strokeWidth="4"
          />
          <circle
            cx={drawing.finish.x}
            cy={drawing.finish.y}
            r="8"
            fill="var(--accent)"
            stroke="#070807"
            strokeWidth="4"
          />
        </svg>
      </div>
    </section>
  );
}

function AnalysisChart({
  title,
  subtitle,
  data,
  dataKey,
  formatter,
  colour,
  axisMode,
  averageValue,
  reversed = false,
}: {
  title: string;
  subtitle: string;
  data: ChartDatum[];
  dataKey: "pace" | "heartRate" | "cadence" | "elevation" | "temperature";
  formatter: (value: number) => string;
  colour: string;
  axisMode: AxisMode;
  averageValue?: number | null;
  reversed?: boolean;
}) {
  const values = data
    .map((datum) => datum[dataKey])
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length < 3) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max(1, (high - low) * 0.12);
  const xKey = axisMode === "distance" ? "distanceKm" : "elapsedMinutes";
  const gradientId = `run-${dataKey}`;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-black text-[var(--text)]">{title}</p>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black" style={{ color: colour }}>
            {formatter(averageValue ?? average(values) ?? 0)}
          </p>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
            Average
          </p>
        </div>
      </div>
      <div className="mt-4 h-56 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colour} stopOpacity={0.55} />
                <stop offset="100%" stopColor={colour} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
            <XAxis
              dataKey={xKey}
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) =>
                axisMode === "distance"
                  ? Number(value).toFixed(1)
                  : formatDuration(Number(value) * 60)
              }
              tick={{ fill: "#8d948d", fontSize: 10, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[Math.max(0, low - padding), high + padding]}
              reversed={reversed}
              tickFormatter={(value) =>
                formatter(Number(value))
                  .replace("/km", "")
                  .replace(" bpm", "")
                  .replace(" spm", "")
              }
              tick={{ fill: "#8d948d", fontSize: 10, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            {averageValue != null ? (
              <ReferenceLine
                y={averageValue}
                stroke="rgba(255,255,255,0.58)"
                strokeDasharray="5 4"
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.35)", strokeWidth: 1 }}
              contentStyle={{
                background: "#090b09",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                color: "#f5f7f3",
                fontSize: 12,
                fontWeight: 800,
              }}
              labelFormatter={(value) =>
                axisMode === "distance"
                  ? `${Number(value).toFixed(2)} km`
                  : formatDuration(Number(value) * 60)
              }
              formatter={(value) => [formatter(Number(value)), title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              connectNulls
              stroke={colour}
              strokeWidth={2.4}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: colour, stroke: "#080a08" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[0.6rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
        {axisMode === "distance" ? "Distance (km)" : "Elapsed time"}
      </p>
    </section>
  );
}

function SplitBars({ splits }: { splits: KilometreSplit[] }) {
  if (splits.length === 0) return null;
  const paces = splits.map((split) => split.paceSecondsPerKm);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const range = Math.max(1, slowest - fastest);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)]">
      <div className="flex items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <div>
          <p className="tv-label text-[var(--accent)]">Splits</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight">Every kilometre</h3>
        </div>
        <p className="text-xs font-bold text-[var(--muted)]">
          Pace · HR · cadence · elevation
        </p>
      </div>
      <div className="divide-y divide-[var(--border)] px-4 sm:px-5">
        {splits.map((split) => {
          const strength = (slowest - split.paceSecondsPerKm) / range;
          const width = 48 + strength * 52;
          return (
            <div
              key={`${split.index}-${split.label}`}
              className="grid grid-cols-[2.3rem_minmax(0,1fr)_4.2rem] items-center gap-3 py-3"
            >
              <div>
                <p className="text-sm font-black text-[var(--text)]">{split.label}</p>
                {!split.complete ? (
                  <p className="text-[0.55rem] font-black uppercase text-[var(--muted)]">
                    partial
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="h-7 rounded-sm bg-white/[0.045]">
                  <div
                    className="grid h-full min-w-16 place-items-end rounded-sm bg-[linear-gradient(90deg,#397fc8,#58a6ff)] px-2 text-[0.64rem] font-black text-white"
                    style={{ width: `${width}%` }}
                  >
                    {formatPace(split.paceSecondsPerKm).replace("/km", "")}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] font-bold text-[var(--muted)]">
                  <span>{formatHeartRate(split.averageHeartRateBpm)}</span>
                  <span>{formatCadence(split.averageCadenceSpm)}</span>
                  {split.elevationDeltaMeters != null ? (
                    <span>
                      {split.elevationDeltaMeters >= 0 ? "+" : ""}
                      {Math.round(split.elevationDeltaMeters)} m
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-right text-sm font-black text-[var(--text)]">
                {formatDuration(split.durationSeconds)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)]">
      <h3 className="border-b border-[var(--border)] bg-black/25 px-4 py-3 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
        {title}
      </h3>
      <dl className="divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-4 py-3.5"
          >
            <dt className="text-sm font-bold text-[var(--muted)]">{row.label}</dt>
            <dd className="text-right text-sm font-black text-[var(--text)]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TrainingEffect({
  aerobic,
  anaerobic,
}: {
  aerobic: number | null | undefined;
  anaerobic: number | null | undefined;
}) {
  const items = [
    { label: "Aerobic", value: aerobic, colour: "var(--accent)" },
    { label: "Anaerobic", value: anaerobic, colour: "#58a6ff" },
  ];
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <h3 className="text-xl font-black">Training effect</h3>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {items.map((item) => {
          const bounded = Math.min(5, Math.max(0, item.value ?? 0));
          return (
            <div key={item.label}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.13em] text-[var(--muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-3xl font-black" style={{ color: item.colour }}>
                    {item.value?.toFixed(1) ?? "—"}
                  </p>
                </div>
                <p className="max-w-32 text-right text-xs font-bold text-[var(--muted)]">
                  {trainingEffectLabel(item.value)}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(bounded / 5) * 100}%`,
                    background: item.colour,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MovementTimeline({ summary }: { summary: MovementSummary }) {
  const total = summary.runSeconds + summary.walkSeconds + summary.idleSeconds;
  if (total <= 0) return null;
  const colours: Record<MovementState, string> = {
    run: "var(--accent)",
    walk: "#58a6ff",
    idle: "#555c57",
  };
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black">Run / walk</p>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">
            Derived from movement, cadence and pace channels
          </p>
        </div>
        <Footprints className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          ["Run", summary.runSeconds],
          ["Walk", summary.walkSeconds],
          ["Idle", summary.idleSeconds],
        ].map(([label, seconds]) => (
          <div key={String(label)}>
            <p className="text-[0.58rem] font-black uppercase text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-1 text-xl font-black">{formatDuration(Number(seconds))}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-10 overflow-hidden rounded-lg bg-white/[0.04]">
        {summary.segments.map((segment, index) => (
          <div
            key={`${segment.state}-${index}`}
            title={`${segment.state}: ${formatDuration(segment.seconds)}`}
            style={{
              width: `${(segment.seconds / total) * 100}%`,
              background: colours[segment.state],
            }}
            className="min-w-px opacity-90"
          />
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[0.58rem] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
        {(["run", "walk", "idle"] as MovementState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: colours[state] }}
            />
            {state}
          </span>
        ))}
      </div>
    </section>
  );
}

function IntervalsPanel({
  splits,
  structuredWorkout,
}: {
  splits: AnalysisSplit[];
  structuredWorkout: StructuredRunningWorkout | null;
}) {
  const [filter, setFilter] = useState<IntervalFilter>("all");
  const expanded = expandStructuredSteps(structuredWorkout);
  const matched = expanded.length === splits.length ? expanded : [];
  const rows = splits.map((split, index) => {
    const matchedStep = matched[index];
    const rawType = (split.splitType ?? "").toLowerCase();
    let phase: Exclude<IntervalFilter, "all"> = "work";
    if (matchedStep) phase = matchedStep.step.phase;
    else if (rawType.includes("warm")) phase = "warmup";
    else if (rawType.includes("recover") || rawType.includes("rest")) {
      phase = "recovery";
    } else if (rawType.includes("cool")) phase = "cooldown";
    return {
      split,
      matchedStep,
      phase,
      label: matchedStep?.label ?? split.splitType ?? `Interval ${split.splitIndex}`,
    };
  });
  const visible = filter === "all" ? rows : rows.filter((row) => row.phase === filter);
  const filters: Array<{ key: IntervalFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "warmup", label: "Warm up" },
    { key: "work", label: "Run" },
    { key: "recovery", label: "Recovery" },
    { key: "cooldown", label: "Cool down" },
  ];

  if (splits.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--border)] p-5 text-sm font-bold text-[var(--muted)]">
        Garmin has not returned interval rows for this activity.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)]">
      <div className="border-b border-[var(--border)] p-4 sm:p-5">
        <p className="tv-label text-[var(--accent)]">Workout execution</p>
        <h3 className="mt-1 text-2xl font-black">Intervals</h3>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black ${
                filter === item.key
                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                  : "border-[var(--border)] bg-black/25 text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[var(--border)] md:hidden">
        {visible.map(({ split, matchedStep, phase, label }) => {
          const read = targetRead(split, matchedStep?.step);
          return (
            <article key={`${split.splitIndex}-${label}`} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                    {phase}
                  </p>
                  <h4 className="mt-1 text-lg font-black">{label}</h4>
                </div>
                {read ? (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.6rem] font-black ${
                      read === "On target"
                        ? "bg-[var(--accent)] text-black"
                        : "bg-white/10 text-[var(--text)]"
                    }`}
                  >
                    {read}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  ["Time", formatDuration(split.durationSeconds)],
                  ["Distance", formatDistance(split.distanceMeters)],
                  ["Pace", formatPace(split.averagePaceSecondsPerKm)],
                  ["Avg HR", formatHeartRate(split.averageHeartRateBpm)],
                  ["Max HR", formatHeartRate(split.maxHeartRateBpm)],
                  ["Cadence", formatCadence(split.averageCadenceSpm)],
                ].map(([itemLabel, value]) => (
                  <div key={itemLabel}>
                    <p className="text-[0.55rem] font-black uppercase text-[var(--muted)]">
                      {itemLabel}
                    </p>
                    <p className="mt-1 text-sm font-black">{value}</p>
                  </div>
                ))}
              </div>
              {matchedStep ? (
                <p className="mt-3 text-xs font-bold text-[var(--muted)]">
                  Target {formatTarget(targetPace(matchedStep.step))}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)] text-[0.6rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              <th className="px-5 py-3">Step</th>
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Distance</th>
              <th className="px-3 py-3">Pace</th>
              <th className="px-3 py-3">Avg HR</th>
              <th className="px-3 py-3">Max HR</th>
              <th className="px-3 py-3">Cadence</th>
              <th className="px-5 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ split, matchedStep, phase, label }) => {
              const read = targetRead(split, matchedStep?.step);
              return (
                <tr
                  key={`${split.splitIndex}-${label}`}
                  className={`border-b border-[var(--border)] last:border-b-0 ${
                    phase === "work" ? "bg-[rgba(215,255,47,0.035)]" : ""
                  }`}
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-black">{label}</p>
                    <p className="text-[0.56rem] font-black uppercase text-[var(--muted)]">
                      {phase}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-sm font-bold">{formatDuration(split.durationSeconds)}</td>
                  <td className="px-3 py-3 text-sm font-bold">{formatDistance(split.distanceMeters)}</td>
                  <td className="px-3 py-3 text-sm font-black">{formatPace(split.averagePaceSecondsPerKm)}</td>
                  <td className="px-3 py-3 text-sm font-bold">{formatHeartRate(split.averageHeartRateBpm)}</td>
                  <td className="px-3 py-3 text-sm font-bold">{formatHeartRate(split.maxHeartRateBpm)}</td>
                  <td className="px-3 py-3 text-sm font-bold">{formatCadence(split.averageCadenceSpm)}</td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-bold">
                      {formatTarget(targetPace(matchedStep?.step))}
                    </p>
                    {read ? (
                      <p
                        className={`mt-1 text-[0.58rem] font-black uppercase ${
                          read === "On target"
                            ? "text-[var(--accent)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {read}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RunActivityAnalysis({
  activityId,
  structuredWorkout,
}: {
  activityId: string;
  structuredWorkout: StructuredRunningWorkout | null;
}) {
  const [analysis, setAnalysis] = useState<ActivityAnalysisPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [tab, setTab] = useState<ActivityTab>("overview");
  const [axisMode, setAxisMode] = useState<AxisMode>("time");
  const garmin = useGarminLocalState();
  const activity =
    garmin.activities.find(
      (record) => record.activity.activityId === activityId,
    )?.activity ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/garmin/activities/${encodeURIComponent(activityId)}/route`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Activity analysis unavailable");
        return (await response.json()) as ActivityAnalysisPayload;
      })
      .then((payload) => {
        setAnalysis(payload);
        setStatus(
          payload.samples.length || payload.splits.length || payload.points.length
            ? "ready"
            : "empty",
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("empty");
      });
    return () => controller.abort();
  }, [activityId]);

  const chartData = useMemo(
    () => buildChartData(analysis?.samples ?? []),
    [analysis?.samples],
  );
  const kilometreSplits = useMemo(
    () => buildKilometreSplits(analysis?.samples ?? []),
    [analysis?.samples],
  );
  const movement = useMemo(
    () => buildMovementSummary(analysis?.samples ?? []),
    [analysis?.samples],
  );

  const derived = useMemo(() => {
    const samples = analysis?.samples ?? [];
    const ordered = monotonicSamples(samples);
    const totalDistance =
      activity?.distanceMeters ?? ordered.at(-1)?.distanceMeters ?? null;
    const elapsed =
      ordered.at(-1)?.elapsedSeconds ?? activity?.durationSeconds ?? null;
    const moving =
      activity?.movingDurationSeconds ?? ordered.at(-1)?.movingSeconds ?? null;
    const averagePace =
      activity?.averagePaceSecondsPerKm ??
      (totalDistance && elapsed ? elapsed / (totalDistance / 1_000) : null);
    const movingPace =
      totalDistance && moving ? moving / (totalDistance / 1_000) : null;
    const validPaces = samples
      .map((sample) => sample.paceSecondsPerKm)
      .filter(
        (value): value is number =>
          value != null && value >= 120 && value <= 1_800,
      );
    const bestPace = minimum(validPaces);
    const averageCadence =
      activity?.averageCadenceSpm ??
      average(samples.map((sample) => sample.cadenceSpm));
    const maxCadence = maximum(samples.map((sample) => sample.cadenceSpm));
    const averageHr =
      activity?.averageHeartRateBpm ??
      average(samples.map((sample) => sample.heartRateBpm));
    const maxHr =
      activity?.maxHeartRateBpm ??
      maximum(samples.map((sample) => sample.heartRateBpm));
    const cadenceSd = standardDeviation(
      samples.map((sample) => sample.cadenceSpm),
    );
    const half = (totalDistance ?? 0) / 2;
    const startClock = ordered.length
      ? interpolateClock(ordered, ordered[0].distanceMeters ?? 0)
      : null;
    const halfClock = interpolateClock(ordered, half);
    const finishClock = interpolateClock(ordered, totalDistance ?? 0);
    const firstPace =
      startClock == null || halfClock == null || half <= 0
        ? null
        : (halfClock - startClock) / (half / 1_000);
    const secondPace =
      halfClock == null ||
      finishClock == null ||
      (totalDistance ?? 0) - half <= 0
        ? null
        : (finishClock - halfClock) /
          (((totalDistance ?? 0) - half) / 1_000);
    const firstHr = average(
      ordered
        .filter((sample) => (sample.distanceMeters ?? 0) <= half)
        .map((sample) => sample.heartRateBpm),
    );
    const secondHr = average(
      ordered
        .filter((sample) => (sample.distanceMeters ?? 0) > half)
        .map((sample) => sample.heartRateBpm),
    );

    return {
      totalDistance,
      elapsed,
      moving,
      averagePace,
      movingPace,
      bestPace,
      averageSpeed:
        activity?.averageSpeedMps ??
        (averagePace ? 1_000 / averagePace : null),
      movingSpeed: movingPace ? 1_000 / movingPace : null,
      maxSpeed: bestPace ? 1_000 / bestPace : null,
      averageCadence,
      maxCadence,
      cadenceVariation:
        averageCadence && cadenceSd
          ? (cadenceSd / averageCadence) * 100
          : null,
      averageHr,
      maxHr,
      minimumTemperature: minimum(
        samples.map((sample) => sample.temperatureC),
      ),
      maximumTemperature: maximum(
        samples.map((sample) => sample.temperatureC),
      ),
      best1k: bestEffort(samples, 1_000),
      best5k: bestEffort(samples, 5_000),
      firstHr,
      secondHr,
      hrDrift:
        firstHr == null || secondHr == null || firstHr <= 0
          ? null
          : ((secondHr - firstHr) / firstHr) * 100,
      paceChange:
        firstPace == null || secondPace == null
          ? null
          : secondPace - firstPace,
    };
  }, [activity, analysis?.samples]);

  if (status === "loading") {
    return (
      <section className="rounded-2xl border border-[var(--border)] p-5">
        <div className="h-5 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-white/[0.045]" />
      </section>
    );
  }

  if (status === "empty" || !analysis) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.72)] p-5">
        <p className="tv-label text-[var(--accent)]">Detailed run analysis</p>
        <h2 className="mt-2 text-2xl font-black">
          Waiting for Garmin chart data
        </h2>
        <p className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
          The activity summary is available, but Garmin has not returned its
          recorded samples or intervals yet. Refresh after the watch has fully
          uploaded the activity.
        </p>
      </section>
    );
  }

  const fastestSplit = kilometreSplits
    .filter((split) => split.complete)
    .sort(
      (first, second) =>
        first.paceSecondsPerKm - second.paceSecondsPerKm,
    )[0];
  const tabs: Array<{ key: ActivityTab; label: string; icon: typeof Route }> = [
    { key: "overview", label: "Overview", icon: Sparkles },
    { key: "stats", label: "Stats", icon: Gauge },
    { key: "intervals", label: "Intervals", icon: Timer },
    { key: "charts", label: "Charts", icon: BarChart3 },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(7,9,7,0.78)]">
      <header className="border-b border-[var(--border)] px-4 pb-0 pt-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Activity analysis</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">
              Your complete run
            </h2>
          </div>
          <p className="rounded-full border border-[var(--border)] bg-black/45 px-3 py-2 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
            {analysis.sourceSampleCount.toLocaleString("en-GB")} samples ·{" "}
            {analysis.availableChannels.length} channels
          </p>
        </div>
        <nav
          className="mt-5 flex gap-1 overflow-x-auto"
          aria-label="Activity analysis sections"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-black transition ${
                  tab === item.key
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="p-4 sm:p-6">
        {tab === "overview" ? (
          <div className="grid gap-5">
            {analysis.points.length > 1 ? (
              <RouteTrace points={analysis.points} />
            ) : null}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: "Fastest km",
                  value: fastestSplit
                    ? formatPace(fastestSplit.paceSecondsPerKm)
                    : "—",
                  detail: fastestSplit
                    ? `Split ${fastestSplit.index}`
                    : "No full kilometre",
                  icon: Zap,
                },
                {
                  label: "Best 1 km",
                  value: formatDuration(derived.best1k),
                  detail: derived.best1k
                    ? formatPace(derived.best1k)
                    : "Unavailable",
                  icon: Timer,
                },
                {
                  label: "Best 5 km",
                  value: formatDuration(derived.best5k),
                  detail: derived.best5k
                    ? formatPace((derived.best5k ?? 0) / 5)
                    : "Run shorter than 5 km",
                  icon: Route,
                },
                {
                  label: "HR drift",
                  value:
                    derived.hrDrift == null
                      ? "—"
                      : `${derived.hrDrift > 0 ? "+" : ""}${derived.hrDrift.toFixed(1)}%`,
                  detail:
                    derived.firstHr == null
                      ? "No complete HR trace"
                      : `${formatHeartRate(derived.firstHr)} → ${formatHeartRate(derived.secondHr)}`,
                  icon: HeartPulse,
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article
                    key={metric.label}
                    className="rounded-xl border border-[var(--border)] bg-black/30 p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                        {metric.label}
                      </p>
                      <Icon
                        className="h-4 w-4 text-[var(--accent)]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-3 text-xl font-black">{metric.value}</p>
                    <p className="mt-1 text-[0.62rem] font-bold text-[var(--muted)]">
                      {metric.detail}
                    </p>
                  </article>
                );
              })}
            </section>
            <TrainingEffect
              aerobic={activity?.aerobicTrainingEffect}
              anaerobic={activity?.anaerobicTrainingEffect}
            />
            <SplitBars splits={kilometreSplits} />
          </div>
        ) : null}

        {tab === "stats" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <StatSection
              title="Pace"
              rows={[
                { label: "Average pace", value: formatPace(derived.averagePace) },
                {
                  label: "Average moving pace",
                  value: formatPace(derived.movingPace),
                },
                { label: "Best pace", value: formatPace(derived.bestPace) },
              ]}
            />
            <StatSection
              title="Speed"
              rows={[
                {
                  label: "Average speed",
                  value: formatSpeed(derived.averageSpeed),
                },
                {
                  label: "Average moving speed",
                  value: formatSpeed(derived.movingSpeed),
                },
                {
                  label: "Maximum speed",
                  value: formatSpeed(derived.maxSpeed),
                },
              ]}
            />
            <StatSection
              title="Timing"
              rows={[
                {
                  label: "Total time",
                  value: formatDuration(
                    activity?.durationSeconds ?? derived.elapsed,
                  ),
                },
                { label: "Moving time", value: formatDuration(derived.moving) },
                { label: "Elapsed time", value: formatDuration(derived.elapsed) },
              ]}
            />
            <StatSection
              title="Run / walk detection"
              rows={[
                { label: "Run time", value: formatDuration(movement.runSeconds) },
                { label: "Walk time", value: formatDuration(movement.walkSeconds) },
                { label: "Idle time", value: formatDuration(movement.idleSeconds) },
              ]}
            />
            <StatSection
              title="Heart rate"
              rows={[
                {
                  label: "Average heart rate",
                  value: formatHeartRate(derived.averageHr),
                },
                {
                  label: "Maximum heart rate",
                  value: formatHeartRate(derived.maxHr),
                },
                {
                  label: "Second-half drift",
                  value:
                    derived.hrDrift == null
                      ? "—"
                      : `${derived.hrDrift > 0 ? "+" : ""}${derived.hrDrift.toFixed(1)}%`,
                },
              ]}
            />
            <StatSection
              title="Cadence"
              rows={[
                {
                  label: "Average cadence",
                  value: formatCadence(derived.averageCadence),
                },
                {
                  label: "Maximum cadence",
                  value: formatCadence(derived.maxCadence),
                },
                {
                  label: "Variation",
                  value:
                    derived.cadenceVariation == null
                      ? "—"
                      : `${derived.cadenceVariation.toFixed(1)}%`,
                },
              ]}
            />
            <StatSection
              title="Elevation"
              rows={[
                {
                  label: "Ascent",
                  value:
                    activity?.elevationGainMeters == null
                      ? "—"
                      : `${Math.round(activity.elevationGainMeters)} m`,
                },
                {
                  label: "Descent",
                  value:
                    activity?.elevationLossMeters == null
                      ? "—"
                      : `${Math.round(activity.elevationLossMeters)} m`,
                },
                {
                  label: "Distance",
                  value: formatDistance(derived.totalDistance),
                },
              ]}
            />
            <StatSection
              title="Environment & load"
              rows={[
                {
                  label: "Minimum temperature",
                  value:
                    derived.minimumTemperature == null
                      ? "—"
                      : `${Math.round(derived.minimumTemperature)}°C`,
                },
                {
                  label: "Maximum temperature",
                  value:
                    derived.maximumTemperature == null
                      ? "—"
                      : `${Math.round(derived.maximumTemperature)}°C`,
                },
                {
                  label: "Calories",
                  value:
                    activity?.calories == null
                      ? "—"
                      : `${Math.round(activity.calories)} kcal`,
                },
                {
                  label: "Aerobic training effect",
                  value:
                    activity?.aerobicTrainingEffect == null
                      ? "—"
                      : `${activity.aerobicTrainingEffect.toFixed(1)} · ${trainingEffectLabel(activity.aerobicTrainingEffect)}`,
                },
                {
                  label: "Anaerobic training effect",
                  value:
                    activity?.anaerobicTrainingEffect == null
                      ? "—"
                      : `${activity.anaerobicTrainingEffect.toFixed(1)} · ${trainingEffectLabel(activity.anaerobicTrainingEffect)}`,
                },
              ]}
            />
          </div>
        ) : null}

        {tab === "intervals" ? (
          <IntervalsPanel
            splits={analysis.splits}
            structuredWorkout={structuredWorkout}
          />
        ) : null}

        {tab === "charts" ? (
          <div className="grid gap-5">
            <div className="flex justify-end">
              <div className="grid grid-cols-2 rounded-xl border border-[var(--border)] bg-black/35 p-1">
                {(["time", "distance"] as AxisMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAxisMode(mode)}
                    className={`rounded-lg px-5 py-2 text-xs font-black capitalize ${
                      axisMode === mode
                        ? "bg-[var(--accent)] text-black"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <AnalysisChart
              title="Pace"
              subtitle="Recorded pace with recoveries and stops visible."
              data={chartData}
              dataKey="pace"
              formatter={formatPace}
              colour={CHART_COLOURS.pace}
              axisMode={axisMode}
              averageValue={derived.averagePace}
              reversed
            />
            <AnalysisChart
              title="Heart rate"
              subtitle="Cardiovascular response across the session."
              data={chartData}
              dataKey="heartRate"
              formatter={(value) => `${Math.round(value)} bpm`}
              colour={CHART_COLOURS.heartRate}
              axisMode={axisMode}
              averageValue={derived.averageHr}
            />
            <TrainingEffect
              aerobic={activity?.aerobicTrainingEffect}
              anaerobic={activity?.anaerobicTrainingEffect}
            />
            <AnalysisChart
              title="Cadence"
              subtitle="Running steps per minute. Recovery walking remains visible."
              data={chartData}
              dataKey="cadence"
              formatter={(value) => `${Math.round(value)} spm`}
              colour={CHART_COLOURS.cadence}
              axisMode={axisMode}
              averageValue={derived.averageCadence}
            />
            <AnalysisChart
              title="Elevation"
              subtitle="Recorded terrain profile."
              data={chartData}
              dataKey="elevation"
              formatter={(value) => `${Math.round(value)} m`}
              colour={CHART_COLOURS.elevation}
              axisMode={axisMode}
            />
            <AnalysisChart
              title="Temperature"
              subtitle="Watch-recorded ambient temperature where available."
              data={chartData}
              dataKey="temperature"
              formatter={(value) => `${Math.round(value)}°C`}
              colour={CHART_COLOURS.temperature}
              axisMode={axisMode}
            />
            <MovementTimeline summary={movement} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
