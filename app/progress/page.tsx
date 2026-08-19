"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Gauge, Mountain, Route, TimerReset, TrendingUp } from "lucide-react";
import {
  buildTrainingMetrics,
  buildWeeklyTrend,
  isRunWorkout,
} from "@/lib/coaching";
import { normalizeLimiter } from "@/lib/session-log";
import {
  getAllWorkouts,
  getEffectiveProgramme,
  useActiveProgrammeOptional,
  useClientReady,
  useNow,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { WorkoutCategory } from "@/lib/types";

const categories: WorkoutCategory[] = ["strength", "conditioning", "track", "gymnastics", "hybrid", "recovery"];
const chartColors = ["var(--accent)", "var(--red)", "var(--green)", "var(--amber)", "var(--purple)", "#7b91ad"];

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(value));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateCurrentStreak(completedAtValues: string[], now: number) {
  if (completedAtValues.length === 0 || now === 0) return 0;
  const completedDays = new Set(completedAtValues.map((value) => localDateKey(new Date(value))));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  if (!completedDays.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!completedDays.has(localDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (completedDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatPace(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  color: "var(--text)",
  boxShadow: "var(--shadow)",
};

export default function ProgressPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const mounted = useClientReady();
  const now = useNow();
  const workoutOverrides = useWorkoutOverrides();
  const effectiveProgramme = useMemo(
    () => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null),
    [programme, workoutOverrides],
  );
  const workouts = useMemo(() => (effectiveProgramme ? getAllWorkouts(effectiveProgramme) : []), [effectiveProgramme]);
  const workoutsById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout] as const)), [workouts]);
  const metrics = useMemo(() => buildTrainingMetrics(effectiveProgramme, logs, now), [effectiveProgramme, logs, now]);
  const weeklyTrend = useMemo(() => buildWeeklyTrend(effectiveProgramme, logs, now, 8), [effectiveProgramme, logs, now]);
  const sortedLogs = useMemo(
    () => [...logs].sort((first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime()),
    [logs],
  );

  const categoryData = useMemo(() => {
    const counts = new Map<WorkoutCategory, number>(categories.map((category) => [category, 0]));
    logs.forEach((log) => {
      const category = log.workoutCategory ?? workoutsById.get(log.workoutId)?.category;
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return categories.map((category) => ({ category, sessions: counts.get(category) ?? 0 })).filter((item) => item.sessions > 0);
  }, [logs, workoutsById]);

  const rpeTrend = useMemo(
    () => [...logs]
      .sort((first, second) => new Date(first.completedAt).getTime() - new Date(second.completedAt).getTime())
      .slice(-20)
      .map((log) => ({ label: shortDate(log.completedAt), rpe: log.rpe })),
    [logs],
  );

  const paceTrend = useMemo(
    () => [...logs]
      .filter((log) => {
        const workout = workoutsById.get(log.workoutId);
        return Boolean(workout && isRunWorkout(workout) && log.averagePaceSecondsPerKm);
      })
      .sort((first, second) => new Date(first.completedAt).getTime() - new Date(second.completedAt).getTime())
      .slice(-16)
      .map((log) => ({ label: shortDate(log.completedAt), pace: log.averagePaceSecondsPerKm ?? 0, distance: log.distanceKm ?? 0 })),
    [logs, workoutsById],
  );

  const averageRpe = logs.length > 0 ? logs.reduce((total, log) => total + log.rpe, 0) / logs.length : 0;
  const plannedMinutes = workouts.reduce((total, workout) => total + workout.durationMinutes, 0);
  const completedPlannedMinutes = logs.reduce((total, log) => total + (workoutsById.get(log.workoutId)?.durationMinutes ?? 0), 0);
  const actualLoggedMinutes = logs.reduce((total, log) => total + (log.actualDurationMinutes ?? 0), 0);
  const currentStreak = calculateCurrentStreak(logs.map((log) => log.completedAt), now);

  const limiterData = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => {
      const limiter = normalizeLimiter(log.limiter);
      if (limiter) counts.set(limiter, (counts.get(limiter) ?? 0) + 1);
    });
    return [...counts.entries()].map(([limiter, count]) => ({ limiter, count })).sort((a, b) => b.count - a.count);
  }, [logs]);

  const phaseData = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => {
      const phase = workoutsById.get(log.workoutId)?.phase ?? "Unset";
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    });
    return [...counts.entries()].map(([phase, count]) => ({ phase, count })).sort((a, b) => b.count - a.count);
  }, [logs, workoutsById]);

  return (
    <div className="agoge-page">
      <section className="flex flex-wrap items-end justify-between gap-3 px-1 py-1">
        <div>
          <p className="tv-label text-[var(--accent)]">Performance</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">Signals, not decoration.</h1>
          <p className="mt-1.5 max-w-2xl text-sm font-semibold text-[var(--muted)]">
            Session load, running volume, elevation, pace, RPE and recurring limiters. The useful stuff gets the pixels.
          </p>
        </div>
        <span className="tv-status tv-status-good">{metrics.sessions7d} sessions · last 7d</span>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <article className="tv-kpi">
          <Activity className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">7d load</p>
          <p className="tv-kpi-value">{metrics.load7d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{metrics.loadRatio ? `${metrics.loadRatio.toFixed(2)}× baseline` : "calibrating"}</p>
        </article>
        <article className="tv-kpi">
          <Route className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Distance 7d</p>
          <p className="tv-kpi-value">{metrics.runLogsWithMetrics ? `${metrics.distance7dKm.toFixed(1)} km` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">structured run logs</p>
        </article>
        <article className="tv-kpi">
          <Mountain className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Elevation 7d</p>
          <p className="tv-kpi-value">{metrics.runLogsWithMetrics ? `${Math.round(metrics.elevation7dM)} m` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">fell / hill durability</p>
        </article>
        <article className="tv-kpi">
          <Gauge className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Average RPE</p>
          <p className="tv-kpi-value">{averageRpe ? averageRpe.toFixed(1) : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">all logged sessions</p>
        </article>
        <article className="tv-kpi">
          <TrendingUp className="h-4.5 w-4.5 text-[var(--green)]" aria-hidden="true" />
          <p className="tv-label mt-2">Streak</p>
          <p className="tv-kpi-value">{currentStreak}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">training days</p>
        </article>
        <article className="tv-kpi">
          <TimerReset className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Minutes logged</p>
          <p className="tv-kpi-value">{actualLoggedMinutes || completedPlannedMinutes}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">of {plannedMinutes} planned</p>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="tv-card p-4 sm:p-5">
          <div>
            <p className="tv-label text-[var(--accent)]">Eight-week build</p>
            <h2 className="mt-1 text-lg font-black tracking-tight">Distance + elevation</h2>
          </div>
          <div className="mt-4 h-72">
            {mounted && weeklyTrend.some((point) => point.distanceKm > 0 || point.elevationM > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10, fontWeight: 700 }} />
                  <YAxis yAxisId="distance" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <YAxis yAxisId="elevation" orientation="right" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--accent-soft)" }} />
                  <Bar yAxisId="distance" dataKey="distanceKm" name="Distance km" fill="var(--accent)" radius={[5, 5, 0, 0]} />
                  <Bar yAxisId="elevation" dataKey="elevationM" name="Elevation m" fill="var(--red)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-6 text-center">
                <div>
                  <Route className="mx-auto h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-black text-[var(--text)]">Run data starts on the next log.</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">Add distance and elevation after run sessions to populate the useful trend.</p>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <div>
            <p className="tv-label text-[var(--red)]">Running pace</p>
            <h2 className="mt-1 text-lg font-black tracking-tight">Same effort, faster athlete?</h2>
          </div>
          <div className="mt-4 h-72">
            {mounted && paceTrend.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paceTrend} margin={{ top: 8, right: 12, left: -6, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10, fontWeight: 700 }} />
                  <YAxis
                    dataKey="pace"
                    domain={["dataMin - 10", "dataMax + 10"]}
                    reversed
                    stroke="var(--muted)"
                    tick={{ fill: "var(--muted)", fontSize: 10 }}
                    tickFormatter={(value) => formatPace(Number(value))}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => name === "pace" ? [`${formatPace(Number(value))}/km`, "Pace"] : [value, name]}
                  />
                  <Line type="monotone" dataKey="pace" stroke="var(--red)" strokeWidth={3} dot={{ fill: "var(--surface)", stroke: "var(--red)", strokeWidth: 2, r: 3.5 }} activeDot={{ fill: "var(--red)", stroke: "var(--red)", r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-6 text-center">
                <div>
                  <TimerReset className="mx-auto h-6 w-6 text-[var(--red)]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-black text-[var(--text)]">Two pace logs unlock the trend.</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">The app stores pace as structured seconds/km so it can compare sessions instead of reading tea leaves from notes.</p>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label">Session mix</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">What you actually train</h2>
          <div className="mt-4 h-64">
            {mounted && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="sessions" nameKey="category" innerRadius={58} outerRadius={92} paddingAngle={3} stroke="var(--surface)" strokeWidth={3}>
                    {categoryData.map((entry, index) => <Cell key={entry.category} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="grid h-full place-items-center text-sm font-semibold text-[var(--muted)]">Complete sessions to build the mix.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryData.map((item, index) => (
              <span key={item.category} className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: chartColors[index % chartColors.length] }} />
                {item.category} · {item.sessions}
              </span>
            ))}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label">RPE trend</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Is every session becoming a war?</h2>
          <div className="mt-4 h-64">
            {mounted && rpeTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rpeTrend} margin={{ top: 8, right: 12, left: -14, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <YAxis domain={[1, 10]} stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="rpe" stroke="var(--accent)" strokeWidth={3} dot={{ fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2, r: 3 }} activeDot={{ fill: "var(--accent)", stroke: "var(--accent)", r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="grid h-full place-items-center text-sm font-semibold text-[var(--muted)]">Log RPE to draw the trend.</div>}
          </div>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="tv-card p-4">
          <p className="tv-label text-[var(--red)]">Recurring limiters</p>
          <div className="mt-3 grid gap-2">
            {limiterData.length > 0 ? limiterData.slice(0, 6).map((item, index) => (
              <div key={item.limiter} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--text)]">{item.limiter}</p>
                  <p className="text-[0.65rem] font-semibold text-[var(--muted)]">#{index + 1} limiter</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--red-soft)] text-sm font-black text-[var(--red)]">{item.count}</span>
              </div>
            )) : <p className="text-sm font-semibold text-[var(--muted)]">No limiters logged yet.</p>}
          </div>
        </article>

        <article className="tv-card p-4">
          <p className="tv-label text-[var(--accent)]">Training phases</p>
          <div className="mt-3 grid gap-2">
            {phaseData.length > 0 ? phaseData.slice(0, 6).map((item) => (
              <div key={item.phase} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 text-sm">
                <span className="font-bold text-[var(--text)]">{item.phase}</span>
                <span className="font-black text-[var(--accent)]">{item.count}</span>
              </div>
            )) : <p className="text-sm font-semibold text-[var(--muted)]">Phase data appears after logging.</p>}
          </div>
        </article>

        <article className="tv-card p-4">
          <p className="tv-label">Latest sessions</p>
          <div className="mt-3 grid gap-2">
            {sortedLogs.length > 0 ? sortedLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="border-b border-[var(--border)] py-2 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-black text-[var(--text)]">{log.workoutTitle}</p>
                  <span className="shrink-0 text-xs font-black text-[var(--accent)]">RPE {log.rpe}</span>
                </div>
                <p className="mt-0.5 text-[0.68rem] font-semibold text-[var(--muted)]">
                  {shortDate(log.completedAt)}
                  {log.distanceKm ? ` · ${log.distanceKm.toFixed(1)} km` : ""}
                  {log.averagePaceSecondsPerKm ? ` · ${formatPace(log.averagePaceSecondsPerKm)}/km` : ""}
                  {log.elevationM ? ` · ${Math.round(log.elevationM)} m+` : ""}
                </p>
              </div>
            )) : <p className="text-sm font-semibold text-[var(--muted)]">No sessions logged yet.</p>}
          </div>
        </article>
      </section>
    </div>
  );
}
