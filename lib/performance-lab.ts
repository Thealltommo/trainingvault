import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import type { DailyRecoveryRecord } from "@/lib/recovery-storage";
import type { SessionLog, WorkoutCategory } from "@/lib/types";

const DAY_MS = 86_400_000;

export type PerformanceWeeklyPoint = {
  key: string;
  label: string;
  distanceKm: number;
  elevationM: number;
  durationHours: number;
  activities: number;
};

export type PerformanceRecoveryPoint = {
  date: string;
  label: string;
  hrvMs: number | null;
  restingHeartRate: number | null;
  sleepScore: number | null;
  bodyBattery: number | null;
  readiness: number | null;
};

export type PerformanceCategoryPoint = {
  category: WorkoutCategory | "unknown";
  sessions: number;
  minutes: number;
};

export type PerformanceSignal = {
  title: string;
  body: string;
  confidence: "low" | "moderate" | "high";
};

export type PerformanceLabSnapshot = {
  activities28d: number;
  runningActivities28d: number;
  runningDistanceKm28d: number;
  elevationGainM28d: number;
  runningHours28d: number;
  trainingDays28d: number;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationPerKm: number | null;
  current7dDistanceKm: number;
  previous7dDistanceKm: number;
  distanceTrendPercent: number | null;
  recoveryDays14d: number;
  manualSessions28d: number;
  weekly: PerformanceWeeklyPoint[];
  recovery: PerformanceRecoveryPoint[];
  categories: PerformanceCategoryPoint[];
  recentActivities: NormalizedGarminActivity[];
  signals: PerformanceSignal[];
};

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function activityTimestamp(activity: NormalizedGarminActivity) {
  return validTimestamp(activity.localStartTime) ?? validTimestamp(activity.startTime);
}

function isRunningActivity(activity: NormalizedGarminActivity) {
  const type = activity.activityType?.toLowerCase().replaceAll("-", "_") ?? "";
  return type.includes("run") || type.includes("jog");
}

function mondayStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function weightedAverage(
  values: Array<{ value: number | null | undefined; weight: number | null | undefined }>,
) {
  const usable = values.filter(
    (item) =>
      item.value != null &&
      Number.isFinite(item.value) &&
      item.weight != null &&
      Number.isFinite(item.weight) &&
      item.weight > 0,
  ) as Array<{ value: number; weight: number }>;

  const totalWeight = usable.reduce((total, item) => total + item.weight, 0);
  if (!totalWeight) return null;

  return (
    usable.reduce((total, item) => total + item.value * item.weight, 0) /
    totalWeight
  );
}

function trendPercent(current: number, previous: number) {
  if (previous <= 0) return null;
  return round(((current - previous) / previous) * 100, 0);
}

function buildWeekly(
  activities: NormalizedGarminActivity[],
  nowTimestamp: number,
): PerformanceWeeklyPoint[] {
  const currentWeek = mondayStart(nowTimestamp);
  const points = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (7 - index) * 7);
    return {
      key: localDateKey(start),
      label: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }).format(start),
      distanceKm: 0,
      elevationM: 0,
      durationHours: 0,
      activities: 0,
    };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));

  for (const activity of activities) {
    const timestamp = activityTimestamp(activity);
    if (timestamp === null || !isRunningActivity(activity)) continue;

    const key = localDateKey(mondayStart(timestamp));
    const point = byKey.get(key);
    if (!point) continue;

    point.distanceKm += (activity.distanceMeters ?? 0) / 1_000;
    point.elevationM += activity.elevationGainMeters ?? 0;
    point.durationHours += (activity.durationSeconds ?? 0) / 3_600;
    point.activities += 1;
  }

  return points.map((point) => ({
    ...point,
    distanceKm: round(point.distanceKm),
    elevationM: Math.round(point.elevationM),
    durationHours: round(point.durationHours),
  }));
}

function buildRecovery(
  recovery: DailyRecoveryRecord[],
  nowTimestamp: number,
): PerformanceRecoveryPoint[] {
  const start = nowTimestamp - 13 * DAY_MS;

  return recovery
    .filter((record) => {
      const timestamp = Date.parse(`${record.date}T12:00:00`);
      return Number.isFinite(timestamp) && timestamp >= start && timestamp <= nowTimestamp + DAY_MS;
    })
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((record) => ({
      date: record.date,
      label: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${record.date}T12:00:00`)),
      hrvMs: record.hrvMs,
      restingHeartRate: record.restingHeartRate,
      sleepScore: record.sleepScore,
      bodyBattery: record.bodyBattery,
      readiness: record.garminReadiness,
    }));
}

function buildCategories(
  logs: SessionLog[],
  nowTimestamp: number,
): PerformanceCategoryPoint[] {
  const start = nowTimestamp - 28 * DAY_MS;
  const totals = new Map<WorkoutCategory | "unknown", { sessions: number; minutes: number }>();

  for (const log of logs) {
    const timestamp = validTimestamp(log.completedAt);
    if (timestamp === null || timestamp < start || timestamp > nowTimestamp + DAY_MS) {
      continue;
    }

    const category = log.workoutCategory ?? "unknown";
    const existing = totals.get(category) ?? { sessions: 0, minutes: 0 };
    existing.sessions += 1;
    existing.minutes += log.actualDurationMinutes ?? 0;
    totals.set(category, existing);
  }

  return Array.from(totals.entries())
    .map(([category, values]) => ({
      category,
      sessions: values.sessions,
      minutes: Math.round(values.minutes),
    }))
    .sort((first, second) => second.sessions - first.sessions || second.minutes - first.minutes);
}

function buildSignals(input: {
  runningActivities28d: number;
  runningDistanceKm28d: number;
  elevationPerKm: number | null;
  current7dDistanceKm: number;
  previous7dDistanceKm: number;
  distanceTrendPercent: number | null;
  recoveryDays14d: number;
}): PerformanceSignal[] {
  const signals: PerformanceSignal[] = [];

  if (input.distanceTrendPercent === null) {
    signals.push({
      title: "Volume trend",
      body:
        input.current7dDistanceKm > 0
          ? `You have ${input.current7dDistanceKm.toFixed(1)} km in the current seven-day window. Another comparable week is needed before TrainVault calls a trend.`
          : "No running distance is available in the current seven-day window yet.",
      confidence: "low",
    });
  } else {
    const direction = input.distanceTrendPercent >= 0 ? "up" : "down";
    signals.push({
      title: "Volume trend",
      body: `Seven-day running distance is ${Math.abs(input.distanceTrendPercent).toFixed(0)}% ${direction} versus the previous seven days (${input.current7dDistanceKm.toFixed(1)} km vs ${input.previous7dDistanceKm.toFixed(1)} km).`,
      confidence: input.runningActivities28d >= 8 ? "high" : "moderate",
    });
  }

  if (input.elevationPerKm !== null) {
    signals.push({
      title: "Terrain density",
      body: `Your recent running has averaged ${Math.round(input.elevationPerKm)} m of ascent per kilometre across ${input.runningDistanceKm28d.toFixed(1)} km. This is a workload descriptor, not a fitness score.`,
      confidence: input.runningDistanceKm28d >= 30 ? "high" : "moderate",
    });
  } else {
    signals.push({
      title: "Terrain density",
      body: "TrainVault needs running distance and elevation from Garmin before it can describe how vertical your recent training has been.",
      confidence: "low",
    });
  }

  signals.push({
    title: "Recovery coverage",
    body:
      input.recoveryDays14d >= 10
        ? `${input.recoveryDays14d} of the last 14 days contain Garmin or manual recovery data, enough for emerging recovery-versus-training comparisons.`
        : `${input.recoveryDays14d} of the last 14 days currently contain recovery data. More consecutive days will make trend comparisons materially stronger.`,
    confidence: input.recoveryDays14d >= 10 ? "moderate" : "low",
  });

  return signals;
}

export function buildPerformanceLabSnapshot(
  activities: NormalizedGarminActivity[],
  recovery: DailyRecoveryRecord[],
  logs: SessionLog[],
  now = new Date(),
): PerformanceLabSnapshot {
  const nowTimestamp = now.getTime();
  const start28 = nowTimestamp - 28 * DAY_MS;
  const start7 = nowTimestamp - 7 * DAY_MS;
  const start14 = nowTimestamp - 14 * DAY_MS;

  const datedActivities = activities
    .map((activity) => ({ activity, timestamp: activityTimestamp(activity) }))
    .filter(
      (item): item is { activity: NormalizedGarminActivity; timestamp: number } =>
        item.timestamp !== null,
    );
  const activities28d = datedActivities.filter(
    (item) => item.timestamp >= start28 && item.timestamp <= nowTimestamp + DAY_MS,
  );
  const running28d = activities28d.filter((item) => isRunningActivity(item.activity));
  const current7d = running28d.filter((item) => item.timestamp >= start7);
  const previous7d = running28d.filter(
    (item) => item.timestamp >= start14 && item.timestamp < start7,
  );

  const runningDistanceMeters = sum(running28d.map((item) => item.activity.distanceMeters));
  const elevationGainM = sum(running28d.map((item) => item.activity.elevationGainMeters));
  const runningDurationSeconds = sum(running28d.map((item) => item.activity.durationSeconds));
  const current7dDistanceKm =
    sum(current7d.map((item) => item.activity.distanceMeters)) / 1_000;
  const previous7dDistanceKm =
    sum(previous7d.map((item) => item.activity.distanceMeters)) / 1_000;
  const runningDistanceKm28d = runningDistanceMeters / 1_000;

  const pace =
    runningDistanceMeters > 0 && runningDurationSeconds > 0
      ? runningDurationSeconds / (runningDistanceMeters / 1_000)
      : null;
  const averageHeartRateBpm = weightedAverage(
    running28d.map((item) => ({
      value: item.activity.averageHeartRateBpm,
      weight: item.activity.durationSeconds,
    })),
  );
  const averageCadenceSpm = weightedAverage(
    running28d.map((item) => ({
      value: item.activity.averageCadenceSpm,
      weight: item.activity.durationSeconds,
    })),
  );
  const trainingDays = new Set(
    activities28d.map((item) => localDateKey(new Date(item.timestamp))),
  ).size;
  const recoverySeries = buildRecovery(recovery, nowTimestamp);
  const categories = buildCategories(logs, nowTimestamp);
  const manualSessions28d = categories.reduce(
    (total, category) => total + category.sessions,
    0,
  );
  const distanceChange = trendPercent(current7dDistanceKm, previous7dDistanceKm);
  const elevationPerKm =
    runningDistanceKm28d > 0 ? elevationGainM / runningDistanceKm28d : null;

  return {
    activities28d: activities28d.length,
    runningActivities28d: running28d.length,
    runningDistanceKm28d: round(runningDistanceKm28d),
    elevationGainM28d: Math.round(elevationGainM),
    runningHours28d: round(runningDurationSeconds / 3_600),
    trainingDays28d: trainingDays,
    averagePaceSecondsPerKm: pace === null ? null : round(pace, 0),
    averageHeartRateBpm:
      averageHeartRateBpm === null ? null : round(averageHeartRateBpm, 0),
    averageCadenceSpm:
      averageCadenceSpm === null ? null : round(averageCadenceSpm, 0),
    elevationPerKm: elevationPerKm === null ? null : round(elevationPerKm, 0),
    current7dDistanceKm: round(current7dDistanceKm),
    previous7dDistanceKm: round(previous7dDistanceKm),
    distanceTrendPercent: distanceChange,
    recoveryDays14d: recoverySeries.length,
    manualSessions28d,
    weekly: buildWeekly(activities, nowTimestamp),
    recovery: recoverySeries,
    categories,
    recentActivities: datedActivities
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 8)
      .map((item) => item.activity),
    signals: buildSignals({
      runningActivities28d: running28d.length,
      runningDistanceKm28d: round(runningDistanceKm28d),
      elevationPerKm,
      current7dDistanceKm: round(current7dDistanceKm),
      previous7dDistanceKm: round(previous7dDistanceKm),
      distanceTrendPercent: distanceChange,
      recoveryDays14d: recoverySeries.length,
    }),
  };
}
