"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  BrainCircuit,
  CircleCheck,
  Dumbbell,
  Gauge,
  Info,
  Mountain,
  Route,
  ShieldCheck,
  Target,
  TriangleAlert,
  TrendingUp,
} from "lucide-react";
import {
  auditCurrentPlan,
  buildCoachingInsights,
  buildTrainingMetrics,
  buildWeeklyTrend,
  getGoalCopy,
  type CoachingInsight,
  type CoachingTone,
} from "@/lib/coaching";
import {
  useActiveProgrammeOptional,
  useNow,
  useSessionLogs,
} from "@/lib/storage";

const toneClasses: Record<CoachingTone, string> = {
  blue: "border-[color-mix(in_srgb,var(--accent)_34%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  red: "border-[color-mix(in_srgb,var(--red)_34%,var(--border))] bg-[var(--red-soft)] text-[var(--red)]",
  amber: "border-[color-mix(in_srgb,var(--amber)_34%,var(--border))] bg-[var(--amber-soft)] text-[var(--amber)]",
  green: "border-[color-mix(in_srgb,var(--green)_34%,var(--border))] bg-[var(--green-soft)] text-[var(--green)]",
  purple: "border-[color-mix(in_srgb,var(--purple)_34%,var(--border))] bg-[var(--purple-soft)] text-[var(--purple)]",
};

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function scoreLabel(score: number) {
  if (score >= 90) return "Purposeful";
  if (score >= 78) return "Strong structure";
  if (score >= 65) return "Needs refinement";
  return "Interference risk";
}

function InsightCard({ insight }: { insight: CoachingInsight }) {
  const Icon = insight.tone === "red" ? TriangleAlert : insight.tone === "green" ? CircleCheck : BrainCircuit;

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneClasses[insight.tone]}`}>
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black tracking-tight text-[var(--text)]">{insight.title}</h3>
            <span className="tv-chip border-[var(--border)] bg-[var(--surface-strong)] text-[var(--muted)]">
              {insight.confidence} confidence
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-[var(--muted)]">{insight.summary}</p>
          <div className="mt-3 rounded-lg border-l-2 border-[var(--accent)] bg-[var(--surface-strong)] px-3 py-2.5">
            <p className="tv-label text-[var(--accent)]">Do this</p>
            <p className="mt-1 text-sm font-bold leading-relaxed text-[var(--text)]">{insight.action}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CoachingPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const now = useNow();
  const metrics = useMemo(() => buildTrainingMetrics(programme, logs, now), [programme, logs, now]);
  const audit = useMemo(() => auditCurrentPlan(programme, logs, now), [programme, logs, now]);
  const insights = useMemo(() => buildCoachingInsights(programme, logs, now), [programme, logs, now]);
  const trend = useMemo(() => buildWeeklyTrend(programme, logs, now), [programme, logs, now]);
  const goals = useMemo(() => getGoalCopy(programme), [programme]);
  const maxLoad = Math.max(...trend.map((point) => point.load), 1);

  if (!programme) {
    return (
      <div className="agoge-page">
        <section className="tv-card p-5 sm:p-6">
          <p className="tv-label text-[var(--accent)]">Agoge Coaching</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Give the coach something to work with.</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[var(--muted)]">
            Import a programme, then log sessions. Coaching is derived from the plan, duration, RPE, limiters and run metrics — not invented wearable numbers.
          </p>
          <Link href="/admin/import" className="tv-button-primary mt-5 w-fit">Import programme</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="agoge-page">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--sidebar)] p-5 text-white shadow-[var(--shadow-strong)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_75%_20%,rgba(79,140,255,0.24),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_80%_90%,rgba(221,31,54,0.17),transparent_55%)]" />
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.45fr_0.8fr] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[#84b1ff]">
              <BrainCircuit className="h-5 w-5" aria-hidden="true" />
              <p className="text-xs font-black uppercase tracking-[0.14em]">Coaching command centre</p>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              The plan should react to the athlete — not repeat a template.
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-[#b8c8da]">
              This audit checks run variety, CrossFit interference, hills, easy volume, race-week overload and your actual session-RPE history. It tells you what to protect, what to rotate and what not to pile on.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#8fa7c1]">Plan audit</p>
              <p className="mt-1 text-3xl font-black">{audit.score}<span className="text-base text-[#8298b2]">/100</span></p>
              <p className="mt-1 text-xs font-bold text-[#91b5f5]">{scoreLabel(audit.score)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#8fa7c1]">Readiness</p>
              <p className="mt-1 text-3xl font-black">{metrics.readiness}<span className="text-base text-[#8298b2]">/100</span></p>
              <p className="mt-1 text-xs font-bold text-[#91b5f5]">{metrics.readinessLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <article className="tv-kpi">
          <Gauge className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">7d load</p>
          <p className="tv-kpi-value">{metrics.load7d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">session-RPE load</p>
        </article>
        <article className="tv-kpi">
          <Activity className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Load ratio</p>
          <p className="tv-kpi-value">{metrics.loadRatio ? metrics.loadRatio.toFixed(2) : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">7d / 28d weekly avg</p>
        </article>
        <article className="tv-kpi">
          <Route className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Run sessions</p>
          <p className="tv-kpi-value">{audit.runSessions}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{audit.qualityRuns} quality / {audit.easyRuns} easy</p>
        </article>
        <article className="tv-kpi">
          <Mountain className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Hill / fell</p>
          <p className="tv-kpi-value">{audit.hillSessions}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">current week</p>
        </article>
        <article className="tv-kpi">
          <Dumbbell className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">CrossFit load</p>
          <p className="tv-kpi-value">{audit.crossFitSessions}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">planned sessions</p>
        </article>
        <article className="tv-kpi">
          <TriangleAlert className="h-4.5 w-4.5 text-[var(--amber)]" aria-hidden="true" />
          <p className="tv-label mt-2">Clashes</p>
          <p className="tv-kpi-value">{audit.hardDayClashes + audit.lowerBodyRunClashes}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">hard / leg-run interference</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
        <div className="grid gap-3">
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <p className="tv-label text-[var(--accent)]">Coach notes</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">What matters now</h2>
            </div>
            <span className="hidden text-xs font-semibold text-[var(--muted)] sm:block">{insights.length} live insights</span>
          </div>
          {insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
        </div>

        <aside className="grid content-start gap-4">
          <article className="tv-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tv-label text-[var(--accent)]">Current week</p>
                <h2 className="mt-1 font-black tracking-tight">Plan anatomy</h2>
              </div>
              <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {[
                ["Runs", audit.runSessions],
                ["Quality", audit.qualityRuns],
                ["Easy", audit.easyRuns],
                ["Long", audit.longRuns],
                ["Hills", audit.hillSessions],
                ["CrossFit", audit.crossFitSessions],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
                  <p className="mt-0.5 text-xl font-black text-[var(--text)]">{value}</p>
                </div>
              ))}
            </div>

            {audit.strengths.length > 0 ? (
              <div className="mt-4">
                <p className="tv-label text-[var(--green)]">Keep</p>
                <div className="mt-2 grid gap-2">
                  {audit.strengths.slice(0, 4).map((item) => (
                    <div key={item} className="flex gap-2 text-sm font-semibold leading-relaxed text-[var(--muted)]">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {audit.gaps.length > 0 ? (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <p className="tv-label text-[var(--red)]">Change</p>
                <div className="mt-2 grid gap-2">
                  {audit.gaps.slice(0, 4).map((item) => (
                    <div key={item} className="flex gap-2 text-sm font-semibold leading-relaxed text-[var(--muted)]">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--red)]" aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Link href="/program" className="tv-button-ghost mt-4 w-full">Review full plan</Link>
          </article>

          <article className="tv-card p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-[var(--red)]" aria-hidden="true" />
              <div>
                <p className="tv-label">Performance direction</p>
                <h2 className="mt-1 font-black tracking-tight">Three linked goals</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {[goals.primary, goals.secondary, goals.tertiary].map((goal, index) => (
                <div key={goal} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-black ${index === 0 ? "bg-[var(--red-soft)] text-[var(--red)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
                    {index + 1}
                  </span>
                  <p className="text-sm font-black text-[var(--text)]">{goal}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="tv-card p-4">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <p className="tv-label">Data confidence</p>
                <h2 className="mt-1 font-black tracking-tight">No fake physiology</h2>
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--muted)]">{metrics.readinessDetail}</p>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm font-semibold">
              <span className="text-[var(--muted)]">Structured run logs, 28d</span>
              <span className="font-black text-[var(--text)]">{metrics.runLogsWithMetrics}</span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--muted)]">
              Readiness is currently a training-load estimate. HRV, sleep and resting HR are not shown unless a real data source is connected.
            </p>
          </article>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="tv-card p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <p className="tv-label">Four-week load</p>
              <h2 className="mt-1 font-black tracking-tight">Is the work actually building?</h2>
            </div>
          </div>
          <div className="mt-5 grid h-40 grid-cols-4 items-end gap-3">
            {trend.map((point) => {
              const height = Math.max(8, (point.load / maxLoad) * 100);
              return (
                <div key={point.label} className="flex h-full flex-col justify-end gap-2">
                  <div className="flex h-full items-end rounded-lg bg-[var(--surface-strong)] p-1.5">
                    <div className="w-full rounded-md bg-[linear-gradient(180deg,var(--accent),#2f72ee)]" style={{ height: `${height}%` }} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black text-[var(--text)]">{point.load}</p>
                    <p className="text-[0.64rem] font-semibold text-[var(--muted)]">{point.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label text-[var(--red)]">Recommended rotation</p>
          <h2 className="mt-1 text-xl font-black tracking-tight">Make three run days behave like a real programme.</h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--muted)]">
            Three runs can be enough alongside CrossFit, but the stimulus should rotate. This is the default pattern when there is no race weekend; races replace work rather than being added to it.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["A · Speed", "Threshold anchor · VO₂ reps · easy/hilly long run"],
              ["B · Hills", "Threshold anchor · hill power · controlled long run"],
              ["C · Economy", "Threshold anchor · short fast reps/strides · progressive fell long run"],
              ["D · Absorb", "Reduced quality · time trial or benchmark · shorter easy long run"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <p className="text-sm font-black text-[var(--text)]">{title}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--red)_28%,var(--border))] bg-[var(--red-soft)] p-3">
            <p className="text-sm font-black text-[var(--red)]">Trifecta rule</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--text)]">
              Sprint + Super + Beast is not “extra cardio.” It becomes the week’s quality, hill and long-duration block. Strip normal hard sessions away around it, then recover.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
