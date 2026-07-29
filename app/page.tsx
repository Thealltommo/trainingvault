"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Gauge,
  HeartPulse,
  Moon,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Watch,
} from "lucide-react";
import WorkoutCard from "@/components/WorkoutCard";
import {
  assessDailyReadiness,
  classifySessionLoad,
  type AthleteSessionCategory,
  type DailyRecoveryInput,
  type ReadinessAssessment,
  type ReadinessRecommendation,
  type SessionPrescription,
} from "@/lib/athlete";
import {
  getCalendarSessions,
  useManualSessions,
  useSessionLifecycleOverrides,
  type AthleteSessionType,
  type CalendarSession,
} from "@/lib/planning-storage";
import {
  recoverySignalCount,
  saveDailyCheckIn,
  toDailyRecoveryInput,
  useDailyRecovery,
  type DailyRecoveryRecord,
} from "@/lib/recovery-storage";
import { normalizeLimiter } from "@/lib/session-log";
import {
  useActiveProgrammeOptional,
  useClientReady,
  useNow,
  useSessionLogs,
  useTodayWorkoutOverride,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { Programme, SessionLog, Workout } from "@/lib/types";

const DAY_MS = 86_400_000;

type TrainingSignals = {
  recentLoad7d: number | null;
  baselineLoad7d: number | null;
  lowerBodyLoad48h: number | null;
  runningLoad7d: number | null;
  highIntensitySessions72h: number | null;
};

type UpcomingEvent = {
  name: string;
  date: string;
  priority: "A" | "B";
  days: number;
  kind: "Target event" | "Checkpoint";
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = dateFromKey(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    options ?? {
      weekday: "short",
      day: "numeric",
      month: "short",
    },
  ).format(date);
}

function numberOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedCategory(type: AthleteSessionType): AthleteSessionCategory {
  switch (type) {
    case "fell-trail":
      return "trail";
    case "crossfit":
    case "conditioning":
    case "hike":
    case "hyrox":
    case "mobility":
    case "race":
    case "recovery":
    case "rest":
    case "run":
    case "strength":
      return type;
    default:
      return "custom";
  }
}

function workoutPrescription(
  workout: Workout,
  type: AthleteSessionType,
): SessionPrescription {
  return {
    title: workout.title,
    category: normalizedCategory(type),
    legacyCategory: workout.category,
    sessionType: workout.sessionType,
    phase: workout.phase,
    priority: workout.priority,
    date: workout.date,
    durationMinutes: workout.durationMinutes,
    minimumMinutes: workout.minimumMinutes,
    intensity: workout.intensity,
    focus: [...workout.focus],
    equipment: [...workout.equipment],
    blocks: workout.blocks.map((block, index) => ({
      id: `${workout.id}-block-${index + 1}`,
      name: block.name,
      type: block.type,
      durationMinutes: block.durationMinutes,
      items: [...block.items],
    })),
    targets: {
      prescribedLoadsOrPace: workout.prescribedLoadsOrPace,
      targetStimulus: workout.targetStimulus,
    },
    scalingNotes: workout.scalingNotes,
    coachNotes: workout.coachNotes,
    substitutions: [...(workout.substitutions ?? [])],
  };
}

function isRunningSession(session: CalendarSession | undefined) {
  return Boolean(
    session &&
      ["run", "fell-trail", "race"].includes(session.type),
  );
}

function trainingLoadForLog(
  log: SessionLog,
  session: CalendarSession | undefined,
) {
  const minutes =
    log.actualDurationMinutes ?? session?.workout.durationMinutes ?? 0;
  return Math.max(0, minutes) * Math.max(0, log.rpe);
}

function deriveTrainingSignals(
  logs: SessionLog[],
  sessions: CalendarSession[],
  now: number,
): TrainingSignals {
  if (!now || logs.length === 0) {
    return {
      recentLoad7d: null,
      baselineLoad7d: null,
      lowerBodyLoad48h: null,
      runningLoad7d: null,
      highIntensitySessions72h: null,
    };
  }

  const sessionById = new Map(
    sessions.map((session) => [session.id, session] as const),
  );
  const timestamped = logs
    .map((log) => ({
      log,
      timestamp: new Date(log.completedAt).getTime(),
      session: sessionById.get(log.workoutId),
    }))
    .filter((item) => Number.isFinite(item.timestamp));
  const recent7d = timestamped.filter(
    (item) => item.timestamp >= now - 7 * DAY_MS && item.timestamp <= now,
  );
  const previous21d = timestamped.filter(
    (item) =>
      item.timestamp >= now - 28 * DAY_MS &&
      item.timestamp < now - 7 * DAY_MS,
  );
  const recent48h = timestamped.filter(
    (item) => item.timestamp >= now - 2 * DAY_MS && item.timestamp <= now,
  );
  const recent72h = timestamped.filter(
    (item) => item.timestamp >= now - 3 * DAY_MS && item.timestamp <= now,
  );
  const recentLoad = recent7d.reduce(
    (total, item) =>
      total + trainingLoadForLog(item.log, item.session),
    0,
  );
  const historicalLoad = previous21d.reduce(
    (total, item) =>
      total + trainingLoadForLog(item.log, item.session),
    0,
  );
  const runningLoad = recent7d.reduce(
    (total, item) =>
      isRunningSession(item.session)
        ? total + trainingLoadForLog(item.log, item.session)
        : total,
    0,
  );
  const lowerBodyContributions = recent48h.flatMap((item) => {
    if (!item.session) {
      return [];
    }

    const load = classifySessionLoad(
      workoutPrescription(item.session.workout, item.session.type),
    );
    const duration =
      item.log.actualDurationMinutes ??
      item.session.workout.durationMinutes;
    return [
      (load.scores.lowerBody / 5) *
        Math.min(1.5, duration / 60) *
        (item.log.rpe / 10) *
        55,
    ];
  });
  const lowerBodyLoad =
    lowerBodyContributions.length > 0
      ? Math.min(
          100,
          Math.round(
            lowerBodyContributions.reduce(
              (total, contribution) => total + contribution,
              0,
            ),
          ),
        )
      : null;
  const highIntensitySessions = recent72h.filter(
    (item) =>
      item.log.rpe >= 8 || item.session?.workout.intensity === "hard",
  ).length;

  return {
    recentLoad7d: recent7d.length > 0 ? Math.round(recentLoad) : null,
    baselineLoad7d:
      previous21d.length >= 2 ? Math.round(historicalLoad / 3) : null,
    lowerBodyLoad48h: lowerBodyLoad,
    runningLoad7d: recent7d.some((item) => isRunningSession(item.session))
      ? Math.round(runningLoad)
      : null,
    highIntensitySessions72h:
      timestamped.length > 0 ? highIntensitySessions : null,
  };
}

function getUpcomingEvent(
  programme: Programme | null,
  todayKey: string,
): UpcomingEvent | null {
  const today = dateFromKey(todayKey);

  if (!programme || !today) {
    return null;
  }

  const candidates = [
    programme.targetDate
      ? {
          name: programme.targetEvent ?? "Target event",
          date: programme.targetDate,
          priority: "A" as const,
          kind: "Target event" as const,
        }
      : null,
    programme.checkpointDate
      ? {
          name: programme.checkpointName ?? "Checkpoint",
          date: programme.checkpointDate,
          priority: "B" as const,
          kind: "Checkpoint" as const,
        }
      : null,
  ].flatMap((event) => {
    if (!event) {
      return [];
    }

    const date = dateFromKey(event.date);

    if (!date) {
      return [];
    }

    const days = Math.round((date.getTime() - today.getTime()) / DAY_MS);
    return days >= 0 ? [{ ...event, days }] : [];
  });

  return (
    candidates.sort(
      (first, second) =>
        first.days - second.days ||
        first.priority.localeCompare(second.priority),
    )[0] ?? null
  );
}

function readinessInputSignalCount(input: DailyRecoveryInput) {
  return [
    input.sleepHours ?? input.sleepScore,
    input.hrvMs != null && input.hrvBaselineMs != null
      ? input.hrvMs
      : null,
    input.restingHeartRate != null &&
    input.restingHeartRateBaseline != null
      ? input.restingHeartRate
      : null,
    input.garminReadiness,
    input.recentLoad7d != null && input.baselineLoad7d != null
      ? input.recentLoad7d
      : null,
    input.lowerBodyLoad48h,
    input.highIntensitySessions72h,
    input.soreness,
    input.subjectiveReadiness,
    input.daysSinceRest,
  ].filter((value) => value !== null && value !== undefined).length;
}

function getLatestLogSummary(log: SessionLog) {
  const parts: string[] = [];

  if (log.actualDurationMinutes) {
    parts.push(`${log.actualDurationMinutes} min`);
  }

  parts.push(`RPE ${log.rpe}`);
  const limiter = normalizeLimiter(log.limiter);

  if (limiter) {
    parts.push(`limiter: ${limiter}`);
  }

  return parts.join(" / ");
}

function recommendationCopy(
  assessment: ReadinessAssessment | null,
  selectedVariant: CalendarSession["selectedVariant"] | undefined,
) {
  if (!assessment) {
    return selectedVariant
      ? `The plan currently uses ${selectedVariant.toUpperCase()}. Add a check-in to calculate a recovery-aware recommendation.`
      : "Add a check-in to calculate a recovery-aware training decision.";
  }

  const copy = {
    full: "Recovery supports the planned session.",
    adjusted:
      "Preserve the main intent, but reduce today’s training cost.",
    minimum:
      "Use the smallest useful dose and reassess during the warm-up.",
    rest: "Recovery signals favour rest or very easy recovery today.",
  }[assessment.recommendation];

  return assessment.manualOverrideApplied
    ? `${copy} Athlete override is active; rules suggested ${assessment.computedRecommendation.toUpperCase()}.`
    : copy;
}

function CheckInForm({
  date,
  record,
}: {
  date: string;
  record: DailyRecoveryRecord | null;
}) {
  const [sleepHours, setSleepHours] = useState(
    record?.sleepHours?.toString() ?? "",
  );
  const [soreness, setSoreness] = useState(
    record?.soreness?.toString() ?? "",
  );
  const [subjectiveReadiness, setSubjectiveReadiness] = useState(
    record?.subjectiveReadiness?.toString() ?? "",
  );
  const [hrvMs, setHrvMs] = useState(record?.hrvMs?.toString() ?? "");
  const [hrvBaselineMs, setHrvBaselineMs] = useState(
    record?.hrvBaselineMs?.toString() ?? "",
  );
  const [restingHeartRate, setRestingHeartRate] = useState(
    record?.restingHeartRate?.toString() ?? "",
  );
  const [restingHeartRateBaseline, setRestingHeartRateBaseline] =
    useState(record?.restingHeartRateBaseline?.toString() ?? "");
  const [manualOverride, setManualOverride] = useState<
    ReadinessRecommendation | ""
  >(record?.manualOverride ?? "");
  const [reason, setReason] = useState(
    record?.manualOverrideReason ?? "",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveDailyCheckIn({
      date,
      sleepHours: numberOrNull(sleepHours),
      hrvMs: numberOrNull(hrvMs),
      hrvBaselineMs: numberOrNull(hrvBaselineMs),
      restingHeartRate: numberOrNull(restingHeartRate),
      restingHeartRateBaseline: numberOrNull(
        restingHeartRateBaseline,
      ),
      soreness: numberOrNull(soreness),
      subjectiveReadiness: numberOrNull(subjectiveReadiness),
      manualOverride: manualOverride || null,
      manualOverrideReason:
        manualOverride && reason.trim() ? reason.trim() : null,
    });
  }

  return (
    <details
      className="mt-4 border-t border-[var(--border)] pt-4"
      open={!record}
    >
      <summary className="cursor-pointer text-xs font-black uppercase text-[var(--accent)]">
        {record ? "Update check-in" : "Add 30-second check-in"}
      </summary>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1">
            <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
              Sleep h
            </span>
            <input
              className="tv-input px-2"
              type="number"
              min="0"
              max="24"
              step="0.1"
              inputMode="decimal"
              value={sleepHours}
              onChange={(event) => setSleepHours(event.target.value)}
              placeholder="—"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
              Sore /10
            </span>
            <input
              className="tv-input px-2"
              type="number"
              min="0"
              max="10"
              inputMode="numeric"
              value={soreness}
              onChange={(event) => setSoreness(event.target.value)}
              placeholder="—"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
              Ready /10
            </span>
            <input
              className="tv-input px-2"
              type="number"
              min="0"
              max="10"
              inputMode="numeric"
              value={subjectiveReadiness}
              onChange={(event) =>
                setSubjectiveReadiness(event.target.value)
              }
              placeholder="—"
            />
          </label>
        </div>

        <details className="rounded-sm border border-[var(--border)] bg-black p-3">
          <summary className="cursor-pointer text-[0.68rem] font-black uppercase text-[var(--muted)]">
            Optional manual HRV / resting HR
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                HRV ms
              </span>
              <input
                className="tv-input px-2"
                type="number"
                min="1"
                max="300"
                value={hrvMs}
                onChange={(event) => setHrvMs(event.target.value)}
                placeholder="Today"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                HRV baseline
              </span>
              <input
                className="tv-input px-2"
                type="number"
                min="1"
                max="300"
                value={hrvBaselineMs}
                onChange={(event) =>
                  setHrvBaselineMs(event.target.value)
                }
                placeholder="Baseline"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                Resting HR
              </span>
              <input
                className="tv-input px-2"
                type="number"
                min="20"
                max="250"
                value={restingHeartRate}
                onChange={(event) =>
                  setRestingHeartRate(event.target.value)
                }
                placeholder="Today"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                RHR baseline
              </span>
              <input
                className="tv-input px-2"
                type="number"
                min="20"
                max="250"
                value={restingHeartRateBaseline}
                onChange={(event) =>
                  setRestingHeartRateBaseline(event.target.value)
                }
                placeholder="Baseline"
              />
            </label>
          </div>
        </details>

        <label className="grid gap-1">
          <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
            Athlete decision
          </span>
          <select
            className="tv-input"
            value={manualOverride}
            onChange={(event) =>
              setManualOverride(
                event.target.value as ReadinessRecommendation | "",
              )
            }
          >
            <option value="">Use readiness rules</option>
            <option value="full">Full</option>
            <option value="adjusted">Adjusted</option>
            <option value="minimum">Minimum</option>
            <option value="rest">Rest</option>
          </select>
        </label>
        {manualOverride ? (
          <label className="grid gap-1">
            <span className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
              Override reason
            </span>
            <input
              className="tv-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={240}
              placeholder="Optional context"
            />
          </label>
        ) : null}
        <button type="submit" className="tv-button-primary">
          Save check-in
        </button>
      </form>
    </details>
  );
}

export default function Home() {
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const logs = useSessionLogs();
  const workoutOverrides = useWorkoutOverrides();
  const todayOverride = useTodayWorkoutOverride();
  const now = useNow();
  const clientReady = useClientReady();
  const todayKey = now ? localDateKey(new Date(now)) : "";
  const recovery = useDailyRecovery(todayKey);
  const sessions = useMemo(
    () =>
      getCalendarSessions(
        programme,
        manualSessions,
        logs,
        workoutOverrides,
        lifecycle,
      ),
    [lifecycle, logs, manualSessions, programme, workoutOverrides],
  );
  const trainingSignals = useMemo(
    () => deriveTrainingSignals(logs, sessions, now),
    [logs, now, sessions],
  );
  const upcomingEvent = useMemo(
    () => getUpcomingEvent(programme, todayKey),
    [programme, todayKey],
  );
  const readinessInput = useMemo(
    () =>
      toDailyRecoveryInput(recovery, {
        date: todayKey,
        recentLoad7d: trainingSignals.recentLoad7d,
        baselineLoad7d: trainingSignals.baselineLoad7d,
        lowerBodyLoad48h: trainingSignals.lowerBodyLoad48h,
        highIntensitySessions72h:
          trainingSignals.highIntensitySessions72h,
        upcomingEventDays: upcomingEvent?.days,
        upcomingEventPriority: upcomingEvent?.priority,
      }),
    [recovery, todayKey, trainingSignals, upcomingEvent],
  );
  const inputSignalCount = readinessInputSignalCount(readinessInput);
  const hasEventFreshnessSignal = Boolean(
    upcomingEvent?.priority === "A" && upcomingEvent.days <= 3,
  );
  const readiness =
    todayKey &&
    (inputSignalCount > 0 ||
      hasEventFreshnessSignal ||
      recovery?.manualOverride)
      ? assessDailyReadiness(readinessInput)
      : null;
  const sessionsToday = sessions
    .filter((session) => session.scheduledDate === todayKey)
    .sort((first, second) => {
      const rank = {
        modified: 0,
        planned: 1,
        completed: 2,
        skipped: 3,
      };
      return rank[first.status] - rank[second.status];
    });
  const overriddenSession = todayOverride
    ? sessions.find(
        (session) =>
          session.id === todayOverride &&
          session.status !== "skipped",
      )
    : null;
  const todayActive = sessionsToday.find(
    (session) =>
      session.status === "planned" || session.status === "modified",
  );
  const todayCompleted = sessionsToday.find(
    (session) => session.status === "completed",
  );
  const nextSession = sessions.find(
    (session) =>
      session.scheduledDate > todayKey &&
      (session.status === "planned" || session.status === "modified"),
  );
  const firstIncompleteSession = sessions.find(
    (session) =>
      session.status === "planned" || session.status === "modified",
  );
  const primarySession =
    overriddenSession ??
    todayActive ??
    todayCompleted ??
    nextSession ??
    firstIncompleteSession ??
    null;
  const primaryIsToday = Boolean(
    primarySession &&
      (primarySession.scheduledDate === todayKey ||
        primarySession.id === todayOverride),
  );
  const primaryIsCompleted = primarySession?.status === "completed";
  const weekStart = now ? startOfWeek(new Date(now)) : null;
  const weekEnd = weekStart
    ? new Date(weekStart.getTime() + 6 * DAY_MS)
    : null;
  const weekStartKey = weekStart ? localDateKey(weekStart) : "";
  const weekEndKey = weekEnd ? localDateKey(weekEnd) : "";
  const weekSessions = sessions.filter(
    (session) =>
      session.scheduledDate >= weekStartKey &&
      session.scheduledDate <= weekEndKey,
  );
  const weekCompleted = weekSessions.filter(
    (session) => session.status === "completed",
  ).length;
  const weekMinutes = weekSessions.reduce(
    (total, session) => total + session.workout.durationMinutes,
    0,
  );
  const recentLogs = useMemo(
    () =>
      [...logs].sort(
        (first, second) =>
          new Date(second.completedAt).getTime() -
          new Date(first.completedAt).getTime(),
      ),
    [logs],
  );
  const lastSevenLogs = recentLogs.filter(
    (log) =>
      now &&
      new Date(log.completedAt).getTime() >= now - 7 * DAY_MS &&
      new Date(log.completedAt).getTime() <= now,
  );
  const loggedMinutes7d = lastSevenLogs.reduce(
    (total, log) => total + (log.actualDurationMinutes ?? 0),
    0,
  );
  const averageRpe7d =
    lastSevenLogs.length > 0
      ? (
          lastSevenLogs.reduce((total, log) => total + log.rpe, 0) /
          lastSevenLogs.length
        ).toFixed(1)
      : null;
  const selectedSessionLoad = primarySession
    ? classifySessionLoad(
        workoutPrescription(
          primarySession.workout,
          primarySession.type,
        ),
      )
    : null;
  const signals = [
    recovery?.sleepHours != null
      ? {
          label: "Sleep",
          value: `${recovery.sleepHours.toFixed(1)} h`,
          icon: Moon,
        }
      : recovery?.sleepScore != null
        ? {
            label: "Sleep",
            value: `${recovery.sleepScore}/100`,
            icon: Moon,
          }
        : null,
    recovery?.hrvMs != null
      ? {
          label: "HRV",
          value: recovery.hrvBaselineMs
            ? `${recovery.hrvMs} / ${recovery.hrvBaselineMs} ms`
            : `${recovery.hrvMs} ms`,
          icon: Activity,
        }
      : null,
    recovery?.restingHeartRate != null
      ? {
          label: "Resting HR",
          value: recovery.restingHeartRateBaseline
            ? `${recovery.restingHeartRate} / ${recovery.restingHeartRateBaseline} bpm`
            : `${recovery.restingHeartRate} bpm`,
          icon: HeartPulse,
        }
      : null,
    recovery?.garminReadiness != null
      ? {
          label: "Garmin readiness",
          value: `${recovery.garminReadiness}/100`,
          icon: Watch,
        }
      : null,
    readinessInput.recentLoad7d != null
      ? {
          label: "Training load 7d",
          value: `${Math.round(readinessInput.recentLoad7d)} AU`,
          icon: TrendingUp,
        }
      : null,
    readinessInput.lowerBodyLoad48h != null
      ? {
          label: "Lower body 48h",
          value: `${Math.round(readinessInput.lowerBodyLoad48h)}/100`,
          icon: Activity,
        }
      : null,
    (recovery?.runningLoad7d ?? trainingSignals.runningLoad7d) != null
      ? {
          label: "Running load 7d",
          value: `${Math.round(
            recovery?.runningLoad7d ??
              trainingSignals.runningLoad7d ??
              0,
          )} AU`,
          icon: TrendingUp,
        }
      : null,
    recovery?.soreness != null
      ? {
          label: "Soreness",
          value: `${recovery.soreness}/10`,
          icon: Activity,
        }
      : null,
    recovery?.subjectiveReadiness != null
      ? {
          label: "Feel",
          value: `${recovery.subjectiveReadiness}/10`,
          icon: Gauge,
        }
      : null,
  ].filter((signal): signal is NonNullable<typeof signal> =>
    Boolean(signal),
  );
  const contributingFactors = readiness
    ? [...readiness.factors]
        .filter(
          (factor) =>
            factor.key !== "limited_data" &&
            factor.key !== "manual_override",
        )
        .sort(
          (first, second) =>
            Math.abs(second.impact) - Math.abs(first.impact),
        )
        .slice(0, 3)
    : [];
  const coachFactor = contributingFactors[0];

  if (!clientReady) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <p className="tv-label text-[var(--accent)]">Loading today</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">
          {formatDate(todayKey, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-black uppercase leading-none sm:text-5xl">
              Today
            </h1>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              The next useful decision, grounded in your plan and recovery data.
            </p>
          </div>
          <Link href="/plan" className="tv-button-ghost">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Open calendar
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <section className="grid content-start gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="tv-label">
                {primaryIsToday ? "Today’s session" : "Up next"}
              </p>
              <h2 className="mt-1 text-2xl font-black uppercase">
                {primarySession?.workout.title ?? "No session scheduled"}
              </h2>
            </div>
            {selectedSessionLoad ? (
              <span className="tv-chip border-[var(--border)] bg-black text-[var(--muted)]">
                Estimated cost {selectedSessionLoad.plannedCost}/100
              </span>
            ) : null}
          </div>

          {primarySession ? (
            <>
              <WorkoutCard
                workout={primarySession.workout}
                sourceWorkout={primarySession.originalWorkout}
                href={`/session/${primarySession.id}`}
                eyebrow={
                  primaryIsCompleted
                    ? "Completed today"
                    : primaryIsToday
                      ? "Do the work"
                      : formatDate(primarySession.scheduledDate)
                }
                completed={primaryIsCompleted}
                isToday={primaryIsToday && !primaryIsCompleted}
                isNext={!primaryIsToday}
                variant="featured"
                ctaLabel={
                  primaryIsCompleted ? "Review session" : "Start session"
                }
                index={0}
              />
              {!primaryIsCompleted ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/session/${primarySession.id}`}
                    className="tv-button-primary"
                  >
                    Start session
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/session/${primarySession.id}#garmin`}
                    className="tv-button-ghost"
                  >
                    <Watch className="h-4 w-4" aria-hidden="true" />
                    Send to Garmin
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <article className="tv-card min-h-56 border-[rgba(215,255,47,0.28)] p-5">
              <p className="tv-label text-[var(--accent)]">Open capacity</p>
              <h3 className="mt-2 text-2xl font-black uppercase">
                Nothing is scheduled.
              </h3>
              <p className="mt-2 max-w-xl text-sm font-bold text-[var(--muted)]">
                Recovery still matters on an open day. Check in below or add a
                manual session without importing a programme.
              </p>
              <Link href="/plan" className="tv-button-primary mt-5 w-fit">
                Add in Plan
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          )}
        </section>

        <aside className="tv-card h-fit p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="tv-label">Readiness</p>
              <div className="mt-2 flex items-baseline gap-3">
                <p
                  className={`text-5xl font-black ${
                    readiness?.zone === "RED"
                      ? "text-red-300"
                      : readiness?.zone === "AMBER"
                        ? "text-amber-300"
                        : "text-[var(--accent)]"
                  }`}
                >
                  {readiness && inputSignalCount > 0
                    ? readiness.score
                    : "—"}
                </p>
                <div>
                  <p className="text-lg font-black uppercase text-[var(--text)]">
                    {readiness
                      ? readiness.recommendation
                      : primarySession?.selectedVariant ?? "Awaiting data"}
                  </p>
                  <p className="text-[0.65rem] font-black uppercase text-[var(--muted)]">
                    {readiness
                      ? `${readiness.zone} · ${readiness.dataCompleteness}% data`
                      : "No readiness score yet"}
                  </p>
                </div>
              </div>
            </div>
            <Gauge className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>

          <p className="mt-3 text-sm font-bold text-[var(--muted)]">
            {recommendationCopy(
              readiness,
              primarySession?.selectedVariant,
            )}
          </p>

          {contributingFactors.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {contributingFactors.map((factor) => (
                <div
                  key={factor.key}
                  className="border-l-2 border-[var(--accent)] pl-3"
                >
                  <p className="text-xs font-bold text-[var(--text)]">
                    {factor.label}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {signals.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {signals.slice(0, 8).map((signal) => {
                const Icon = signal.icon;
                return (
                  <div
                    key={signal.label}
                    className="border border-[var(--border)] bg-black p-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-[var(--muted)]">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <p className="text-[0.62rem] font-black uppercase">
                        {signal.label}
                      </p>
                    </div>
                    <p className="mt-1 text-sm font-black text-[var(--text)]">
                      {signal.value}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-[var(--border)] p-3">
              <p className="text-xs font-bold text-[var(--muted)]">
                No local or Garmin recovery signals are available for today.
                Your workout stays available.
              </p>
            </div>
          )}

          <CheckInForm
            key={`${todayKey}:${recovery?.updatedAt ?? "new"}`}
            date={todayKey}
            record={recovery}
          />

          {readiness ? (
            <p className="mt-4 text-[0.65rem] font-bold text-[var(--muted)]">
              {readiness.disclaimer}
            </p>
          ) : null}
        </aside>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="tv-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">This week</p>
              <h2 className="mt-1 text-xl font-black uppercase">
                {weekCompleted} of {weekSessions.length} complete
              </h2>
            </div>
            <CalendarDays
              className="h-5 w-5 text-[var(--accent)]"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-[var(--border)] bg-black p-3">
              <p className="tv-label">Planned</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">
                {weekMinutes}
              </p>
              <p className="text-xs font-bold text-[var(--muted)]">minutes</p>
            </div>
            <div className="border border-[var(--border)] bg-black p-3">
              <p className="tv-label">Changed</p>
              <p className="mt-1 text-2xl font-black text-[var(--accent)]">
                {
                  weekSessions.filter(
                    (session) => session.status === "modified",
                  ).length
                }
              </p>
              <p className="text-xs font-bold text-[var(--muted)]">sessions</p>
            </div>
          </div>
          {weekSessions.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {weekSessions.slice(0, 5).map((session) => (
                <Link
                  key={session.id}
                  href={`/session/${session.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--border)] pt-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black uppercase">
                      {session.workout.title}
                    </p>
                    <p className="text-[0.65rem] font-bold uppercase text-[var(--muted)]">
                      {formatDate(session.scheduledDate)} · {session.type}
                    </p>
                  </div>
                  {session.status === "completed" ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-[var(--accent)]"
                      aria-label="Completed"
                    />
                  ) : (
                    <span className="shrink-0 text-[0.62rem] font-black uppercase text-[var(--muted)]">
                      {session.status}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">
              No sessions planned this week.{" "}
              <Link href="/plan" className="text-[var(--accent)]">
                Add one
              </Link>
              .
            </p>
          )}
        </article>

        <article className="tv-card border-[rgba(215,255,47,0.28)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">Coach</p>
              <h2 className="mt-1 text-xl font-black uppercase">
                Today’s useful call
              </h2>
            </div>
            <Sparkles
              className="h-5 w-5 text-[var(--accent)]"
              aria-hidden="true"
            />
          </div>
          <p className="mt-4 text-base font-bold text-[var(--text)]">
            {coachFactor
              ? coachFactor.label
              : readiness
                ? recommendationCopy(
                    readiness,
                    primarySession?.selectedVariant,
                  )
                : "Check in once, then TrainVault can explain why today should be full, adjusted, minimum, or rest."}
          </p>
          <p className="mt-2 text-sm font-bold text-[var(--muted)]">
            {primarySession
              ? `Planned: ${primarySession.workout.title} · ${primarySession.workout.durationMinutes} min · ${primarySession.workout.intensity}.`
              : "There is no planned session to adapt today."}
          </p>
          <Link href="/coach" className="tv-button-primary mt-5 w-fit">
            Ask Coach
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">
                Recent performance
              </p>
              <h2 className="mt-1 text-xl font-black uppercase">
                Last 7 days
              </h2>
            </div>
            <TrendingUp
              className="h-5 w-5 text-[var(--accent)]"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="border border-[var(--border)] bg-black p-3">
              <p className="text-2xl font-black text-[var(--accent)]">
                {lastSevenLogs.length}
              </p>
              <p className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                Sessions
              </p>
            </div>
            <div className="border border-[var(--border)] bg-black p-3">
              <p className="text-2xl font-black text-[var(--accent)]">
                {loggedMinutes7d}
              </p>
              <p className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                Minutes
              </p>
            </div>
            <div className="border border-[var(--border)] bg-black p-3">
              <p className="text-2xl font-black text-[var(--accent)]">
                {averageRpe7d ?? "—"}
              </p>
              <p className="text-[0.62rem] font-black uppercase text-[var(--muted)]">
                Avg RPE
              </p>
            </div>
          </div>
          {recentLogs[0] ? (
            <div className="mt-3 border-l-2 border-[var(--accent)] pl-3">
              <p className="text-sm font-black uppercase">
                {recentLogs[0].workoutTitle}
              </p>
              <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                {getLatestLogSummary(recentLogs[0])}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">
              No completed sessions yet. Train first; trends come later.
            </p>
          )}
          <Link href="/insights" className="tv-button-ghost mt-4 w-fit">
            Open insights
          </Link>
        </article>

        <article className="tv-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="tv-label text-[var(--accent)]">
                Upcoming event
              </p>
              <h2 className="mt-1 text-xl font-black uppercase">
                {upcomingEvent?.name ?? "No event set"}
              </h2>
            </div>
            <Target
              className="h-5 w-5 text-[var(--accent)]"
              aria-hidden="true"
            />
          </div>
          {upcomingEvent ? (
            <>
              <p className="mt-4 text-5xl font-black text-[var(--accent)]">
                {upcomingEvent.days}
              </p>
              <p className="text-xs font-black uppercase text-[var(--muted)]">
                {upcomingEvent.days === 1 ? "day" : "days"} ·{" "}
                {upcomingEvent.priority}-priority
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-sm font-bold text-[var(--muted)]">
                <Timer className="h-4 w-4" aria-hidden="true" />
                {upcomingEvent.kind} · {formatDate(upcomingEvent.date)}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm font-bold text-[var(--muted)]">
              Add a target or checkpoint to an imported programme to bring
              event proximity into readiness decisions.
            </p>
          )}
          <Link href="/plan" className="tv-button-ghost mt-4 w-fit">
            Review plan
          </Link>
        </article>
      </section>

      {recoverySignalCount(recovery) === 0 &&
      trainingSignals.recentLoad7d === null ? (
        <section className="border border-[var(--border)] bg-black p-3">
          <p className="text-xs font-bold text-[var(--muted)]">
            Garmin is optional. Until it is connected, local check-ins and
            completed-session logs power Today; missing metrics remain blank.
          </p>
        </section>
      ) : null}
    </div>
  );
}
