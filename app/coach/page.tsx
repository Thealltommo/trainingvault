"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  CalendarClock,
  Check,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { assessDailyReadiness } from "@/lib/athlete";
import type {
  CoachDecision,
  CoachProposal,
  CoachRequest,
} from "@/lib/coach-schema";
import {
  getGarminCompletedSessionIds,
  useGarminLocalState,
} from "@/lib/garmin-storage";
import {
  getCalendarSessions,
  rescheduleCalendarSession,
  selectCalendarSessionVariant,
  useManualSessions,
  useSessionLifecycleOverrides,
} from "@/lib/planning-storage";
import { toDailyRecoveryInput, useDailyRecovery } from "@/lib/recovery-storage";
import {
  useActiveProgrammeOptional,
  useNow,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";

type CoachEnvelope = {
  source: "openai" | "fallback";
  configured: boolean;
  decisionKey?: string;
  decision: CoachDecision;
};

type Exchange = {
  id: string;
  question: string;
  response: CoachEnvelope;
};

const quickPrompts = [
  "Review my next seven days for lower-body interference.",
  "What should I protect if recovery is poor this week?",
  "Explain the intent of my next quality session.",
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function looksLowerBody(value: string) {
  return /(run|squat|lunge|wall ball|sled|box jump|clean|deadlift|fell|trail|hike|race|hyrox)/i.test(
    value,
  );
}

export default function CoachPage() {
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const garmin = useGarminLocalState();
  const now = useNow();
  const today = localDateKey(new Date(now || 0));
  const recovery = useDailyRecovery(today);
  const readiness = useMemo(
    () => (now !== 0 && recovery ? assessDailyReadiness(toDailyRecoveryInput(recovery)) : null),
    [now, recovery],
  );
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [appliedProposalIds, setAppliedProposalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const garminCompletedIds = useMemo(
    () => getGarminCompletedSessionIds(garmin),
    [garmin],
  );
  const sessions = useMemo(
    () =>
      getCalendarSessions(
        programme,
        manualSessions,
        logs,
        overrides,
        lifecycle,
        garminCompletedIds,
      ),
    [garminCompletedIds, programme, manualSessions, logs, overrides, lifecycle],
  );

  function buildRequest(question: string): CoachRequest {
    const referenceTime = new Date(`${today}T00:00:00Z`).getTime();
    const boundedSessions = sessions
      .filter((session) => {
        if (!session.scheduledDate) return false;
        const sessionTime = new Date(`${session.scheduledDate}T00:00:00Z`).getTime();
        return (
          Number.isFinite(sessionTime) &&
          Math.abs(sessionTime - referenceTime) <= 21 * 86_400_000
        );
      })
      .slice(0, 42)
      .map((session) => {
        const loadText = [
          session.type,
          session.workout.title,
          ...session.workout.focus,
          ...session.workout.blocks.flatMap((block) => block.items),
        ].join(" ");

        return {
          id: session.id,
          title: session.workout.title.slice(0, 180),
          date: session.scheduledDate || null,
          type: session.type,
          status: session.status,
          variant: session.selectedVariant,
          durationMinutes: session.workout.durationMinutes,
          intensity: session.workout.intensity,
          targetStimulus: session.workout.targetStimulus?.slice(0, 500) ?? null,
          lowerBodySignal: looksLowerBody(loadText),
        };
      });

    const recentLogs = [...logs]
      .sort(
        (first, second) =>
          new Date(second.completedAt).getTime() - new Date(first.completedAt).getTime(),
      )
      .slice(0, 24)
      .map((log) => ({
        sessionId: log.workoutId,
        title: log.workoutTitle.slice(0, 180),
        completedAt: log.completedAt,
        rpe: Math.max(0, Math.min(10, log.rpe)),
        durationMinutes: log.actualDurationMinutes ?? null,
        notes: log.notes?.slice(0, 500) ?? null,
      }));

    const upcomingEvents = [
      programme?.targetDate
        ? {
            title: programme.targetEvent || "Target event",
            date: programme.targetDate,
            priority: "A" as const,
          }
        : null,
      programme?.checkpointDate
        ? {
            title: programme.checkpointName || "Checkpoint",
            date: programme.checkpointDate,
            priority: "B" as const,
          }
        : null,
    ].filter(
      (
        event,
      ): event is {
        title: string;
        date: string;
        priority: "A" | "B";
      } => Boolean(event),
    );

    return {
      message: question,
      context: {
        today,
        readiness: {
          zone: readiness ? readiness.zone.toLowerCase() as "green" | "amber" | "red" : null,
          score: readiness?.score ?? null,
          factors: readiness?.factors.slice(0, 12).map((factor) => factor.label) ?? [],
          athleteOverride: readiness?.manualOverrideApplied ?? false,
        },
        sessions: boundedSessions,
        recentLogs,
        upcomingEvents,
      },
    };
  }

  async function askCoach(event: FormEvent) {
    event.preventDefault();
    const question = message.trim();
    if (!question || pending || now === 0) return;

    setPending(true);
    setError("");
    setAuditNote("");

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest(question)),
      });
      const payload = (await response.json()) as CoachEnvelope | { error?: string };

      if (!response.ok || !("decision" in payload)) {
        throw new Error(
          "error" in payload && payload.error ? payload.error : "Coach request failed",
        );
      }

      setExchanges((current) => [
        {
          id: crypto.randomUUID(),
          question,
          response: payload,
        },
        ...current,
      ]);
      setMessage("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Coach is unavailable. Your plan has not changed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function auditAppliedProposal(decisionKey: string | undefined, proposal: CoachProposal) {
    if (!decisionKey) return;
    try {
      const response = await fetch("/api/v3/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionKey,
          proposalId: proposal.id,
          sessionId: proposal.sessionId,
          sessionTitle: proposal.sessionTitle,
          action: proposal.action,
          newDate: proposal.newDate,
          variant: proposal.variant,
          reason: proposal.reason,
        }),
      });
      if (!response.ok) throw new Error("audit failed");
      setAuditNote("Confirmed change written to V3 decision history.");
    } catch {
      setAuditNote("Plan changed successfully; V3 decision audit will retry on a future action.");
    }
  }

  function applyProposal(proposal: CoachProposal, decisionKey?: string) {
    const session = sessions.find((candidate) => candidate.id === proposal.sessionId);

    if (!session) {
      setError("That session is no longer in the current plan.");
      return;
    }

    const detail =
      proposal.action === "reschedule"
        ? `Move ${session.workout.title} to ${proposal.newDate}?`
        : `Select ${proposal.variant?.toUpperCase()} for ${session.workout.title}?`;

    if (
      !window.confirm(
        `${detail}\n\nReason: ${proposal.reason}\n\nThe original prescription will be preserved.`,
      )
    ) {
      return;
    }

    if (proposal.action === "reschedule" && proposal.newDate) {
      rescheduleCalendarSession(session, proposal.newDate);
    } else if (proposal.action === "select_variant" && proposal.variant) {
      selectCalendarSessionVariant(
        session,
        proposal.variant,
        `Coach proposal confirmed by athlete: ${proposal.reason}`,
      );
    } else {
      setError("The proposed change was incomplete and was not applied.");
      return;
    }

    setAppliedProposalIds((current) => {
      const next = new Set(current);
      next.add(proposal.id);
      return next;
    });
    void auditAppliedProposal(decisionKey, proposal);
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Coach · V3</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
          Ask, inspect, confirm
        </h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-[var(--muted)]">
          Coach receives bounded plan, recovery and recent training context. It can explain and propose reversible changes, but deterministic rules remain authoritative and every write still needs your confirmation.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <article className="tv-card border-[rgba(215,255,47,0.34)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-[var(--accent)] text-black">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="tv-label text-[var(--accent)]">Controlled interpretation</p>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">
                {readiness
                  ? `Today is ${readiness.zone} · ${readiness.score}/100 · ${readiness.recommendation.toUpperCase()}. That real readiness context is included with your request.`
                  : "Recovery is not available for today yet. Coach will say so rather than manufacture a readiness state."}
              </p>
            </div>
          </div>

          <form onSubmit={askCoach} className="mt-5 grid gap-3">
            <label htmlFor="coach-message" className="tv-label">What needs sorting?</label>
            <textarea
              id="coach-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2_000}
              rows={5}
              className="tv-input min-h-32 resize-y py-3"
              placeholder="My legs are destroyed from Hawkeye and I am going to Helvellyn Saturday. Sort my week."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--muted)]">{message.length}/2000 · no automatic writes</span>
              <button
                type="submit"
                disabled={pending || message.trim().length < 2 || now === 0}
                className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {pending ? "Thinking…" : "Ask Coach"}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setMessage(prompt)}
                className="min-h-10 rounded-sm border border-[var(--border)] bg-black px-3 text-left text-xs font-black uppercase text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </article>

        <Link href="/command" className="tv-card tv-card-hover flex min-w-52 flex-col justify-between p-4">
          <BrainCircuit className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <div className="mt-8">
            <p className="tv-label">Before the model</p>
            <p className="mt-1 text-lg font-black uppercase">Check deterministic runway</p>
          </div>
        </Link>
      </section>

      {error ? (
        <div role="alert" className="flex items-start gap-3 border border-white/20 bg-white/5 p-4 text-sm font-bold text-[var(--muted)]">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          {error} Your calendar and today&apos;s session remain available.
        </div>
      ) : null}

      {auditNote ? (
        <p className="border-l-2 border-[var(--accent)] pl-3 text-xs font-bold text-[var(--muted)]">{auditNote}</p>
      ) : null}

      {exchanges.length === 0 ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="tv-card p-4">
            <CalendarClock className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-black uppercase">Real plan context</h2>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">At most 42 nearby sessions and 24 recent logs are sent.</p>
          </article>
          <article className="tv-card p-4">
            <ShieldCheck className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-black uppercase">Rules stay in code</h2>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">Recovery and interference logic is not delegated to the model.</p>
          </article>
          <article className="tv-card p-4">
            <MessageSquareText className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-black uppercase">Athlete decides</h2>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">Confirmed proposals are applied locally and audited into V3 cloud history.</p>
          </article>
        </section>
      ) : null}

      <section className="grid gap-4" aria-live="polite">
        {exchanges.map((exchange) => {
          const decision = exchange.response.decision;
          return (
            <article key={exchange.id} className="tv-card overflow-hidden">
              <div className="border-b border-[var(--border)] bg-black p-4">
                <p className="tv-label">You</p>
                <p className="mt-2 text-sm font-black">{exchange.question}</p>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="tv-label text-[var(--accent)]">Coach response</p>
                  <span className="tv-chip border-[var(--border)] bg-black text-[var(--muted)]">
                    {exchange.response.source === "openai" ? "OpenAI · structured · V3 audited" : "Safe fallback · V3 audited"}
                  </span>
                </div>
                <p className="mt-3 text-lg font-black leading-snug">{decision.summary}</p>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="tv-label">Why</p>
                    <ul className="mt-2 grid gap-2">
                      {decision.rationale.map((reason) => (
                        <li key={reason} className="border-l-2 border-[var(--accent)] pl-3 text-sm font-bold text-[var(--muted)]">{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="tv-label">Data used · {decision.confidence} confidence</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {decision.dataSummary.map((item) => (
                        <span key={item} className="tv-chip border-[var(--border)] bg-black text-[var(--muted)]">{item}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {decision.proposedChanges.length > 0 ? (
                  <div className="mt-5 border-t border-[var(--border)] pt-5">
                    <p className="tv-label text-[var(--accent)]">Proposed changes · confirmation required</p>
                    <div className="mt-3 grid gap-3">
                      {decision.proposedChanges.map((proposal) => {
                        const applied = appliedProposalIds.has(proposal.id);
                        return (
                          <article key={proposal.id} className="border border-[var(--border)] bg-black p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-black uppercase">{proposal.sessionTitle}</p>
                                <p className="mt-1 text-xs font-black uppercase text-[var(--accent)]">
                                  {proposal.action === "reschedule"
                                    ? `${proposal.currentDate ?? "Unscheduled"} → ${proposal.newDate}`
                                    : `Select ${proposal.variant}`}
                                </p>
                                <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">{proposal.reason}</p>
                              </div>
                              <button
                                type="button"
                                disabled={applied}
                                onClick={() => applyProposal(proposal, exchange.response.decisionKey)}
                                className={
                                  applied
                                    ? "tv-button-ghost cursor-default border-[var(--accent)] text-[var(--accent)]"
                                    : "tv-button-primary"
                                }
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                                {applied ? "Applied + audited" : "Review & apply"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {decision.cautions.length > 0 ? (
                  <div className="mt-5 border-t border-[var(--border)] pt-4">
                    {decision.cautions.map((caution) => (
                      <p key={caution} className="text-xs font-bold text-[var(--muted)]">{caution}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <p className="text-xs font-bold text-[var(--muted)]">
        Training guidance only, not medical advice. <Link href="/plan" className="text-[var(--accent)] underline">Review the calendar</Link> before training.
      </p>
    </div>
  );
}
