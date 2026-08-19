"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  Gauge,
  Mountain,
  Route,
  ShieldCheck,
  Target,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  auditCurrentPlan,
  buildCoachingInsights,
  buildTrainingMetrics,
  buildWeeklyTrend,
  getGoalCopy,
} from "@/lib/coaching";
import { HERO_IMAGES } from "@/lib/hero-images";
import {
  getNextIncompleteWorkout,
  getTodaysWorkout,
  useActiveProgrammeOptional,
  useNow,
  useSessionLogs,
  useTodayWorkoutOverride,
} from "@/lib/storage";

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function countdown(dateValue: string | undefined, now: number) {
  if (!dateValue || now === 0) return null;
  const today = new Date(now);
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function dayName(dayNumber: number) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.min(Math.max(dayNumber - 1, 0), 6)] ?? `Day ${dayNumber}`;
}

function metricNote(hasData: boolean, populated: string, missing: string) {
  return hasData ? populated : missing;
}

export default function Home() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const now = useNow();
  const todayOverride = useTodayWorkoutOverride();
  const todaysWorkout = programme ? getTodaysWorkout(programme, logs, now) : null;
  const completedWorkoutIds = useMemo(() => new Set(logs.map((log) => log.workoutId)), [logs]);
  const selectedTodayIsCompleted = Boolean(todaysWorkout && completedWorkoutIds.has(todaysWorkout.id));
  const nextIncompleteWorkout = programme
    ? getNextIncompleteWorkout(programme, logs, selectedTodayIsCompleted ? todaysWorkout?.id : undefined)
    : null;
  const actionWorkout = selectedTodayIsCompleted ? nextIncompleteWorkout : todaysWorkout;
  const metrics = useMemo(() => buildTrainingMetrics(programme, logs, now), [programme, logs, now]);
  const audit = useMemo(() => auditCurrentPlan(programme, logs, now), [programme, logs, now]);
  const insights = useMemo(() => buildCoachingInsights(programme, logs, now), [programme, logs, now]);
  const trend = useMemo(() => buildWeeklyTrend(programme, logs, now), [programme, logs, now]);
  const goals = useMemo(() => getGoalCopy(programme), [programme]);
  const raceDays = countdown(programme?.targetDate, now);
  const maxDistance = Math.max(...trend.map((point) => point.distanceKm), 1);
  const maxElevation = Math.max(...trend.map((point) => point.elevationM), 1);
  const maxLoad = Math.max(...trend.map((point) => point.load), 1);
  const runDataAvailable = metrics.runLogsWithMetrics > 0;

  if (!programme) {
    return (
      <div className="agoge-page">
        <section className="relative min-h-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[var(--sidebar)] text-white shadow-[var(--shadow-strong)]">
          <Image
            src={HERO_IMAGES.home}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1200px"
            className="object-cover opacity-55"
            style={{ objectPosition: "60% center" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,15,32,0.97)_0%,rgba(3,20,42,0.85)_46%,rgba(3,20,42,0.22)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,var(--accent),var(--red),transparent)]" />
          <div className="relative z-10 flex min-h-[340px] max-w-3xl flex-col justify-end p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7fb0ff]">The Agoge</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-6xl">Train. Adapt. Conquer.</h1>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-relaxed text-[#c4d1e0]">
              Import your programme and the dashboard will audit its structure, learn from session RPE and run metrics, and surface the training decisions that actually matter.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admin/import" className="tv-button-primary">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import programme
              </Link>
              <Link href="/coaching" className="tv-button-ghost border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                See coaching model
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="agoge-page">
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">Readiness</p>
            <Gauge className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{metrics.readiness}<span className="text-sm font-bold text-[var(--muted)]">/100</span></p>
          <p className="mt-1 text-xs font-bold text-[var(--green)]">{metrics.readinessLabel}</p>
        </article>

        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">7d training load</p>
            <Activity className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{metrics.load7d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {metrics.loadRatio ? `${metrics.loadRatio.toFixed(2)}× rolling baseline` : "Calibrating 28d baseline"}
          </p>
        </article>

        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">Run volume</p>
            <Route className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{runDataAvailable ? `${formatNumber(metrics.distance7dKm, 1)} km` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {metricNote(runDataAvailable, "structured logs · last 7d", "log distance to unlock")}
          </p>
        </article>

        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">Elevation</p>
            <Mountain className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{runDataAvailable ? `${formatNumber(metrics.elevation7dM)} m` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {metricNote(runDataAvailable, `${audit.hillSessions} hill/fell session${audit.hillSessions === 1 ? "" : "s"} planned`, "log elevation to unlock")}
          </p>
        </article>

        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">Plan quality</p>
            <ShieldCheck className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{audit.score}<span className="text-sm font-bold text-[var(--muted)]">/100</span></p>
          <p className={`mt-1 text-xs font-bold ${audit.gaps.length > 0 ? "text-[var(--amber)]" : "text-[var(--green)]"}`}>
            {audit.gaps[0] ? `${audit.gaps.length} coaching flag${audit.gaps.length === 1 ? "" : "s"}` : "No structural flags"}
          </p>
        </article>

        <article className="tv-kpi">
          <div className="flex items-center justify-between gap-2">
            <p className="tv-label">Target</p>
            <Target className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          </div>
          <p className="tv-kpi-value">{raceDays === null ? "—" : raceDays >= 0 ? `${raceDays}d` : "Done"}</p>
          <p className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">{programme.targetEvent ?? goals.primary}</p>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_1fr_0.72fr]">
        <article className="tv-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className="tv-label text-[var(--accent)]">This week</p>
              <h2 className="mt-1 text-lg font-black tracking-tight">{audit.week?.title ?? "Training plan"}</h2>
            </div>
            <Link href="/program" className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--accent)]">
              Full plan <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {(audit.week?.days ?? []).slice().sort((a, b) => a.dayNumber - b.dayNumber).map((day) => {
              const workout = day.workout;
              const completed = completedWorkoutIds.has(workout.id);
              const active = actionWorkout?.id === workout.id;

              return (
                <Link
                  key={day.id}
                  href={`/session/${workout.id}`}
                  className={`grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-strong)] ${active ? "bg-[var(--accent-soft)]" : ""}`}
                >
                  <div>
                    <p className="text-[0.62rem] font-extrabold uppercase text-[var(--muted)]">{dayName(day.dayNumber)}</p>
                    <p className="text-lg font-black leading-none text-[var(--text)]">{day.dayNumber}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black text-[var(--text)]">{workout.title}</p>
                      {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--red)]" /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">
                      {workout.durationMinutes} min · {workout.intensity} · {workout.focus.slice(0, 2).join(" / ") || workout.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {completed ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--green-soft)] text-[var(--green)]">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : active ? (
                      <span className="tv-chip border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]">Next</span>
                    ) : (
                      <span className="text-xs font-extrabold text-[var(--muted)]">RPE {workout.intensity === "hard" ? "8" : workout.intensity === "moderate" ? "6–7" : "2–4"}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-4 border-t border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-center">
            <div>
              <p className="tv-label">Runs</p>
              <p className="mt-1 font-black">{audit.runSessions}</p>
            </div>
            <div>
              <p className="tv-label">Quality</p>
              <p className="mt-1 font-black">{audit.qualityRuns}</p>
            </div>
            <div>
              <p className="tv-label">Hills</p>
              <p className="mt-1 font-black">{audit.hillSessions}</p>
            </div>
            <div>
              <p className="tv-label">CrossFit</p>
              <p className="mt-1 font-black">{audit.crossFitSessions}</p>
            </div>
          </div>
        </article>

        <article className="tv-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <BrainCircuit className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div>
                <p className="tv-label text-[var(--accent)]">Coaching insights</p>
                <h2 className="mt-1 text-lg font-black tracking-tight">What changes the outcome</h2>
              </div>
            </div>
            <Link href="/coaching" className="text-xs font-extrabold text-[var(--accent)]">Full report</Link>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {insights.slice(0, 5).map((insight) => (
              <div key={insight.id} className="grid grid-cols-[0.45rem_minmax(0,1fr)] gap-3 px-4 py-3">
                <span className={`mt-1 h-8 w-1.5 rounded-full ${insight.tone === "red" ? "bg-[var(--red)]" : insight.tone === "amber" ? "bg-[var(--amber)]" : insight.tone === "green" ? "bg-[var(--green)]" : insight.tone === "purple" ? "bg-[var(--purple)]" : "bg-[var(--accent)]"}`} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-[var(--text)]">{insight.title}</p>
                    <span className="text-[0.62rem] font-extrabold uppercase text-[var(--muted)]">{insight.confidence}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">{insight.summary}</p>
                  <p className="mt-1.5 text-xs font-bold leading-relaxed text-[var(--text)]">{insight.action}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="grid content-start gap-3">
          <article className="relative overflow-hidden rounded-xl border border-white/10 bg-[var(--sidebar)] p-4 text-white shadow-[var(--shadow)]">
            <Image
              src="/assets/hero4.png"
              alt=""
              fill
              sizes="360px"
              className="object-cover opacity-24"
              style={{ objectPosition: "70% center" }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,18,38,0.55),rgba(4,18,38,0.96))]" />
            <div className="relative z-10">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-[#88b4ff]">Primary mission</p>
              <h2 className="mt-2 text-xl font-black tracking-tight">{goals.primary}</h2>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-[#aebed1]">
                Supported by {goals.secondary.toLowerCase()} and {goals.tertiary.toLowerCase()}.
              </p>
              {programme.targetDate ? (
                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs font-bold text-[#c7d5e5]">
                  <CalendarDays className="h-4 w-4 text-[#88b4ff]" aria-hidden="true" />
                  {programme.targetDate}
                </div>
              ) : null}
            </div>
          </article>

          <article className="tv-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tv-label">Today / next</p>
                <h2 className="mt-1 text-base font-black tracking-tight">{actionWorkout?.title ?? "Block complete"}</h2>
              </div>
              <Dumbbell className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            {actionWorkout ? (
              <>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--muted)]">
                  {actionWorkout.targetStimulus ?? actionWorkout.coachNotes ?? `${actionWorkout.durationMinutes} min · ${actionWorkout.focus.slice(0, 3).join(" / ")}`}
                </p>
                <Link href={`/session/${actionWorkout.id}`} className="tv-button-primary mt-4 w-full">
                  {selectedTodayIsCompleted ? "Start next" : todayOverride ? "Open selected" : "Start session"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Every session in the active programme is logged.</p>
            )}
          </article>

          {audit.gaps[0] ? (
            <article className="rounded-xl border border-[color-mix(in_srgb,var(--amber)_34%,var(--border))] bg-[var(--amber-soft)] p-4">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[var(--amber)]" aria-hidden="true" />
                <div>
                  <p className="tv-label text-[var(--amber)]">Plan flag</p>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-[var(--text)]">{audit.gaps[0]}</p>
                </div>
              </div>
            </article>
          ) : null}
        </aside>
      </section>

      <section className="tv-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Performance snapshot</p>
            <h2 className="mt-1 text-lg font-black tracking-tight">Four weeks, one screen</h2>
          </div>
          <Link href="/progress" className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--accent)]">
            Performance <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Run distance",
              value: runDataAvailable ? `${formatNumber(metrics.distance28dKm, 1)} km` : "No data yet",
              max: maxDistance,
              accessor: (point: (typeof trend)[number]) => point.distanceKm,
              red: false,
            },
            {
              label: "Elevation",
              value: runDataAvailable ? `${formatNumber(metrics.elevation28dM)} m` : "No data yet",
              max: maxElevation,
              accessor: (point: (typeof trend)[number]) => point.elevationM,
              red: true,
            },
            {
              label: "Training load",
              value: `${metrics.load7d} this week`,
              max: maxLoad,
              accessor: (point: (typeof trend)[number]) => point.load,
              red: false,
            },
            {
              label: "Session RPE",
              value: metrics.averageRpe7d ? `${metrics.averageRpe7d.toFixed(1)} avg` : "No logs yet",
              max: 10,
              accessor: (point: (typeof trend)[number]) => point.averageRpe ?? 0,
              red: true,
            },
          ].map((metric, metricIndex) => (
            <article key={metric.label} className={`p-4 ${metricIndex > 0 ? "border-t border-[var(--border)] sm:border-l sm:border-t-0" : ""} ${metricIndex === 2 ? "sm:border-t xl:border-t-0" : ""}`}>
              <p className="tv-label">{metric.label}</p>
              <p className="mt-1.5 text-xl font-black tracking-tight text-[var(--text)]">{metric.value}</p>
              <div className="mt-4 grid h-16 grid-cols-4 items-end gap-2">
                {trend.map((point) => {
                  const height = Math.max(metric.accessor(point) > 0 ? 8 : 2, (metric.accessor(point) / metric.max) * 100);
                  return (
                    <div key={`${metric.label}-${point.label}`} className="flex h-full items-end rounded-md bg-[var(--surface-strong)] p-1">
                      <div
                        className={`w-full rounded-sm ${metric.red ? "bg-[linear-gradient(180deg,var(--red),#ff7583)]" : "bg-[linear-gradient(180deg,var(--accent),#6aa7ff)]"}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-center text-[0.58rem] font-semibold text-[var(--muted)]">
                {trend.map((point) => <span key={point.label}>{point.label}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/coaching" className="tv-card tv-card-hover flex items-center justify-between gap-4 p-4">
          <div>
            <p className="tv-label text-[var(--accent)]">Coaching</p>
            <p className="mt-1 font-black tracking-tight">Why this plan, what changes next</p>
          </div>
          <BrainCircuit className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        </Link>
        <Link href="/program" className="tv-card tv-card-hover flex items-center justify-between gap-4 p-4">
          <div>
            <p className="tv-label text-[var(--accent)]">Training plan</p>
            <p className="mt-1 font-black tracking-tight">Sessions, moves, scaling and edits</p>
          </div>
          <Dumbbell className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        </Link>
        <Link href="/admin/import" className="tv-card tv-card-hover flex items-center justify-between gap-4 p-4">
          <div>
            <p className="tv-label text-[var(--red)]">Data</p>
            <p className="mt-1 font-black tracking-tight">Import, sync and programme control</p>
          </div>
          <Upload className="h-5 w-5 shrink-0 text-[var(--red)]" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
