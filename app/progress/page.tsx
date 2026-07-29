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
import HeroImagePanel from "@/components/HeroImagePanel";
import { HERO_IMAGES } from "@/lib/hero-images";
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
const chartColors = ["#d7ff2f", "#f5f5f5", "#a3a3a3", "#737373", "#99c900", "#3f3f46"];

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateCurrentStreak(completedAtValues: string[], now: number) {
  if (completedAtValues.length === 0 || now === 0) {
    return 0;
  }

  const completedDays = new Set(completedAtValues.map((value) => localDateKey(new Date(value))));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  if (!completedDays.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);

    if (!completedDays.has(localDateKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;

  while (completedDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export default function ProgressPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const mounted = useClientReady();
  const now = useNow();
  const workoutOverrides = useWorkoutOverrides();

  const effectiveProgramme = useMemo(() => (programme ? getEffectiveProgramme(programme, workoutOverrides) : null), [programme, workoutOverrides]);
  const workouts = useMemo(() => (effectiveProgramme ? getAllWorkouts(effectiveProgramme) : []), [effectiveProgramme]);

  const workoutsById = useMemo(() => {
    const entries = workouts.map((workout) => [workout.id, workout] as const);
    return new Map(entries);
  }, [workouts]);

  const sortedLogs = useMemo(
    () => [...logs].sort((first, second) => new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime()),
    [logs],
  );

  const categoryData = useMemo(() => {
    const counts = new Map<WorkoutCategory, number>(categories.map((category) => [category, 0]));

    logs.forEach((log) => {
      const category = log.workoutCategory ?? workoutsById.get(log.workoutId)?.category;

      if (category) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    });

    return categories
      .map((category) => ({
        category,
        sessions: counts.get(category) ?? 0,
      }))
      .filter((item) => item.sessions > 0);
  }, [logs, workoutsById]);

  const rpeTrend = useMemo(
    () =>
      [...logs]
        .sort((first, second) => new Date(first.completedAt).getTime() - new Date(second.completedAt).getTime())
        .map((log, index) => ({
          label: `${shortDate(log.completedAt)} #${index + 1}`,
          rpe: log.rpe,
        })),
    [logs],
  );

  const averageRpe =
    logs.length > 0 ? (logs.reduce((total, log) => total + log.rpe, 0) / logs.length).toFixed(1) : "0.0";
  const plannedMinutes = workouts.reduce((total, workout) => total + workout.durationMinutes, 0);
  const completedPlannedMinutes = logs.reduce(
    (total, log) => total + (workoutsById.get(log.workoutId)?.durationMinutes ?? 0),
    0,
  );
  const actualLoggedMinutes = logs.reduce((total, log) => total + (log.actualDurationMinutes ?? 0), 0);
  const currentStreak = calculateCurrentStreak(
    logs.map((log) => log.completedAt),
    now,
  );

  const limiterData = useMemo(() => {
    const counts = new Map<string, number>();

    logs.forEach((log) => {
      const loggedLimiter = normalizeLimiter(log.limiter);

      if (loggedLimiter) {
        counts.set(loggedLimiter, (counts.get(loggedLimiter) ?? 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([limiter, count]) => ({ limiter, count }))
      .sort((first, second) => second.count - first.count);
  }, [logs]);

  const phaseData = useMemo(() => {
    const counts = new Map<string, number>();

    logs.forEach((log) => {
      const phase = workoutsById.get(log.workoutId)?.phase ?? "Unset";
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([phase, count]) => ({ phase, count }))
      .sort((first, second) => second.count - first.count);
  }, [logs, workoutsById]);

  const averageRpeBySessionType = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();

    logs.forEach((log) => {
      const workout = workoutsById.get(log.workoutId);
      const sessionType = log.workoutSessionType ?? workout?.sessionType ?? workout?.category ?? log.workoutCategory ?? "unknown";
      const existing = totals.get(sessionType) ?? { total: 0, count: 0 };
      totals.set(sessionType, {
        total: existing.total + log.rpe,
        count: existing.count + 1,
      });
    });

    return Array.from(totals.entries())
      .map(([sessionType, value]) => ({
        sessionType,
        average: value.count > 0 ? value.total / value.count : 0,
        count: value.count,
      }))
      .sort((first, second) => second.count - first.count);
  }, [logs, workoutsById]);

  return (
    <div className="grid gap-5">
      <HeroImagePanel
        src={HERO_IMAGES.pools.track[1] ?? HERO_IMAGES.home}
        title="Progress"
        kicker="Signal Board"
        className="hero-media-compact"
      >
        <p className="mt-3 max-w-2xl text-base font-bold text-[var(--muted)]">
          Bank the work. Watch the trend.
        </p>
      </HeroImagePanel>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="tv-card p-4">
          <p className="tv-label">Total Sessions</p>
          <p className="mt-3 text-5xl font-black text-[var(--accent)]">{logs.length}</p>
        </article>
        <article className="tv-card p-4">
          <p className="tv-label">Average RPE</p>
          <p className="mt-3 text-5xl font-black text-[var(--accent)]">{averageRpe}</p>
        </article>
        <article className="tv-card p-4">
          <p className="tv-label">Current Streak</p>
          <p className="mt-3 text-5xl font-black text-[var(--accent)]">{currentStreak}</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">training days</p>
        </article>
        <article className="tv-card p-4">
          <p className="tv-label">Minutes</p>
          <p className="mt-3 text-3xl font-black text-[var(--accent)]">
            {completedPlannedMinutes}/{plannedMinutes}
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            planned logged{actualLoggedMinutes > 0 ? ` / ${actualLoggedMinutes} actual` : ""}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="tv-card min-h-[22rem] p-4">
          <p className="tv-label">Sessions by Category</p>
          <div className="mt-4 h-72">
            {mounted && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="category"
                    stroke="#a3a3a3"
                    tick={{ fill: "#a3a3a3", fontSize: 11, fontWeight: 700 }}
                    angle={-30}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis allowDecimals={false} stroke="#a3a3a3" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(215,255,47,0.08)" }}
                    contentStyle={{
                      background: "#0d0d0d",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: "6px",
                      color: "#f5f5f5",
                    }}
                  />
                  <Bar dataKey="sessions" fill="#d7ff2f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm font-bold text-[var(--muted)]">
                Complete sessions to populate the category chart.
              </div>
            )}
          </div>
        </article>

        <article className="tv-card min-h-[22rem] p-4">
          <p className="tv-label">Category Distribution</p>
          <div className="mt-4 h-72">
            {mounted && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="sessions"
                    nameKey="category"
                    innerRadius={52}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="#050505"
                    strokeWidth={2}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={entry.category} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#0d0d0d",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: "6px",
                      color: "#f5f5f5",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm font-bold text-[var(--muted)]">
                Category split appears after your first log.
              </div>
            )}
          </div>
        </article>

        <article className="tv-card min-h-[22rem] p-4 lg:col-span-2">
          <p className="tv-label">RPE Trend</p>
          <div className="mt-4 h-72">
            {mounted && rpeTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rpeTrend} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#a3a3a3"
                    tick={{ fill: "#a3a3a3", fontSize: 11, fontWeight: 700 }}
                    angle={-30}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis domain={[1, 10]} stroke="#a3a3a3" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0d0d0d",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: "6px",
                      color: "#f5f5f5",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rpe"
                    stroke="#d7ff2f"
                    strokeWidth={3}
                    dot={{ fill: "#050505", stroke: "#d7ff2f", strokeWidth: 2, r: 4 }}
                    activeDot={{ fill: "#d7ff2f", stroke: "#d7ff2f", r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm font-bold text-[var(--muted)]">
                Log session RPE to draw a trend.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="tv-card p-4">
          <p className="tv-label">Limiter Frequency</p>
          {limiterData.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {limiterData.map((item) => (
                <div key={item.limiter} className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2 text-sm font-bold">
                  <span className="min-w-0 break-words font-black uppercase text-[var(--text)]">{item.limiter}</span>
                  <span className="rounded-sm border border-[rgba(215,255,47,0.35)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--accent)]">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">Log limiters to see what keeps showing up.</p>
          )}
        </article>

        <article className="tv-card p-4">
          <p className="tv-label">Sessions by Phase</p>
          {phaseData.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {phaseData.map((item) => (
                <div key={item.phase} className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2 text-sm font-bold">
                  <span className="min-w-0 break-words font-black uppercase text-[var(--text)]">{item.phase}</span>
                  <span className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--muted)]">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">Phase counts appear after logging sessions.</p>
          )}
        </article>

        <article className="tv-card p-4">
          <p className="tv-label">Avg RPE by Session Type</p>
          {averageRpeBySessionType.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {averageRpeBySessionType.map((item) => (
                <div key={item.sessionType} className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2 text-sm font-bold">
                  <span className="min-w-0 break-words font-black uppercase text-[var(--text)]">{item.sessionType}</span>
                  <span className="rounded-sm border border-[var(--accent)] bg-[rgba(215,255,47,0.12)] px-2 py-1 text-xs font-black uppercase text-[var(--accent)]">
                    {item.average.toFixed(1)} / {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">Session type averages appear after logging.</p>
          )}
        </article>
      </section>

      <section className="tv-card p-4">
        <p className="tv-label">Last 7 Logs</p>
        {sortedLogs.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {sortedLogs.slice(0, 7).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-sm font-bold">
                <span className="min-w-0 break-words font-black uppercase text-[var(--text)]">{log.workoutTitle}</span>
                <span className="text-[var(--muted)]">
                  {shortDate(log.completedAt)} / RPE {log.rpe}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-[var(--muted)]">No logs yet.</p>
        )}
      </section>
    </div>
  );
}
