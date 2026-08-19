"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Gauge, Mountain, Route, TimerReset, TrendingUp } from "lucide-react";
import {
  buildTrainingMetrics,
  buildWeeklyTrend,
  isStructuredRunLog,
} from "@/lib/coaching";
import { normalizeLimiter } from "@/lib/session-log";
import {
  useActiveProgrammeOptional,
  useClientReady,
  useNow,
  useSessionLogs,
} from "@/lib/storage";

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(value));
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
  const now = useNow();
  const mounted = useClientReady();
  const metrics = useMemo(() => buildTrainingMetrics(programme, logs, now), [programme, logs, now]);
  const weeklyTrend = useMemo(() => buildWeeklyTrend(programme, logs, now, 8), [programme, logs, now]);
  const runLogs = useMemo(
    () => logs
      .filter(isStructuredRunLog)
      .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()),
    [logs],
  );
  const recentRunLogs = runLogs.slice(-20);
  const recentLogs = useMemo(
    () => [...logs].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()),
    [logs],
  );
  const paceTrend = recentRunLogs
    .filter((log) => log.averagePaceSecondsPerKm)
    .map((log) => ({
      label: shortDate(log.completedAt),
      pace: log.averagePaceSecondsPerKm ?? 0,
      distance: log.distanceKm ?? 0,
      rpe: log.rpe,
    }));
  const rpeTrend = [...logs]
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .slice(-20)
    .map((log) => ({ label: shortDate(log.completedAt), rpe: log.rpe }));
  const limiterData = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach((log) => {
      const limiter = normalizeLimiter(log.limiter);
      if (limiter) counts.set(limiter, (counts.get(limiter) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs]);
  const lastRun = runLogs.at(-1);
  const averageRecentPace = paceTrend.length > 0
    ? paceTrend.reduce((total, point) => total + point.pace, 0) / paceTrend.length
    : null;

  return (
    <div className="agoge-page">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 py-1">
        <div>
          <p className="tv-label text-[var(--accent)]">Performance</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">The work, translated.</h1>
          <p className="mt-1.5 max-w-2xl text-sm font-semibold text-[var(--muted)]">
            Quick Logs and planned sessions use the same analytics. A run does not need to belong to a programme before it counts.
          </p>
        </div>
        <span className="tv-status tv-status-good">{metrics.runLogsWithMetrics} structured run logs · 28d</span>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <article className="tv-kpi">
          <Activity className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">7d load</p>
          <p className="tv-kpi-value">{metrics.load7d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{metrics.loadRatio ? `${metrics.loadRatio.toFixed(2)}× 28d weekly baseline` : "baseline calibrating"}</p>
        </article>
        <article className="tv-kpi">
          <Route className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Distance · 28d</p>
          <p className="tv-kpi-value">{metrics.distance28dKm > 0 ? `${metrics.distance28dKm.toFixed(1)} km` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">all structured run logs</p>
        </article>
        <article className="tv-kpi">
          <Mountain className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Elevation · 28d</p>
          <p className="tv-kpi-value">{metrics.elevation28dM > 0 ? `${Math.round(metrics.elevation28dM)} m` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">hill / fell durability</p>
        </article>
        <article className="tv-kpi">
          <TimerReset className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Recent avg pace</p>
          <p className="tv-kpi-value">{averageRecentPace ? formatPace(averageRecentPace) : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">/km · structured pace logs</p>
        </article>
        <article className="tv-kpi">
          <Gauge className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Average RPE · 7d</p>
          <p className="tv-kpi-value">{metrics.averageRpe7d ? metrics.averageRpe7d.toFixed(1) : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{metrics.hardSessions7d} hard sessions</p>
        </article>
        <article className="tv-kpi">
          <TrendingUp className="h-4.5 w-4.5 text-[var(--green)]" aria-hidden="true" />
          <p className="tv-label mt-2">Latest run</p>
          <p className="tv-kpi-value">{lastRun?.distanceKm ? `${lastRun.distanceKm.toFixed(1)} km` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{lastRun ? `${shortDate(lastRun.completedAt)} · RPE ${lastRun.rpe}` : "log a run to begin"}</p>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label text-[var(--accent)]">Eight-week build</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Distance + elevation</h2>
          <div className="mt-4 h-72">
            {mounted && weeklyTrend.some((point) => point.distanceKm > 0 || point.elevationM > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend} margin={{ top: 8, right: 10, left: -14, bottom: 8 }}>
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
                  <p className="mt-3 text-sm font-black text-[var(--text)]">Distance and elevation will land here.</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Quick Log is enough. No programme linkage required.</p>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label text-[var(--red)]">Running pace</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Same effort, faster athlete?</h2>
          <div className="mt-4 h-72">
            {mounted && paceTrend.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paceTrend} margin={{ top: 8, right: 12, left: -4, bottom: 8 }}>
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
                  <p className="mt-3 text-sm font-black text-[var(--text)]">Two runs unlock the pace trend.</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Enter distance + duration and The Agoge calculates pace automatically.</p>
                </div>
              </div>
            )}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label">Training load</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Load should build — not just spike.</h2>
          <div className="mt-4 h-64">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend} margin={{ top: 8, right: 12, left: -14, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <YAxis stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="load" name="Session-RPE load" fill="var(--accent)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label">RPE trend</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Is every day becoming race day?</h2>
          <div className="mt-4 h-64">
            {mounted && rpeTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rpeTrend} margin={{ top: 8, right: 12, left: -14, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <YAxis domain={[1, 10]} stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="rpe" stroke="var(--accent)" strokeWidth={3} dot={{ fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm font-semibold text-[var(--muted)]">RPE appears after logging.</div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-[0.7fr_1.3fr]">
        <article className="tv-card p-4">
          <p className="tv-label text-[var(--red)]">Recurring limiters</p>
          <div className="mt-3 grid gap-2">
            {limiterData.length > 0 ? limiterData.slice(0, 6).map(([limiter, count], index) => (
              <div key={limiter} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5">
                <div>
                  <p className="text-sm font-black text-[var(--text)]">{limiter}</p>
                  <p className="text-[0.65rem] font-semibold text-[var(--muted)]">#{index + 1} limiter</p>
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--red-soft)] text-sm font-black text-[var(--red)]">{count}</span>
              </div>
            )) : <p className="text-sm font-semibold text-[var(--muted)]">No limiters logged yet.</p>}
          </div>
        </article>

        <article className="tv-card p-4">
          <p className="tv-label text-[var(--accent)]">Latest work</p>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {recentLogs.length > 0 ? recentLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--text)]">{log.workoutTitle}</p>
                  <p className="mt-0.5 text-[0.68rem] font-semibold text-[var(--muted)]">
                    {shortDate(log.completedAt)}
                    {log.distanceKm ? ` · ${log.distanceKm.toFixed(1)} km` : ""}
                    {log.averagePaceSecondsPerKm ? ` · ${formatPace(log.averagePaceSecondsPerKm)}/km` : ""}
                    {log.elevationM ? ` · ${Math.round(log.elevationM)} m+` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[var(--accent)]">RPE {log.rpe}</span>
              </div>
            )) : <p className="text-sm font-semibold text-[var(--muted)]">Nothing logged yet.</p>}
          </div>
        </article>
      </section>
    </div>
  );
}
