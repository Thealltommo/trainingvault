"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  CalendarCheck,
  Gauge,
  Mountain,
  Timer,
  Trophy,
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
  useActiveProgrammeOptional,
  useSessionLogs,
  useWorkoutOverrides,
} from "@/lib/storage";
import type { SessionLog } from "@/lib/types";

type WeeklyPoint = {
  key: string;
  label: string;
  planned: number;
  actual: number;
  completed: number;
};

type ExternalCompletion = {
  sessionId: string;
  completedAt: string;
  durationMinutes: number;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function weekKey(value: Date) {
  return localDateKey(startOfWeek(value));
}

function buildWeeklySeries(
  sessions: CalendarSession[],
  logs: SessionLog[],
  externalCompletions: ExternalCompletion[] = [],
  now = new Date(),
): WeeklyPoint[] {
  const points = Array.from({ length: 8 }, (_, reverseIndex) => {
    const start = startOfWeek(now);
    start.setDate(start.getDate() - (7 - reverseIndex) * 7);
    return {
      key: localDateKey(start),
      label: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }).format(start),
      planned: 0,
      actual: 0,
      completed: 0,
    };
  });
  const pointByKey = new Map(points.map((point) => [point.key, point]));

  sessions.forEach((session) => {
    if (!session.scheduledDate) return;
    const point = pointByKey.get(weekKey(new Date(`${session.scheduledDate}T00:00:00`)));
    if (point) point.planned += session.workout.durationMinutes;
  });

  logs.forEach((log) => {
    const completedAt = new Date(log.completedAt);
    const point = pointByKey.get(weekKey(completedAt));

    if (point) {
      point.actual += log.actualDurationMinutes ?? 0;
      point.completed += 1;
    }
  });

  const loggedSessionIds = new Set(logs.map((log) => log.workoutId));
  const sessionsWithLoggedDuration = new Set(
    logs
      .filter((log) => log.actualDurationMinutes != null)
      .map((log) => log.workoutId),
  );

  externalCompletions.forEach((completion) => {
    const point = pointByKey.get(weekKey(new Date(completion.completedAt)));

    if (point) {
      if (!sessionsWithLoggedDuration.has(completion.sessionId)) {
        point.actual += completion.durationMinutes;
      }
      if (!loggedSessionIds.has(completion.sessionId)) {
        point.completed += 1;
      }
    }
  });

  return points;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getActionableInsights(
  sessions: CalendarSession[],
  logs: SessionLog[],
) {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const runLogs = logs.filter(
    (log) => sessionById.get(log.workoutId)?.type === "run",
  );
  const lowerBodyTypes = new Set([
    "strength",
    "crossfit",
    "hyrox",
    "fell-trail",
    "race",
  ]);
  const completedWithSession = logs
    .map((log) => ({ log, session: sessionById.get(log.workoutId) }))
    .filter(
      (
        item,
      ): item is { log: SessionLog; session: CalendarSession } =>
        Boolean(item.session),
    )
    .sort(
      (first, second) =>
        new Date(first.log.completedAt).getTime() -
        new Date(second.log.completedAt).getTime(),
    );
  const pairedRunRpe: number[] = [];
  const unpairedRunRpe: number[] = [];

  completedWithSession.forEach((item, index) => {
    if (item.session.type !== "run") return;
    const completedAt = new Date(item.log.completedAt).getTime();
    const recentLowerBody = completedWithSession
      .slice(0, index)
      .some((candidate) => {
        const candidateAt = new Date(candidate.log.completedAt).getTime();
        return (
          lowerBodyTypes.has(candidate.session.type) &&
          completedAt - candidateAt > 0 &&
          completedAt - candidateAt <= 36 * 60 * 60 * 1_000
        );
      });
    (recentLowerBody ? pairedRunRpe : unpairedRunRpe).push(item.log.rpe);
  });

  const insights: Array<{
    title: string;
    body: string;
    confidence: string;
  }> = [];

  if (pairedRunRpe.length >= 3 && unpairedRunRpe.length >= 3) {
    const delta = average(pairedRunRpe) - average(unpairedRunRpe);
    insights.push({
      title: "Lower-body interference",
      body:
        delta >= 0.7
          ? `Runs within 36 hours of lower-body work averaged ${delta.toFixed(1)} RPE higher. Consider adding a day before the next quality run.`
          : "Your logged RPE does not yet show a meaningful penalty when runs follow lower-body work within 36 hours.",
      confidence: `Moderate · ${pairedRunRpe.length + unpairedRunRpe.length} comparable runs`,
    });
  } else {
    insights.push({
      title: "Lower-body interference",
      body:
        "TrainVault needs at least three runs both with and without recent lower-body work before making a comparison.",
      confidence: `Low · ${pairedRunRpe.length + unpairedRunRpe.length}/6+ comparable runs`,
    });
  }

  if (runLogs.length >= 4) {
    const recent = runLogs
      .slice()
      .sort(
        (first, second) =>
          new Date(second.completedAt).getTime() -
          new Date(first.completedAt).getTime(),
      )
      .slice(0, 4);
    insights.push({
      title: "Running cost",
      body: `Your last four logged runs averaged RPE ${average(recent.map((log) => log.rpe)).toFixed(1)}. Use this alongside pace and heart-rate data once Garmin is connected.`,
      confidence: "Emerging · four recent runs",
    });
  } else {
    insights.push({
      title: "Running trend",
      body: "Complete four runs to unlock a basic effort trend. Pace conclusions remain disabled until distance or Garmin data exists.",
      confidence: `Low · ${runLogs.length}/4 runs`,
    });
  }

  return insights;
}

export default function InsightsPage() {
  const programme = useActiveProgrammeOptional();
  const manualSessions = useManualSessions();
  const lifecycle = useSessionLifecycleOverrides();
  const logs = useSessionLogs();
  const overrides = useWorkoutOverrides();
  const garmin = useGarminLocalState();
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
    [
      garminCompletedIds,
      lifecycle,
      logs,
      manualSessions,
      overrides,
      programme,
    ],
  );
  const externalCompletions = useMemo(() => {
    const activityById = new Map(
      garmin.activities.map((record) => [
        record.activity.activityId,
        record.activity,
      ]),
    );

    const completionsBySession = new Map<string, ExternalCompletion>();

    Object.values(garmin.activityLinks).forEach((link) => {
        const activity = activityById.get(link.activityId);
        const completedAt =
          activity?.startTime ?? activity?.localStartTime ?? null;

        if (
          !activity ||
          !completedAt
        ) {
          return;
        }

        const candidate = {
          sessionId: link.sessionId,
          completedAt,
          durationMinutes:
            activity.durationSeconds === null
              ? 0
              : activity.durationSeconds / 60,
        };
        const existing = completionsBySession.get(link.sessionId);

        if (
          !existing ||
          Date.parse(candidate.completedAt) > Date.parse(existing.completedAt)
        ) {
          completionsBySession.set(link.sessionId, candidate);
        }
      });

    return Array.from(completionsBySession.values());
  }, [garmin.activities, garmin.activityLinks]);
  const weekly = useMemo(
    () => buildWeeklySeries(sessions, logs, externalCompletions),
    [externalCompletions, logs, sessions],
  );
  const insights = useMemo(
    () => getActionableInsights(sessions, logs),
    [logs, sessions],
  );
  const datedSessions = sessions.filter((session) => session.scheduledDate);
  const completedIds = new Set([
    ...logs.map((log) => log.workoutId),
    ...garminCompletedIds,
  ]);
  const dueSessions = datedSessions.filter(
    (session) =>
      session.scheduledDate <= localDateKey(new Date()) &&
      session.status !== "skipped",
  );
  const adherence =
    dueSessions.length > 0
      ? Math.round(
          (dueSessions.filter((session) => completedIds.has(session.id)).length /
            dueSessions.length) *
            100,
        )
      : 0;
  const sessionsWithLoggedDuration = new Set(
    logs
      .filter((log) => log.actualDurationMinutes != null)
      .map((log) => log.workoutId),
  );
  const actualMinutes = Math.round(
    logs.reduce(
      (total, log) => total + (log.actualDurationMinutes ?? 0),
      externalCompletions.reduce(
        (total, completion) =>
          total +
          (sessionsWithLoggedDuration.has(completion.sessionId)
            ? 0
            : completion.durationMinutes),
        0,
      ),
    ),
  );
  const averageRpe = average(logs.map((log) => log.rpe));
  const runningSessions = sessions.filter((session) =>
    ["run", "fell-trail", "race"].includes(session.type),
  ).length;
  const hybridSessions = sessions.filter((session) =>
    ["strength", "crossfit", "conditioning", "hyrox"].includes(session.type),
  ).length;

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Insights</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-5xl">
          Useful questions, not chart spam
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
          Every conclusion is constrained by the amount of data available. Garmin will add pace, heart rate, elevation, and recovery context without replacing your manual logs.
        </p>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Adherence",
            value: `${adherence}%`,
            detail: `${dueSessions.length} due sessions`,
            icon: CalendarCheck,
          },
          {
            label: "Training time",
            value: `${actualMinutes}`,
            detail: "logged minutes",
            icon: Timer,
          },
          {
            label: "Average RPE",
            value: averageRpe ? averageRpe.toFixed(1) : "—",
            detail: `${logs.length} logs`,
            icon: Gauge,
          },
          {
            label: "Hybrid mix",
            value: `${runningSessions}/${hybridSessions}`,
            detail: "run / gym-family sessions",
            icon: Mountain,
          },
        ].map((metric) => {
          const Icon = metric.icon;

          return (
            <article key={metric.label} className="tv-card p-4">
              <div className="flex items-center justify-between">
                <p className="tv-label">{metric.label}</p>
                <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-4xl font-black text-[var(--accent)]">{metric.value}</p>
              <p className="mt-1 text-xs font-bold uppercase text-[var(--muted)]">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="tv-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tv-label text-[var(--accent)]">Training</p>
            <h2 className="mt-1 text-2xl font-black uppercase">
              Did planned time become completed time?
            </h2>
          </div>
          <span className="text-xs font-black uppercase text-[var(--muted)]">
            Last 8 weeks
          </span>
        </div>
        <div className="mt-4 h-72 min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 960, height: 288 }}
          >
            <AreaChart data={weekly} margin={{ left: -18, right: 4 }}>
              <defs>
                <linearGradient id="planned-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#737373" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#737373" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actual-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d7ff2f" stopOpacity={0.55} />
                  <stop offset="95%" stopColor="#d7ff2f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#a3a3a3", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#a3a3a3", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#050505",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 4,
                }}
              />
              <Area type="monotone" dataKey="planned" name="Planned min" stroke="#737373" fill="url(#planned-fill)" strokeWidth={2} />
              <Area type="monotone" dataKey="actual" name="Actual min" stroke="#d7ff2f" fill="url(#actual-fill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {insights.map((insight) => (
          <article key={insight.title} className="tv-card border-[rgba(215,255,47,0.26)] p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <p className="tv-label text-[var(--accent)]">Coach insight</p>
            </div>
            <h2 className="mt-3 text-xl font-black uppercase">{insight.title}</h2>
            <p className="mt-2 text-sm font-bold text-[var(--text)]">{insight.body}</p>
            <p className="mt-3 text-xs font-black uppercase text-[var(--muted)]">
              Confidence: {insight.confidence}
            </p>
          </article>
        ))}
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/insights/records" className="tv-button-primary">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          Personal records
        </Link>
        <Link href="/progress" className="tv-button-ghost">
          Open legacy detail charts
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
