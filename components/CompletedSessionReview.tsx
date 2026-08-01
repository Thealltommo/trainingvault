"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";
import type { StructuredRunningWorkout } from "@/lib/garmin";
import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import { buildSessionReview } from "@/lib/session-review";
import type { SessionLog, Workout } from "@/lib/types";

type CompletedSessionReviewProps = {
  workout: Workout;
  log?: SessionLog | null;
  activity?: NormalizedGarminActivity | null;
  structuredWorkout?: StructuredRunningWorkout | null;
  compact?: boolean;
};

function toneStyles(tone: ReturnType<typeof buildSessionReview>["tone"]) {
  if (tone === "positive") {
    return {
      border: "border-[rgba(215,255,47,0.45)]",
      icon: CheckCircle2,
      iconClass: "text-[var(--accent)]",
    };
  }

  if (tone === "watch") {
    return {
      border: "border-amber-300/45",
      icon: ShieldAlert,
      iconClass: "text-amber-200",
    };
  }

  return {
    border: "border-[var(--border)]",
    icon: Activity,
    iconClass: "text-[var(--muted)]",
  };
}

export default function CompletedSessionReview({
  workout,
  log = null,
  activity = null,
  structuredWorkout = null,
  compact = false,
}: CompletedSessionReviewProps) {
  const review = buildSessionReview({
    workout,
    log,
    activity,
    structuredWorkout,
  });
  const tone = toneStyles(review.tone);
  const Icon = tone.icon;

  if (compact) {
    return (
      <div className={`border-l-2 ${tone.border} bg-black/72 p-3 backdrop-blur`}>
        <div className="flex items-start gap-3">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconClass}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="tv-label text-[var(--accent)]">Post-session read</p>
            <p className="mt-1 text-base font-black text-[var(--text)]">
              {review.title}
            </p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-[var(--muted)]">
              {review.summary}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] font-black uppercase text-[var(--muted)]">
              {review.metrics.slice(0, 3).map((metric) => (
                <span key={metric.label}>
                  {metric.label}: <span className="text-[var(--text)]">{metric.value}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      id="post-session-review"
      className={`tv-card scroll-mt-24 overflow-hidden ${tone.border}`}
    >
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(215,255,47,0.10),rgba(0,0,0,0.12)_55%)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-black/70">
              <Icon className={`h-5 w-5 ${tone.iconClass}`} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="tv-label text-[var(--accent)]">Post-session debrief</p>
              <h2 className="mt-1 text-2xl font-black text-[var(--text)] sm:text-3xl">
                {review.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
                {review.summary}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
              {review.sourceLabel}
            </p>
            <p className="mt-1 text-[0.65rem] font-bold text-[var(--muted)]">
              {review.confidence}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {review.metrics.map((metric) => (
            <div
              key={metric.label}
              className="border border-[var(--border)] bg-black/55 p-3"
            >
              <p className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                {metric.label}
              </p>
              <p className="mt-1 break-words text-sm font-black text-[var(--text)]">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.8fr)]">
          <div className="border border-[var(--border)] bg-black/45 p-4">
            <div className="flex items-center gap-2">
              <MessageSquareText
                className="h-4 w-4 text-[var(--accent)]"
                aria-hidden="true"
              />
              <p className="tv-label text-[var(--accent)]">What the evidence says</p>
            </div>
            <ul className="mt-3 grid gap-2 text-sm font-bold text-[var(--muted)]">
              {review.observations.map((observation) => (
                <li
                  key={observation}
                  className="border-l-2 border-[var(--accent)] pl-3 leading-relaxed"
                >
                  {observation}
                </li>
              ))}
            </ul>
          </div>

          <aside className="border border-[rgba(215,255,47,0.32)] bg-[rgba(215,255,47,0.055)] p-4">
            <p className="tv-label text-[var(--accent)]">Next decision</p>
            <p className="mt-2 text-sm font-black leading-relaxed text-[var(--text)]">
              {review.nextAction}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {review.needsAthleteFeedback ? (
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById("session-log-form")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                  className="tv-button-primary"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Add athlete feedback
                </button>
              ) : null}
              <Link href="/coach" className="tv-button-ghost">
                Ask Coach
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
