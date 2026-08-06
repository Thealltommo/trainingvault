"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Flag,
  Footprints,
  Gauge,
  Route,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  getCalendarSessions,
  useManualSessions,
  useSessionLifecycleOverrides,
  type CalendarSession,
} from "@/lib/planning-storage";
import {
  getGarminCompletedSessionIds,
  useGarminLocalState,
} from "@/lib/garmin-storage";
import {
  useStructuredRunningWorkouts,
} from "@/lib/structured-running-storage";
import {
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import {
  classifyRunRole,
  estimateStructuredDistance,
  type RunRole,
} from "@/lib/v4-intelligence";

const ROLE_LABELS: Record<RunRole, string> = {
  easy: "Easy",
  long: "Long",
  threshold: "Threshold",
  intervals: "Intervals",
  hills: "Hills",
  race: "Race",
  trail: "Trail / fell",
  free: "Other",
};

const ROLE_ACCENTS: Record<RunRole, string> = {
  easy: "#8dd8c7",
  long: "#b89cff",
  threshold: "#ffbd4a",
  intervals: "#d7ff2f",
  hills: "#ff765f",
  race: "#ffffff",
  trail: "#77b7ff",
  free: "#8d948d",
};

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function weekStart(value: string) {
  const date = parseDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateKey(date);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(parseDate(value));
}

function formatTargetDate(value: string | null) {
  if (!value) return "No target date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDate(value));
}

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function goalFromSessions(sessions: CalendarSession[]) {
  const studio = sessions.find((session) => session.id.startsWith("studio-"));
  const goal = studio?.id.match(/^studio-([^-]+)-/)?.[1];
  if (goal === "5k") return { label: "5K Plan", meters: 5_000 };
  if (goal === "10k") return { label: "10K Plan", meters: 10_000 };
  if (goal === "half") return { label: "Half Marathon Plan", meters: 21_097.5 };
  if (goal === "spartan") return { label: "Spartan / Mountain Plan", meters: null };
  if (goal === "hybrid") return { label: "Hybrid Running Plan", meters: null };
  return { label: "Training Plan", meters: null };
}

function activitySessionId(
  activityId: string,
  garmin: ReturnType<typeof useGarminLocalState>,
) {
  const explicit = garmin.activityLinks[activityId]?.sessionId;
  if (explicit) return explicit;
  const record = garmin.activities.find(
    (candidate) => candidate.activity.activityId === activityId,
  );
  return record?.match.kind === "matched"
    ? record.match.candidate.sessionId
    : null;
}

function sessionRole(session: CalendarSession) {
  return classifyRunRole(session.workout.title);
}

function provisionalRaceEstimate(
  targetMeters: number | null,
  activities: ReturnType<typeof useGarminLocalState>["activities"],
) {
  if (!targetMeters) return null;
  const candidates = activities.flatMap((record) => {
    const activity = record.activity;
    const type = (activity.activityType ?? "").toLowerCase();
    const duration = activity.movingDurationSeconds ?? activity.durationSeconds;
    if (
      (!type.includes("run") && !type.includes("jog")) ||
      activity.distanceMeters == null ||
      activity.distanceMeters < 3_000 ||
      duration == null ||
      duration <= 0
    ) {
      return [];
    }
    const predicted =
      duration * (targetMeters / activity.distanceMeters) ** 1.06;
    return [predicted];
  });
  if (candidates.length === 0) return null;
  const midpoint = Math.min(...candidates);
  return {
    lower: midpoint * 0.96,
    upper: midpoint * 1.045,
    midpoint,
  };
}

function WeekCard({
  index,
  start,
  sessions,
  current,
}: {
  index: number;
  start: string;
  sessions: CalendarSession[];
  current: boolean;
}) {
  const completed = sessions.filter((session) => session.status === "completed").length;
  const totalMinutes = sessions.reduce(
    (total, session) => total + session.workout.durationMinutes,
    0,
  );
  const progress = sessions.length ? (completed / sessions.length) * 100 : 0;

  return (
    <article
      className={`rounded-[1.6rem] border p-4 sm:p-5 ${
        current
          ? "border-[rgba(215,255,47,0.34)] bg-[linear-gradient(145deg,rgba(215,255,47,0.08),rgba(11,14,11,0.92)_58%)]"
          : "border-white/[0.08] bg-[rgba(12,15,12,0.78)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-black uppercase tracking-[0.15em] text-[var(--quiet)]">
            {formatShortDate(start)} – {formatShortDate(addDays(start, 6))}
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">Week {index + 1}</h3>
        </div>
        {current ? (
          <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[0.55rem] font-black uppercase tracking-[0.12em] text-black">
            Current
          </span>
        ) : null}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-bold text-[var(--quiet)]">
        <span>{completed}/{sessions.length} complete</span>
        <span>{totalMinutes} planned min</span>
      </div>
      <div className="mt-5 grid gap-2">
        {sessions.map((session) => {
          const role = sessionRole(session);
          return (
            <Link
              key={session.id}
              href={`/session/${session.id}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/[0.065] bg-black/20 px-3 py-3 transition hover:border-[rgba(215,255,47,0.28)]"
            >
              <span
                className="h-8 w-1.5 rounded-full"
                style={{ background: ROLE_ACCENTS[role] }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{session.workout.title}</p>
                <p className="mt-1 text-[0.62rem] font-bold text-[var(--quiet)]">
                  {new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(
                    parseDate(session.scheduledDate),
                  )} · {ROLE_LABELS[role]} · {session.workout.durationMinutes} min
                </p>
              </div>
              <span
                className={`grid h-7 w-7 place-items-center rounded-full border ${
                  session.status === "completed"
                    ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                    : session.status === "skipped"
                      ? "border-white/10 text-[var(--quiet)]"
                      : "border-white/10 text-transparent"
                }`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

export default function V4ProgrammeOverview() {
  const programme = useActiveProgrammeOptional();
  const manual = useManualSessions();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const lifecycle = useSessionLifecycleOverrides();
  const garmin = useGarminLocalState();
  const structured = useStructuredRunningWorkouts();

  const sessions = useMemo(
    () =>
      getCalendarSessions(
        programme,
        manual,
        logs,
        overrides,
        lifecycle,
        getGarminCompletedSessionIds(garmin),
      ),
    [garmin, lifecycle, logs, manual, overrides, programme],
  );
  const runningSessions = useMemo(
    () =>
      sessions.filter((session) =>
        ["run", "fell-trail", "race"].includes(session.type),
      ),
    [sessions],
  );

  if (runningSessions.length === 0) return null;

  const goal = goalFromSessions(runningSessions);
  const dates = runningSessions
    .map((session) => session.scheduledDate)
    .filter(Boolean)
    .sort();
  const startDate = dates[0] ?? null;
  const targetDate = dates.at(-1) ?? null;
  const today = dateKey(new Date());
  const completed = runningSessions.filter(
    (session) => session.status === "completed",
  );
  const due = runningSessions.filter((session) => session.scheduledDate <= today);
  const adherence = due.length
    ? Math.round(
        (due.filter((session) => session.status === "completed").length /
          due.length) *
          100,
      )
    : 100;
  const plannedMinutes = runningSessions.reduce(
    (total, session) => total + session.workout.durationMinutes,
    0,
  );
  const plannedDistanceMeters = runningSessions.reduce((total, session) => {
    const estimate = estimateStructuredDistance(structured[session.id]);
    return total + (estimate ?? 0);
  }, 0);

  const sessionIds = new Set(runningSessions.map((session) => session.id));
  const linkedActivities = garmin.activities.filter((record) => {
    const activityId = record.activity.activityId;
    if (!activityId) return false;
    const id = activitySessionId(activityId, garmin);
    return id ? sessionIds.has(id) : false;
  });
  const linkedDistanceMeters = linkedActivities.reduce(
    (total, record) => total + (record.activity.distanceMeters ?? 0),
    0,
  );
  const unlinkedDistanceMeters = garmin.activities.reduce((total, record) => {
    const activity = record.activity;
    const type = (activity.activityType ?? "").toLowerCase();
    if (!type.includes("run") && !type.includes("jog")) return total;
    const id = activity.activityId
      ? activitySessionId(activity.activityId, garmin)
      : null;
    return total + (!id || !sessionIds.has(id) ? activity.distanceMeters ?? 0 : 0);
  }, 0);

  const grouped = new Map<string, CalendarSession[]>();
  runningSessions.forEach((session) => {
    const start = weekStart(session.scheduledDate);
    grouped.set(start, [...(grouped.get(start) ?? []), session]);
  });
  const weeks = Array.from(grouped.entries()).sort(([first], [second]) =>
    first.localeCompare(second),
  );
  const currentWeekStart = weekStart(today);
  const completedWeeks = weeks.filter(([, weekSessions]) =>
    weekSessions.every(
      (session) =>
        session.status === "completed" || session.status === "skipped",
    ),
  ).length;
  const prediction = provisionalRaceEstimate(goal.meters, garmin.activities);

  const roleProgress = (Object.keys(ROLE_LABELS) as RunRole[]).flatMap((role) => {
    const plannedForRole = runningSessions.filter(
      (session) => sessionRole(session) === role,
    );
    if (plannedForRole.length === 0) return [];
    const completedForRole = plannedForRole.filter(
      (session) => session.status === "completed",
    ).length;
    return [
      {
        role,
        planned: plannedForRole.length,
        completed: completedForRole,
        percent: Math.round((completedForRole / plannedForRole.length) * 100),
      },
    ];
  });

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-[2rem] border border-[rgba(215,255,47,0.17)] bg-[radial-gradient(circle_at_86%_4%,rgba(215,255,47,0.13),transparent_30%),linear-gradient(145deg,#161d17,#080a08_68%)] shadow-[0_35px_110px_rgba(0,0,0,0.34)]">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <p className="text-[0.66rem] font-black uppercase tracking-[0.18em]">
                Programme intelligence
              </p>
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-6xl">
              {goal.label}
            </h2>
            <p className="mt-3 text-sm font-bold text-[var(--muted)]">
              {startDate ? `${formatShortDate(startDate)} → ` : ""}
              {formatTargetDate(targetDate)}
            </p>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Weeks",
                  value: `${completedWeeks}/${weeks.length}`,
                  icon: CalendarDays,
                },
                {
                  label: "Sessions",
                  value: `${completed.length}/${runningSessions.length}`,
                  icon: Check,
                },
                {
                  label: "Distance",
                  value: `${(linkedDistanceMeters / 1_000).toFixed(1)} km`,
                  icon: Route,
                },
                {
                  label: "Adherence",
                  value: `${adherence}%`,
                  icon: Target,
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article key={metric.label} className="rounded-2xl border border-white/[0.075] bg-black/25 p-3.5">
                    <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                    <p className="mt-3 text-2xl font-black">{metric.value}</p>
                    <p className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.13em] text-[var(--quiet)]">
                      {metric.label}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8fbf22,var(--accent))]"
                style={{
                  width: `${Math.round((completed.length / runningSessions.length) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--quiet)]">
              <span>{plannedMinutes} planned minutes</span>
              <span>
                {plannedDistanceMeters > 0
                  ? `${(plannedDistanceMeters / 1_000).toFixed(1)} km structurally estimable`
                  : "Distance targets build as sessions gain explicit pace steps"}
              </span>
            </div>
          </div>

          <div className="border-t border-white/[0.07] bg-black/20 p-5 lg:border-l lg:border-t-0 sm:p-7">
            <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              Race outlook
            </p>
            {prediction ? (
              <>
                <p className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                  {formatDuration(prediction.lower)}–{formatDuration(prediction.upper)}
                </p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--muted)]">
                  Provisional range from completed running evidence. It becomes more credible when race-specific work and longer continuous efforts accumulate.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 text-3xl font-black">Building evidence</p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-[var(--muted)]">
                  Complete a continuous run of at least 3 km to unlock a provisional target-time range.
                </p>
              </>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <article className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                <Footprints className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <p className="mt-3 text-xl font-black">{(unlinkedDistanceMeters / 1_000).toFixed(1)} km</p>
                <p className="mt-1 text-[0.58rem] font-black uppercase text-[var(--quiet)]">Additional running</p>
              </article>
              <article className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
                <CircleGauge className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <p className="mt-3 text-xl font-black">{due.length}</p>
                <p className="mt-1 text-[0.58rem] font-black uppercase text-[var(--quiet)]">Sessions due</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-[1.7rem] border border-white/[0.08] bg-[rgba(12,15,12,0.82)] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[var(--accent)]">Mileage insights</p>
              <h3 className="mt-2 text-2xl font-black">The work you actually banked</h3>
            </div>
            <TrendingUp className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <div className="mt-6 grid gap-4">
            {roleProgress.map((item) => (
              <div key={item.role}>
                <div className="flex items-center justify-between gap-3 text-sm font-bold">
                  <span>{ROLE_LABELS[item.role]}</span>
                  <span className="text-[var(--quiet)]">{item.completed}/{item.planned}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percent}%`,
                      background: ROLE_ACCENTS[item.role],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/25 p-4">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              <p className="text-[0.6rem] font-black uppercase tracking-[0.14em]">Plan signal</p>
            </div>
            <p className="mt-3 text-sm font-bold leading-relaxed text-[var(--text)]">
              {adherence >= 85
                ? "Execution is tracking the programme. Adapt individual days from recovery evidence rather than rewriting the whole block."
                : adherence >= 65
                  ? "The plan is still recoverable, but missed or moved work is beginning to change the intended rhythm."
                  : "The current calendar no longer represents the work being completed. Rebuild the next two weeks around reality rather than chasing missed sessions."}
            </p>
          </div>
        </article>

        <section className="grid gap-3 sm:grid-cols-2">
          {weeks.slice(0, 6).map(([start, weekSessions], index) => (
            <WeekCard
              key={start}
              index={index}
              start={start}
              sessions={weekSessions}
              current={start === currentWeekStart}
            />
          ))}
        </section>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/plan/build" className="tv-button-primary">
          <Flag className="h-4 w-4" aria-hidden="true" />
          Rebuild programme
        </Link>
        <Link href="/insights/performance" className="tv-button-ghost">
          <Zap className="h-4 w-4" aria-hidden="true" />
          Performance lab
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
