"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Footprints,
  HeartPulse,
  MapPinned,
  Mountain,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  StructuredRunningStep,
  StructuredRunningWorkout,
} from "@/lib/garmin";

type AnalysisPoint = {
  lat: number;
  lon: number;
  elevationMeters: number | null;
  distanceMeters: number | null;
  timeMs: number | null;
};

type AnalysisSample = {
  elapsedSeconds: number;
  movingSeconds: number | null;
  distanceMeters: number | null;
  paceSecondsPerKm: number | null;
  heartRateBpm: number | null;
  cadenceSpm: number | null;
  elevationMeters: number | null;
  gradePercent: number | null;
  temperatureC: number | null;
};

type AnalysisSplit = {
  splitIndex: number;
  splitType: string | null;
  durationSeconds: number | null;
  movingDurationSeconds: number | null;
  distanceMeters: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  calories: number | null;
};

type ActivityAnalysisPayload = {
  activityId: string;
  points: AnalysisPoint[];
  samples: AnalysisSample[];
  splits: AnalysisSplit[];
  availableChannels: string[];
  sourceSampleCount: number;
};

type ChartDatum = {
  distanceKm: number;
  elapsedMinutes: number;
  pace: number | null;
  heartRate: number | null;
  cadence: number | null;
  elevation: number | null;
};

type KilometreSplit = {
  index: number;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationDeltaMeters: number | null;
  complete: boolean;
};

type ExpandedStep = {
  step: StructuredRunningStep;
  label: string;
};

type ClockPoint = {
  distanceMeters: number;
  seconds: number;
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
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function average(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (finite.length === 0) return null;
  return finite.reduce((total, value) => total + value, 0) / finite.length;
}

function standardDeviation(values: Array<number | null | undefined>) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (finite.length < 2) return null;
  const mean = finite.reduce((total, value) => total + value, 0) / finite.length;
  const variance = finite.reduce((total, value) => total + (value - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance);
}

function sampleClock(sample: AnalysisSample) {
  return sample.movingSeconds ?? sample.elapsedSeconds;
}

function monotonicSamples(samples: AnalysisSample[]) {
  return samples.filter(
    (sample, index, all) =>
      sample.distanceMeters != null &&
      Number.isFinite(sample.distanceMeters) &&
      (index === 0 ||
        all[index - 1].distanceMeters == null ||
        sample.distanceMeters >= (all[index - 1].distanceMeters ?? 0)),
  );
}

function interpolateClock(samples: AnalysisSample[], distanceMeters: number) {
  if (samples.length === 0) return null;
  const firstDistance = samples[0].distanceMeters ?? 0;
  if (distanceMeters <= firstDistance) return sampleClock(samples[0]);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const previousDistance = previous.distanceMeters;
    const currentDistance = current.distanceMeters;
    if (previousDistance == null || currentDistance == null || currentDistance < distanceMeters) {
      continue;
    }
    const span = Math.max(0.001, currentDistance - previousDistance);
    const ratio = Math.min(1, Math.max(0, (distanceMeters - previousDistance) / span));
    return sampleClock(previous) + (sampleClock(current) - sampleClock(previous)) * ratio;
  }

  return sampleClock(samples[samples.length - 1]);
}

function interpolateElevation(samples: AnalysisSample[], distanceMeters: number) {
  const withElevation = samples.filter(
    (sample) => sample.distanceMeters != null && sample.elevationMeters != null,
  );
  if (withElevation.length === 0) return null;
  if (distanceMeters <= (withElevation[0].distanceMeters ?? 0)) {
    return withElevation[0].elevationMeters;
  }
  for (let index = 1; index < withElevation.length; index += 1) {
    const previous = withElevation[index - 1];
    const current = withElevation[index];
    const previousDistance = previous.distanceMeters ?? 0;
    const currentDistance = current.distanceMeters ?? previousDistance;
    if (currentDistance < distanceMeters) continue;
    const ratio = (distanceMeters - previousDistance) / Math.max(0.001, currentDistance - previousDistance);
    return (previous.elevationMeters ?? 0) + ((current.elevationMeters ?? 0) - (previous.elevationMeters ?? 0)) * ratio;
  }
  return withElevation[withElevation.length - 1].elevationMeters;
}

function buildKilometreSplits(samples: AnalysisSample[]): KilometreSplit[] {
  const ordered = monotonicSamples(samples);
  const totalDistance = ordered.at(-1)?.distanceMeters ?? 0;
  if (ordered.length < 2 || totalDistance < 100) return [];

  const result: KilometreSplit[] = [];
  let startDistance = ordered[0].distanceMeters ?? 0;
  let index = 1;

  while (startDistance < totalDistance - 1) {
    const endDistance = Math.min(totalDistance, startDistance + 1_000);
    const startClock = interpolateClock(ordered, startDistance);
    const endClock = interpolateClock(ordered, endDistance);
    if (startClock == null || endClock == null || endClock <= startClock) break;

    const segment = ordered.filter((sample) => {
      const distance = sample.distanceMeters ?? -1;
      return distance >= startDistance && distance <= endDistance;
    });
    const distance = endDistance - startDistance;
    const duration = endClock - startClock;
    const startElevation = interpolateElevation(ordered, startDistance);
    const endElevation = interpolateElevation(ordered, endDistance);

    result.push({
      index,
      label: distance >= 995 ? String(index) : `${(distance / 1_000).toFixed(2)}`,
      distanceMeters: distance,
      durationSeconds: duration,
      paceSecondsPerKm: duration / (distance / 1_000),
      averageHeartRateBpm: average(segment.map((sample) => sample.heartRateBpm)),
      averageCadenceSpm: average(segment.map((sample) => sample.cadenceSpm)),
      elevationDeltaMeters:
        startElevation == null || endElevation == null ? null : endElevation - startElevation,
      complete: distance >= 995,
    });

    startDistance = endDistance;
    index += 1;
  }

  return result;
}

function buildClockPoints(samples: AnalysisSample[]): ClockPoint[] {
  return monotonicSamples(samples)
    .filter((sample) => sample.distanceMeters != null)
    .map((sample) => ({
      distanceMeters: sample.distanceMeters ?? 0,
      seconds: sampleClock(sample),
    }));
}

function interpolatedTime(points: ClockPoint[], distanceMeters: number) {
  if (points.length === 0) return null;
  if (distanceMeters <= points[0].distanceMeters) return points[0].seconds;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.distanceMeters < distanceMeters) continue;
    const ratio =
      (distanceMeters - previous.distanceMeters) /
      Math.max(0.001, current.distanceMeters - previous.distanceMeters);
    return previous.seconds + (current.seconds - previous.seconds) * ratio;
  }
  return null;
}

function bestEffort(samples: AnalysisSample[], targetMeters: number) {
  const points = buildClockPoints(samples);
  if (points.length < 2 || (points.at(-1)?.distanceMeters ?? 0) < targetMeters) return null;

  let best: number | null = null;
  for (const start of points) {
    const finishDistance = start.distanceMeters + targetMeters;
    const finishTime = interpolatedTime(points, finishDistance);
    if (finishTime == null) break;
    const duration = finishTime - start.seconds;
    if (duration > 0 && (best == null || duration < best)) best = duration;
  }
  return best;
}

function rollingMedian(values: Array<number | null>, index: number, radius = 2) {
  const window = values
    .slice(Math.max(0, index - radius), index + radius + 1)
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (window.length === 0) return null;
  window.sort((first, second) => first - second);
  return window[Math.floor(window.length / 2)];
}

function buildChartData(samples: AnalysisSample[]): ChartDatum[] {
  const rawPaces = samples.map((sample) => {
    const pace = sample.paceSecondsPerKm;
    return pace != null && pace >= 120 && pace <= 1_200 ? pace : null;
  });

  return samples.map((sample, index) => ({
    distanceKm: (sample.distanceMeters ?? 0) / 1_000,
    elapsedMinutes: sample.elapsedSeconds / 60,
    pace: rollingMedian(rawPaces, index),
    heartRate: sample.heartRateBpm,
    cadence: sample.cadenceSpm,
    elevation: sample.elevationMeters,
  }));
}

function expandStructuredSteps(workout: StructuredRunningWorkout | null): ExpandedStep[] {
  if (!workout) return [];
  const expanded: ExpandedStep[] = [];
  let work = 0;
  let recovery = 0;

  const push = (step: StructuredRunningStep) => {
    let label = "Step";
    if (step.phase === "warmup") label = "Warm-up";
    if (step.phase === "cooldown") label = "Cool-down";
    if (step.phase === "work") label = `Rep ${++work}`;
    if (step.phase === "recovery") label = `Recovery ${++recovery}`;
    expanded.push({ step, label });
  };

  for (const element of workout.steps) {
    if (element.kind === "step") {
      push(element);
      continue;
    }
    for (let repetition = 0; repetition < element.repetitions; repetition += 1) {
      for (const step of element.steps) push(step);
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

function targetRead(split: AnalysisSplit, step: StructuredRunningStep | undefined) {
  const target = targetPace(step);
  const pace = split.averagePaceSecondsPerKm;
  if (!target || pace == null) return null;
  if (pace < target.fastest) return `${Math.round(target.fastest - pace)}s fast`;
  if (pace > target.slowest) return `${Math.round(pace - target.slowest)}s slow`;
  return "On target";
}

function RouteTrace({ points }: { points: AnalysisPoint[] }) {
  const drawing = useMemo(() => {
    if (points.length < 2) return null;
    const width = 760;
    const height = 390;
    const padding = 30;
    const averageLat = points.reduce((total, point) => total + point.lat, 0) / points.length;
    const lonScale = Math.max(0.2, Math.cos((averageLat * Math.PI) / 180));
    const xs = points.map((point) => point.lon * lonScale);
    const ys = points.map((point) => point.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(0.000001, maxX - minX);
    const spanY = Math.max(0.000001, maxY - minY);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const projected = points.map((point, index) => ({
      x: offsetX + (xs[index] - minX) * scale,
      y: height - (offsetY + (point.lat - minY) * scale),
    }));
    return {
      width,
      height,
      polyline: projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
      start: projected[0],
      finish: projected[projected.length - 1],
    };
  }, [points]);

  if (!drawing) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#080b08]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="tv-label text-[var(--accent)]">Route</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">Private Garmin GPS trace · {points.length} points</p>
        </div>
        <MapPinned className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="relative min-h-64 overflow-hidden bg-[radial-gradient(circle_at_68%_28%,rgba(215,255,47,0.11),transparent_35%),linear-gradient(145deg,#0c120c,#060706)]">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:32px_32px]" />
        <svg viewBox={`0 0 ${drawing.width} ${drawing.height}`} className="relative h-full min-h-64 w-full p-4" role="img" aria-label="Recorded running route">
          <polyline points={drawing.polyline} fill="none" stroke="rgba(215,255,47,0.17)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={drawing.polyline} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={drawing.start.x} cy={drawing.start.y} r="8" fill="#070807" stroke="var(--accent)" strokeWidth="4" />
          <circle cx={drawing.finish.x} cy={drawing.finish.y} r="8" fill="var(--accent)" stroke="#070807" strokeWidth="4" />
        </svg>
      </div>
    </section>
  );
}

function MetricChart({
  title,
  subtitle,
  icon: Icon,
  data,
  dataKey,
  formatter,
  reversed = false,
}: {
  title: string;
  subtitle: string;
  icon: typeof Activity;
  data: ChartDatum[];
  dataKey: "pace" | "heartRate" | "cadence" | "elevation";
  formatter: (value: number) => string;
  reversed?: boolean;
}) {
  const values = data
    .map((datum) => datum[dataKey])
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length < 3) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(1, (maximum - minimum) * 0.12);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tv-label text-[var(--accent)]">{title}</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">{subtitle}</p>
        </div>
        <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="mt-4 h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id={`chart-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="distanceKm"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => `${Number(value).toFixed(1)}`}
              tick={{ fill: "#8d948d", fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[Math.max(0, minimum - padding), maximum + padding]}
              reversed={reversed}
              tickFormatter={(value) => formatter(Number(value)).replace("/km", "")}
              tick={{ fill: "#8d948d", fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip
              cursor={{ stroke: "rgba(215,255,47,0.35)", strokeWidth: 1 }}
              contentStyle={{
                background: "#090b09",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 10,
                color: "#f5f7f3",
                fontSize: 12,
                fontWeight: 800,
              }}
              labelFormatter={(value) => `${Number(value).toFixed(2)} km`}
              formatter={(value) => [formatter(Number(value)), title]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              connectNulls
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill={`url(#chart-${dataKey})`}
              dot={false}
              activeDot={{ r: 4, fill: "var(--accent)", stroke: "#080a08" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[0.62rem] font-black uppercase tracking-[0.14em] text-[var(--muted)]">Distance (km)</p>
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
          <h2 className="mt-1 text-2xl font-black tracking-tight">Every kilometre</h2>
        </div>
        <p className="text-xs font-bold text-[var(--muted)]">Moving pace · HR · cadence</p>
      </div>
      <div className="divide-y divide-[var(--border)] px-4 sm:px-5">
        {splits.map((split) => {
          const strength = (slowest - split.paceSecondsPerKm) / range;
          const width = 52 + strength * 48;
          return (
            <div key={`${split.index}-${split.label}`} className="grid grid-cols-[2.3rem_minmax(0,1fr)_4.2rem] items-center gap-3 py-3">
              <div>
                <p className="text-sm font-black text-[var(--text)]">{split.label}</p>
                {!split.complete ? <p className="text-[0.58rem] font-black uppercase text-[var(--muted)]">partial</p> : null}
              </div>
              <div className="min-w-0">
                <div className="h-7 rounded-sm bg-white/[0.045]">
                  <div
                    className="grid h-full min-w-16 place-items-end rounded-sm bg-[linear-gradient(90deg,rgba(215,255,47,0.52),var(--accent))] px-2 text-[0.64rem] font-black text-black"
                    style={{ width: `${width}%` }}
                  >
                    {formatPace(split.paceSecondsPerKm).replace("/km", "")}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] font-bold text-[var(--muted)]">
                  <span>{formatHeartRate(split.averageHeartRateBpm)}</span>
                  <span>{formatCadence(split.averageCadenceSpm)}</span>
                  {split.elevationDeltaMeters != null ? (
                    <span>{split.elevationDeltaMeters >= 0 ? "+" : ""}{Math.round(split.elevationDeltaMeters)} m</span>
                  ) : null}
                </div>
              </div>
              <p className="text-right text-sm font-black text-[var(--text)]">{formatDuration(split.durationSeconds)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutSplits({
  splits,
  structuredWorkout,
}: {
  splits: AnalysisSplit[];
  structuredWorkout: StructuredRunningWorkout | null;
}) {
  if (splits.length === 0) return null;
  const expanded = expandStructuredSteps(structuredWorkout);
  const matched = expanded.length === splits.length ? expanded : [];

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.78)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <div>
          <p className="tv-label text-[var(--accent)]">Lap analysis</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Workout reps and recorded laps</h2>
        </div>
        <p className="text-xs font-bold text-[var(--muted)]">{matched.length ? "Matched to prescription" : `${splits.length} Garmin laps`}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)] text-[0.62rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              <th className="px-4 py-3 sm:px-5">Lap</th>
              <th className="px-3 py-3">Distance</th>
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Pace</th>
              <th className="px-3 py-3">Avg / max HR</th>
              <th className="px-3 py-3">Cadence</th>
              <th className="px-3 py-3">Target</th>
              <th className="px-4 py-3 sm:px-5">Read</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split, index) => {
              const step = matched[index];
              const read = targetRead(split, step?.step);
              const work = step?.step.phase === "work";
              return (
                <tr key={`${split.splitIndex}-${index}`} className={`border-b border-[var(--border)] last:border-b-0 ${work ? "bg-[rgba(215,255,47,0.045)]" : ""}`}>
                  <td className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      {work ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                      <span className="text-sm font-black text-[var(--text)]">{step?.label ?? `Lap ${split.splitIndex}`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatDistance(split.distanceMeters)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatDuration(split.movingDurationSeconds ?? split.durationSeconds)}</td>
                  <td className="px-3 py-3 text-sm font-black text-[var(--text)]">{formatPace(split.averagePaceSecondsPerKm)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatHeartRate(split.averageHeartRateBpm)} / {split.maxHeartRateBpm == null ? "—" : Math.round(split.maxHeartRateBpm)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{formatCadence(split.averageCadenceSpm)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[var(--muted)]">{targetPace(step?.step)?.label ?? "—"}</td>
                  <td className={`px-4 py-3 text-sm font-black sm:px-5 ${read === "On target" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{read ?? "Recorded"}</td>
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
        setStatus(payload.samples.length || payload.splits.length || payload.points.length ? "ready" : "empty");
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
  const execution = useMemo(() => {
    const samples = analysis?.samples ?? [];
    const ordered = monotonicSamples(samples);
    const totalDistance = ordered.at(-1)?.distanceMeters ?? 0;
    const half = totalDistance / 2;
    const startClock = interpolateClock(ordered, ordered[0]?.distanceMeters ?? 0);
    const halfClock = interpolateClock(ordered, half);
    const finishClock = interpolateClock(ordered, totalDistance);
    const firstPace =
      startClock == null || halfClock == null || half <= 0
        ? null
        : (halfClock - startClock) / (half / 1_000);
    const secondPace =
      halfClock == null || finishClock == null || totalDistance - half <= 0
        ? null
        : (finishClock - halfClock) / ((totalDistance - half) / 1_000);
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
    const cadenceMean = average(samples.map((sample) => sample.cadenceSpm));
    const cadenceSd = standardDeviation(samples.map((sample) => sample.cadenceSpm));
    return {
      best400: bestEffort(samples, 400),
      best1k: bestEffort(samples, 1_000),
      best5k: bestEffort(samples, 5_000),
      firstPace,
      secondPace,
      paceChange:
        firstPace == null || secondPace == null ? null : secondPace - firstPace,
      firstHr,
      secondHr,
      hrDrift:
        firstHr == null || secondHr == null || firstHr <= 0
          ? null
          : ((secondHr - firstHr) / firstHr) * 100,
      cadenceMean,
      cadenceVariation:
        cadenceMean == null || cadenceSd == null || cadenceMean <= 0
          ? null
          : (cadenceSd / cadenceMean) * 100,
    };
  }, [analysis?.samples]);

  if (status === "loading") {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.72)] p-5">
        <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-8 w-72 max-w-full animate-pulse rounded bg-white/10" />
        <div className="mt-5 h-56 animate-pulse rounded-xl bg-white/[0.045]" />
      </section>
    );
  }

  if (status === "empty" || !analysis) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,13,10,0.72)] p-5">
        <p className="tv-label text-[var(--accent)]">Detailed run analysis</p>
        <h2 className="mt-2 text-2xl font-black">Waiting for Garmin chart data</h2>
        <p className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
          The activity summary is available, but Garmin did not return its recorded samples or laps for this activity. Refresh the Garmin sync after the watch has fully uploaded it.
        </p>
      </section>
    );
  }

  const fastestSplit = kilometreSplits
    .filter((split) => split.complete)
    .sort((first, second) => first.paceSecondsPerKm - second.paceSecondsPerKm)[0];
  const PaceTrendIcon = (execution.paceChange ?? 0) <= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="tv-label text-[var(--accent)]">Activity lab</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">The complete run</h2>
          <p className="mt-2 max-w-3xl text-sm font-bold text-[var(--muted)]">
            Splits, recorded physiology, terrain and workout execution from the Garmin activity trace.
          </p>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-black/50 px-3 py-2 text-[0.64rem] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
          {analysis.sourceSampleCount.toLocaleString("en-GB")} source samples · {analysis.availableChannels.length} channels
        </div>
      </header>

      {analysis.points.length > 1 ? <RouteTrace points={analysis.points} /> : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Fastest km",
            value: fastestSplit ? formatPace(fastestSplit.paceSecondsPerKm) : "—",
            detail: fastestSplit ? `Split ${fastestSplit.index}` : "Needs a full kilometre",
            icon: Zap,
          },
          {
            label: "Best 1 km",
            value: formatDuration(execution.best1k),
            detail: execution.best1k ? formatPace(execution.best1k) : "Trace unavailable",
            icon: Timer,
          },
          {
            label: "Best 5 km",
            value: formatDuration(execution.best5k),
            detail: execution.best5k ? formatPace((execution.best5k ?? 0) / 5) : "Run shorter than 5 km",
            icon: Route,
          },
          {
            label: "Avg cadence",
            value: formatCadence(execution.cadenceMean),
            detail: execution.cadenceVariation == null ? "No cadence channel" : `${execution.cadenceVariation.toFixed(1)}% variation`,
            icon: Footprints,
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-xl border border-[var(--border)] bg-[rgba(10,13,10,0.74)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.62rem] font-black uppercase tracking-[0.13em] text-[var(--muted)]">{metric.label}</p>
                <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl">{metric.value}</p>
              <p className="mt-1 text-[0.65rem] font-bold text-[var(--muted)]">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <SplitBars splits={kilometreSplits} />

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-[var(--border)] bg-[rgba(10,13,10,0.74)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="tv-label">Second-half pace</p>
            <PaceTrendIcon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-black">{execution.paceChange == null ? "—" : `${execution.paceChange > 0 ? "+" : ""}${Math.round(execution.paceChange)} sec/km`}</p>
          <p className="mt-2 text-xs font-bold leading-relaxed text-[var(--muted)]">
            {execution.paceChange == null
              ? "Not enough distance trace to compare halves."
              : execution.paceChange <= -5
                ? "You finished faster than you started."
                : execution.paceChange >= 10
                  ? "Pace faded in the second half. Terrain and workout structure still matter."
                  : "Pacing remained broadly even across the run."}
          </p>
        </article>
        <article className="rounded-xl border border-[var(--border)] bg-[rgba(10,13,10,0.74)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="tv-label">Heart-rate drift</p>
            <HeartPulse className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-black">{execution.hrDrift == null ? "—" : `${execution.hrDrift > 0 ? "+" : ""}${execution.hrDrift.toFixed(1)}%`}</p>
          <p className="mt-2 text-xs font-bold leading-relaxed text-[var(--muted)]">
            {execution.hrDrift == null
              ? "No complete heart-rate trace was returned."
              : `First half ${formatHeartRate(execution.firstHr)} · second half ${formatHeartRate(execution.secondHr)}. This is context, not a standalone recovery verdict.`}
          </p>
        </article>
        <article className="rounded-xl border border-[var(--border)] bg-[rgba(10,13,10,0.74)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="tv-label">Trace quality</p>
            <BarChart3 className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-black">{analysis.availableChannels.length} channels</p>
          <p className="mt-2 text-xs font-bold leading-relaxed text-[var(--muted)]">
            {analysis.availableChannels.join(" · ").replaceAll("_", " ")}. Missing channels remain blank rather than being estimated.
          </p>
        </article>
      </section>

      <MetricChart
        title="Pace"
        subtitle="Smoothed recorded pace. Sharp troughs usually represent stops or recoveries."
        icon={Zap}
        data={chartData}
        dataKey="pace"
        formatter={formatPace}
        reversed
      />
      <MetricChart
        title="Heart rate"
        subtitle="Recorded effort response across the run."
        icon={HeartPulse}
        data={chartData}
        dataKey="heartRate"
        formatter={(value) => `${Math.round(value)} bpm`}
      />
      <MetricChart
        title="Cadence"
        subtitle="Total running steps per minute where the watch supplied cadence."
        icon={Footprints}
        data={chartData}
        dataKey="cadence"
        formatter={(value) => `${Math.round(value)} spm`}
      />
      <MetricChart
        title="Elevation"
        subtitle="Terrain profile from the recorded activity stream."
        icon={Mountain}
        data={chartData}
        dataKey="elevation"
        formatter={(value) => `${Math.round(value)} m`}
      />

      <WorkoutSplits splits={analysis.splits} structuredWorkout={structuredWorkout} />
    </div>
  );
}
