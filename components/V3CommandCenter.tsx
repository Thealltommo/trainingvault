"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Mountain,
  Route,
  ShieldCheck,
  Watch,
} from "lucide-react";
import V3CloudBrain from "@/components/V3CloudBrain";
import { deriveAdaptiveRunway } from "@/lib/adaptive-runway";
import { assessDailyReadiness } from "@/lib/athlete";
import {
  getCalendarSessions,
  useManualSessions,
  useSessionLifecycleOverrides,
} from "@/lib/planning-storage";
import { toDailyRecoveryInput, useDailyRecovery } from "@/lib/recovery-storage";
import {
  getGarminCompletedSessionIds,
  useGarminLocalState,
} from "@/lib/garmin-storage";
import {
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + amount);
  return localDateKey(parsed);
}

function prettyDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parsed);
}

function recommendationCopy(recommendation: string, hasSession: boolean) {
  if (!hasSession) return "Open capacity. Recovery still informs what you add, but TrainVault will not invent work just to fill the calendar.";
  switch (recommendation) {
    case "full":
      return "Execute the planned stimulus. There is no deterministic recovery reason to reduce it.";
    case "adjusted":
      return "Preserve the session intent, but trim volume or density. Do not turn an amber day into a second hard session.";
    case "minimum":
      return "Use the minimum useful dose. Keep the movement or running stimulus, then get out before fatigue compounds.";
    case "rest":
      return "Do not force the planned session. Recovery signals justify protecting the next useful training day.";
    default:
      return "TrainVault needs more evidence before changing the planned session.";
  }
}

function proposalAction(input: {
  kind: "select_variant" | "reschedule" | "protect";
  variant: "adjusted" | "minimum" | null;
  newDate: string | null;
}) {
  if (input.kind === "protect") return "Protect anchor";
  if (input.kind === "select_variant") return `Use ${input.variant?.toUpperCase() ?? "variant"}`;
  return input.newDate ? `Move → ${prettyDate(input.newDate)}` : "Review move";
}

export default function V3CommandCenter() {
  const [today] = useState(() => localDateKey(new Date()));
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const lifecycle = useSessionLifecycleOverrides();
  const garmin = useGarminLocalState();
  const recovery = useDailyRecovery(today);

  const sessions = useMemo(
    () =>
      getCalendarSessions(
        programme,
        manualSessions,
        logs,
        overrides,
        lifecycle,
        getGarminCompletedSessionIds(garmin),
      ),
    [programme, manualSessions, logs, overrides, lifecycle, garmin],
  );

  const assessment = useMemo(
    () => (recovery ? assessDailyReadiness(toDailyRecoveryInput(recovery)) : null),
    [recovery],
  );

  const sevenDayEnd = addDays(today, 6);
  const runway = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.scheduledDate >= today &&
          session.scheduledDate <= sevenDayEnd &&
          session.status !== "skipped",
      ),
    [sessions, today, sevenDayEnd],
  );
  const adaptive = useMemo(
    () =>
      deriveAdaptiveRunway({
        today,
        readiness: assessment?.recommendation ?? null,
        sessions,
        windowDays: 7,
      }),
    [today, assessment?.recommendation, sessions],
  );

  const todaySession = runway.find((session) => session.scheduledDate === today) ?? null;
  const plannedMinutes = runway
    .filter((session) => session.status !== "completed")
    .reduce((total, session) => total + session.workout.durationMinutes, 0);
  const qualitySessions = runway.filter(
    (session) => session.workout.intensity === "hard" && session.status !== "completed",
  ).length;
  const runningSessions = runway.filter((session) =>
    ["run", "fell-trail", "race"].includes(session.type),
  ).length;
  const completedThisWeek = runway.filter((session) => session.status === "completed").length;

  return (
    <div className="grid gap-5">
      <V3CloudBrain />

      <section className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="tv-card overflow-hidden">
          <div className="border-b border-[var(--border)] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--accent)] text-black">
                <BrainCircuit className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="tv-label text-[var(--accent)]">Deterministic call · today</p>
                <h2 className="mt-1 text-2xl font-black uppercase">Protect the useful work.</h2>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="tv-label">Readiness</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-5xl font-black text-[var(--accent)]">{assessment?.score ?? "—"}</span>
                  <span className="text-xl font-black uppercase">{assessment?.recommendation ?? "awaiting data"}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="tv-label">Today&apos;s session</p>
                <p className="mt-1 text-xl font-black uppercase">{todaySession?.workout.title ?? "Open capacity"}</p>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">
                  {todaySession ? `${todaySession.workout.durationMinutes} min · ${todaySession.workout.intensity}` : "No planned prescription"}
                </p>
              </div>
            </div>
            <p className="border-l-2 border-[var(--accent)] pl-3 text-sm font-bold text-[var(--text)]">
              {recommendationCopy(assessment?.recommendation ?? "unknown", Boolean(todaySession))}
            </p>
            {assessment?.factors?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {assessment.factors.slice(0, 4).map((factor) => (
                  <div key={factor.key} className="border border-[var(--border)] bg-black/45 p-3">
                    <p className="text-xs font-black uppercase text-[var(--muted)]">{factor.direction}</p>
                    <p className="mt-1 text-sm font-bold">{factor.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-bold text-[var(--muted)]">Refresh Garmin or add a check-in to increase decision confidence.</p>
            )}
          </div>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <p className="tv-label text-[var(--accent)]">Seven-day runway</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Work already committed.</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="border border-[var(--border)] bg-black/45 p-3">
              <p className="tv-label">Minutes</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">{plannedMinutes}</p>
            </div>
            <div className="border border-[var(--border)] bg-black/45 p-3">
              <p className="tv-label">Quality</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">{qualitySessions}</p>
            </div>
            <div className="border border-[var(--border)] bg-black/45 p-3">
              <p className="tv-label">Run / trail</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">{runningSessions}</p>
            </div>
            <div className="border border-[var(--border)] bg-black/45 p-3">
              <p className="tv-label">Complete</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">{completedThisWeek}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <Watch className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            {garmin.activities.length} Garmin activities currently cached on this device.
          </div>
        </article>
      </section>

      <section className="tv-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] bg-[linear-gradient(110deg,rgba(215,255,47,0.08),transparent_55%)] p-4 sm:p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <div>
              <p className="tv-label text-[var(--accent)]">Adaptive runway · deterministic</p>
              <h2 className="mt-1 text-2xl font-black uppercase">{adaptive.headline}</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold text-[var(--muted)]">{adaptive.summary}</p>
            </div>
          </div>
          <Link href="/coach" className="tv-button-ghost">
            Ask Coach <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-3 p-4 sm:p-5">
          {adaptive.proposals.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {adaptive.proposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/session/${encodeURIComponent(proposal.sessionId)}`}
                  className="border border-[var(--border)] bg-black/45 p-3 transition-colors hover:border-[var(--accent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="tv-label">{proposal.kind.replaceAll("_", " ")}</span>
                    <span className={`border px-2 py-1 text-[0.62rem] font-black uppercase ${proposal.severity === "strong" ? "border-amber-300 text-amber-200" : "border-[var(--accent)] text-[var(--accent)]"}`}>
                      {proposalAction(proposal)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-black uppercase">{proposal.sessionTitle}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">{proposal.reason}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--muted)]">
              No reversible calendar or variant change is justified by the current deterministic rules.
            </p>
          )}

          {adaptive.warnings.length > 0 ? (
            <div className="grid gap-2">
              {adaptive.warnings.map((warning) => (
                <p key={warning} className="border-l-2 border-amber-300 pl-3 text-xs font-bold text-[var(--muted)]">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="tv-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Next seven days</p>
            <h2 className="mt-1 text-2xl font-black uppercase">The queue, not a wish list.</h2>
          </div>
          <Link href="/plan" className="tv-button-ghost">
            Open plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-4 grid gap-2">
          {runway.length > 0 ? runway.map((session) => {
            const Icon = session.type === "fell-trail" ? Mountain : session.type === "run" || session.type === "race" ? Route : Gauge;
            return (
              <Link
                key={session.id}
                href={`/session/${encodeURIComponent(session.id)}`}
                className="grid gap-2 border border-[var(--border)] bg-black/45 p-3 transition-colors hover:border-[var(--accent)] sm:grid-cols-[8rem_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="tv-label">{prettyDate(session.scheduledDate)}</p>
                  <p className="mt-1 text-xs font-black uppercase text-[var(--muted)]">{session.type}</p>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black uppercase">{session.workout.title}</p>
                    <p className="text-xs font-bold text-[var(--muted)]">{session.workout.durationMinutes} min · {session.workout.intensity} · {session.selectedVariant}</p>
                  </div>
                </div>
                <span className={`justify-self-start border px-2 py-1 text-[0.65rem] font-black uppercase sm:justify-self-end ${session.status === "completed" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
                  {session.status === "completed" ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> done</span> : session.status}
                </span>
              </Link>
            );
          }) : (
            <div className="border border-dashed border-[var(--border)] p-5 text-sm font-bold text-[var(--muted)]">
              No sessions are committed in the next seven days. Add work deliberately rather than letting the calendar fill itself.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/insights/performance" className="tv-card tv-card-hover p-4">
          <Route className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-black uppercase">Performance Lab</h3>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">Interrogate the evidence after the work is done.</p>
        </Link>
        <Link href="/coach" className="tv-card tv-card-hover p-4">
          <BrainCircuit className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-black uppercase">Coach</h3>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">Ask for changes; deterministic guardrails remain authoritative.</p>
        </Link>
        <Link href="/settings/events" className="tv-card tv-card-hover p-4">
          <CalendarClock className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-black uppercase">Events</h3>
          <p className="mt-1 text-xs font-bold text-[var(--muted)]">Protect A races, Spartan weekends and mountain commitments.</p>
        </Link>
      </section>
    </div>
  );
}
