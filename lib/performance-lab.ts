import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import type { DailyRecoveryRecord } from "@/lib/recovery-storage";
import type { SessionLog, WorkoutCategory } from "@/lib/types";

const DAY_MS = 86_400_000;

export type ActivityFamily =
  | "run"
  | "walk_hike"
  | "cycle"
  | "swim"
  | "strength"
  | "cardio"
  | "other";

export type PerformanceWeeklyPoint = {
  key: string;
  label: string;
  distanceKm: number;
  elevationM: number;
  durationHours: number;
  runningHours: number;
  trainingHours: number;
  activities: number;
  runningActivities: number;
};

export type PerformanceRecoveryPoint = {
  date: string;
  label: string;
  hrvMs: number | null;
  restingHeartRate: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  bodyBattery: number | null;
  readiness: number | null;
  stressAverage: number | null;
};

export type PerformanceCategoryPoint = {
  category: WorkoutCategory | "unknown";
  sessions: number;
  minutes: number;
};

export type PerformanceActivityFamilyPoint = {
  family: ActivityFamily;
  label: string;
  sessions: number;
  minutes: number;
  distanceKm: number;
  elevationM: number;
};

export type PerformanceSignal = {
  title: string;
  body: string;
  confidence: "low" | "moderate" | "high";
};

export type PerformanceDataCoverage = {
  totalActivities: number;
  timedActivities: number;
  heartRateActivities: number;
  distanceActivities: number;
  elevationActivities: number;
  trainingEffectActivities: number;
};

export type PerformanceCoachBrief = {
  tone: "build" | "hold" | "recover" | "observe";
  eyebrow: string;
  title: string;
  body: string;
  evidence: string[];
};

export type PerformanceLabSnapshot = {
  activities28d: number;
  runningActivities28d: number;
  runningDistanceKm28d: number;
  elevationGainM28d: number;
  runningHours28d: number;
  totalHours28d: number;
  totalMinutes28d: number;
  trainingDays28d: number;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  averageAerobicTrainingEffect: number | null;
  highAerobicEffectActivities28d: number;
  elevationPerKm: number | null;
  current7dDistanceKm: number;
  previous7dDistanceKm: number;
  distanceTrendPercent: number | null;
  current7dMinutes: number;
  previous7dMinutes: number;
  durationTrendPercent: number | null;
  recoveryDays14d: number;
  manualSessions28d: number;
  daysSinceLastRun: number | null;
  latestActivityAt: string | null;
  latestRecovery: PerformanceRecoveryPoint | null;
  weekly: PerformanceWeeklyPoint[];
  recovery: PerformanceRecoveryPoint[];
  categories: PerformanceCategoryPoint[];
  activityFamilies: PerformanceActivityFamilyPoint[];
  recentActivities: NormalizedGarminActivity[];
  coverage: PerformanceDataCoverage;
  coachBrief: PerformanceCoachBrief;
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

function normaliseActivityText(activity: NormalizedGarminActivity) {
  return `${activity.activityType ?? ""} ${activity.title ?? ""}`
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export function classifyActivityFamily(
  activity: NormalizedGarminActivity,
): ActivityFamily {
  const value = normaliseActivityText(activity);

  if (
    value.includes("trail_run") ||
    value.includes("treadmill_run") ||
    value.includes("running") ||
    value.includes("run_") ||
    value.endsWith("_run") ||
    value.includes("jog") ||
    value.includes("ultra")
  ) {
    return "run";
  }

  if (
    value.includes("walking") ||
    value.includes("walk_") ||
    value.endsWith("_walk") ||
    value.includes("hiking") ||
    value.includes("hike")
  ) {
    return "walk_hike";
  }

  if (
    value.includes("cycling") ||
    value.includes("bike") ||
    value.includes("biking") ||
    value.includes("cyclocross") ||
    value.includes("indoor_cycle")
  ) {
    return "cycle";
  }

  if (
    value.includes("swim") ||
    value.includes("pool") ||
    value.includes("open_water")
  ) {
    return "swim";
  }

  if (
    value.includes("strength") ||
    value.includes("weight") ||
    value.includes("crossfit") ||
    value.includes("functional_strength")
  ) {
    return "strength";
  }

  if (
    value.includes("cardio") ||
    value.includes("hiit") ||
    value.includes("elliptical") ||
    value.includes("rowing") ||
    value.includes("row_") ||
    value.includes("stair") ||
    value.includes("fitness_equipment")
  ) {
    return "cardio";
  }

  return "other";
}

function familyLabel(family: ActivityFamily) {
  switch (family) {
    case "run":
      return "Running";
    case "walk_hike":
      return "Walk / hike";
    case "cycle":
      return "Cycling";
    case "swim":
      return "Swimming";
    case "strength":
      return "Strength";
    case "cardio":
      return "Cardio";
    default:
      return "Other";
  }
}

function isRunningActivity(activity: NormalizedGarminActivity) {
  return classifyActivityFamily(activity) === "run";
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

function activityDurationSeconds(activity: NormalizedGarminActivity) {
  return activity.durationSeconds ?? activity.movingDurationSeconds ?? 0;
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
      runningHours: 0,
      trainingHours: 0,
      activities: 0,
      runningActivities: 0,
    };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));

  for (const activity of activities) {
    const timestamp = activityTimestamp(activity);
    if (timestamp === null) continue;

    const key = localDateKey(mondayStart(timestamp));
    const point = byKey.get(key);
    if (!point) continue;

    const durationHours = activityDurationSeconds(activity) / 3_600;
    point.trainingHours += durationHours;
    point.activities += 1;

    if (isRunningActivity(activity)) {
      point.distanceKm += (activity.distanceMeters ?? 0) / 1_000;
      point.elevationM += activity.elevationGainMeters ?? 0;
      point.runningHours += durationHours;
      point.durationHours += durationHours;
      point.runningActivities += 1;
    }
  }

  return points.map((point) => ({
    ...point,
    distanceKm: round(point.distanceKm),
    elevationM: Math.round(point.elevationM),
    durationHours: round(point.durationHours),
    runningHours: round(point.runningHours),
    trainingHours: round(point.trainingHours),
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
      sleepHours: record.sleepHours,
      bodyBattery: record.bodyBattery,
      readiness: record.garminReadiness,
      stressAverage: record.stressAverage,
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
    .sort((first, second) => second.minutes - first.minutes || second.sessions - first.sessions);
}

function buildActivityFamilies(
  activities: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
): PerformanceActivityFamilyPoint[] {
  const totals = new Map<
    ActivityFamily,
    { sessions: number; minutes: number; distanceKm: number; elevationM: number }
  >();

  for (const { activity } of activities) {
    const family = classifyActivityFamily(activity);
    const current = totals.get(family) ?? {
      sessions: 0,
      minutes: 0,
      distanceKm: 0,
      elevationM: 0,
    };
    current.sessions += 1;
    current.minutes += activityDurationSeconds(activity) / 60;
    current.distanceKm += (activity.distanceMeters ?? 0) / 1_000;
    current.elevationM += activity.elevationGainMeters ?? 0;
    totals.set(family, current);
  }

  return Array.from(totals.entries())
    .map(([family, values]) => ({
      family,
      label: familyLabel(family),
      sessions: values.sessions,
      minutes: Math.round(values.minutes),
      distanceKm: round(values.distanceKm),
      elevationM: Math.round(values.elevationM),
    }))
    .sort((first, second) => second.minutes - first.minutes || second.sessions - first.sessions);
}

function buildCoverage(
  activities: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
): PerformanceDataCoverage {
  return {
    totalActivities: activities.length,
    timedActivities: activities.filter(
      ({ activity }) => activityDurationSeconds(activity) > 0,
    ).length,
    heartRateActivities: activities.filter(
      ({ activity }) => (activity.averageHeartRateBpm ?? 0) > 0,
    ).length,
    distanceActivities: activities.filter(
      ({ activity }) => (activity.distanceMeters ?? 0) > 0,
    ).length,
    elevationActivities: activities.filter(
      ({ activity }) => activity.elevationGainMeters != null,
    ).length,
    trainingEffectActivities: activities.filter(
      ({ activity }) => activity.aerobicTrainingEffect != null,
    ).length,
  };
}

function buildCoachBrief(input: {
  activities28d: number;
  trainingDays28d: number;
  totalHours28d: number;
  runningActivities28d: number;
  runningDistanceKm28d: number;
  durationTrendPercent: number | null;
  distanceTrendPercent: number | null;
  recoveryDays14d: number;
  latestRecovery: PerformanceRecoveryPoint | null;
  manualSessions28d: number;
}): PerformanceCoachBrief {
  const latest = input.latestRecovery;
  const recoveryWarning =
    (latest?.readiness != null && latest.readiness < 40) ||
    (latest?.bodyBattery != null && latest.bodyBattery < 25) ||
    (latest?.sleepScore != null && latest.sleepScore < 50);

  if (recoveryWarning) {
    return {
      tone: "recover",
      eyebrow: "Protect the next useful session",
      title: "Recovery signals are asking for restraint.",
      body:
        "TrainVault has at least one materially low recovery marker. Keep the plan visible, but choose the adjusted or minimum variant until the next check-in confirms the signal has cleared.",
      evidence: [
        latest?.readiness != null ? `Garmin readiness ${Math.round(latest.readiness)}` : "Readiness unavailable",
        latest?.bodyBattery != null ? `Body Battery ${Math.round(latest.bodyBattery)}` : "Body Battery unavailable",
        latest?.sleepScore != null ? `Sleep score ${Math.round(latest.sleepScore)}` : "Sleep score unavailable",
      ],
    };
  }

  if (input.activities28d >= 3 && input.runningActivities28d === 0) {
    return {
      tone: "observe",
      eyebrow: "Hybrid work is visible",
      title: "Training is happening; running evidence is not.",
      body:
        "The Garmin bank contains recent work but no activity classified as running in the last 28 days. The Lab will use all-training consistency now and switch on pace, terrain and mileage calls as soon as a real run lands.",
      evidence: [
        `${input.activities28d} Garmin activities`,
        `${input.trainingDays28d} active days`,
        `${input.totalHours28d.toFixed(1)} recorded hours`,
      ],
    };
  }

  if (
    input.durationTrendPercent != null &&
    input.durationTrendPercent > 25 &&
    input.recoveryDays14d < 7
  ) {
    return {
      tone: "hold",
      eyebrow: "Load moved faster than evidence",
      title: "Training time is rising; recovery coverage is thin.",
      body:
        "The current seven-day training-time increase is real, but there are not enough consecutive recovery days to judge how well it is being absorbed. Hold the key sessions and avoid adding bonus intensity purely because the week looks good.",
      evidence: [
        `Training time +${input.durationTrendPercent.toFixed(0)}%`,
        `${input.recoveryDays14d}/14 recovery days`,
        `${input.manualSessions28d} TrainVault logs`,
      ],
    };
  }

  if (
    input.runningActivities28d >= 4 &&
    input.recoveryDays14d >= 7 &&
    (input.distanceTrendPercent ?? 0) <= 20
  ) {
    return {
      tone: "build",
      eyebrow: "Evidence is becoming usable",
      title: "The engine has enough continuity to coach from.",
      body:
        "Running, recovery and plan data now overlap enough for cautious trend calls. Protect the next quality session, keep easy running genuinely easy and let the rolling evidence decide when progression is earned.",
      evidence: [
        `${input.runningActivities28d} runs`,
        `${input.runningDistanceKm28d.toFixed(1)} km in 28 days`,
        `${input.recoveryDays14d}/14 recovery days`,
      ],
    };
  }

  return {
    tone: "observe",
    eyebrow: "Evidence-led mode",
    title: "Keep collecting clean training days.",
    body:
      "The system can describe what happened, but the evidence is still too sparse for strong adaptation calls. Sync Garmin, log Hawkeye accurately and build a recovery streak; confidence will rise without inventing a fitness score.",
    evidence: [
      `${input.activities28d} Garmin activities`,
      `${input.manualSessions28d} TrainVault logs`,
      `${input.recoveryDays14d}/14 recovery days`,
    ],
  };
}

function buildSignals(input: {
  activities28d: number;
  trainingDays28d: number;
  totalHours28d: number;
  runningActivities28d: number;
  runningDistanceKm28d: number;
  elevationPerKm: number | null;
  current7dDistanceKm: number;
  previous7dDistanceKm: number;
  distanceTrendPercent: number | null;
  current7dMinutes: number;
  previous7dMinutes: number;
  durationTrendPercent: number | null;
  recoveryDays14d: number;
  coverage: PerformanceDataCoverage;
}): PerformanceSignal[] {
  const signals: PerformanceSignal[] = [];

  if (input.durationTrendPercent === null) {
    signals.push({
      title: "Training consistency",
      body:
        input.current7dMinutes > 0
          ? `${Math.round(input.current7dMinutes)} recorded minutes sit in the current seven-day window. Another comparable week is needed before TrainVault calls an all-training trend.`
          : "No timed Garmin training is available in the current seven-day window yet.",
      confidence: input.activities28d >= 4 ? "moderate" : "low",
    });
  } else {
    const direction = input.durationTrendPercent >= 0 ? "up" : "down";
    signals.push({
      title: "Training consistency",
      body: `Recorded training time is ${Math.abs(input.durationTrendPercent).toFixed(0)}% ${direction} versus the previous seven days (${Math.round(input.current7dMinutes)} min vs ${Math.round(input.previous7dMinutes)} min).`,
      confidence: input.activities28d >= 8 ? "high" : "moderate",
    });
  }

  if (input.distanceTrendPercent === null) {
    signals.push({
      title: "Running volume",
      body:
        input.current7dDistanceKm > 0
          ? `You have ${input.current7dDistanceKm.toFixed(1)} km in the current seven-day window. Another comparable running week is needed before TrainVault calls a mileage trend.`
          : input.runningActivities28d > 0
            ? `There are ${input.runningActivities28d} runs in the 28-day bank, but no running distance in the current seven-day window.`
            : "No recent Garmin activity is currently classified as running, so mileage and pace conclusions remain disabled.",
      confidence: "low",
    });
  } else {
    const direction = input.distanceTrendPercent >= 0 ? "up" : "down";
    signals.push({
      title: "Running volume",
      body: `Seven-day running distance is ${Math.abs(input.distanceTrendPercent).toFixed(0)}% ${direction} versus the previous seven days (${input.current7dDistanceKm.toFixed(1)} km vs ${input.previous7dDistanceKm.toFixed(1)} km).`,
      confidence: input.runningActivities28d >= 8 ? "high" : "moderate",
    });
  }

  if (input.elevationPerKm !== null) {
    signals.push({
      title: "Terrain density",
      body: `Recent running has averaged ${Math.round(input.elevationPerKm)} m of ascent per kilometre across ${input.runningDistanceKm28d.toFixed(1)} km. This is a workload descriptor, not a fitness score.`,
      confidence: input.runningDistanceKm28d >= 30 ? "high" : "moderate",
    });
  } else {
    signals.push({
      title: "Terrain density",
      body: "TrainVault needs running distance and elevation from Garmin before it can describe how vertical recent training has been.",
      confidence: "low",
    });
  }

  const hrCoverage =
    input.coverage.totalActivities > 0
      ? input.coverage.heartRateActivities / input.coverage.totalActivities
      : 0;
  signals.push({
    title: "Evidence coverage",
    body: `${input.recoveryDays14d} of 14 recovery days are captured. Heart rate exists on ${input.coverage.heartRateActivities} of ${input.coverage.totalActivities} recent Garmin activities. More consecutive recovery days and complete activity metrics will strengthen comparisons.`,
    confidence:
      input.recoveryDays14d >= 10 && hrCoverage >= 0.7
        ? "high"
        : input.recoveryDays14d >= 7 || hrCoverage >= 0.5
          ? "moderate"
          : "low",
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
  const current7dActivities = activities28d.filter((item) => item.timestamp >= start7);
  const previous7dActivities = activities28d.filter(
    (item) => item.timestamp >= start14 && item.timestamp < start7,
  );
  const current7d = running28d.filter((item) => item.timestamp >= start7);
  const previous7d = running28d.filter(
    (item) => item.timestamp >= start14 && item.timestamp < start7,
  );

  const runningDistanceMeters = sum(running28d.map((item) => item.activity.distanceMeters));
  const elevationGainM = sum(running28d.map((item) => item.activity.elevationGainMeters));
  const runningDurationSeconds = sum(
    running28d.map((item) => activityDurationSeconds(item.activity)),
  );
  const totalDurationSeconds = sum(
    activities28d.map((item) => activityDurationSeconds(item.activity)),
  );
  const current7dDistanceKm =
    sum(current7d.map((item) => item.activity.distanceMeters)) / 1_000;
  const previous7dDistanceKm =
    sum(previous7d.map((item) => item.activity.distanceMeters)) / 1_000;
  const current7dMinutes =
    sum(current7dActivities.map((item) => activityDurationSeconds(item.activity))) / 60;
  const previous7dMinutes =
    sum(previous7dActivities.map((item) => activityDurationSeconds(item.activity))) / 60;
  const runningDistanceKm28d = runningDistanceMeters / 1_000;

  const pace =
    runningDistanceMeters > 0 && runningDurationSeconds > 0
      ? runningDurationSeconds / (runningDistanceMeters / 1_000)
      : null;
  const averageHeartRateBpm = weightedAverage(
    running28d.map((item) => ({
      value: item.activity.averageHeartRateBpm,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const averageCadenceSpm = weightedAverage(
    running28d.map((item) => ({
      value: item.activity.averageCadenceSpm,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const averageAerobicTrainingEffect = weightedAverage(
    activities28d.map((item) => ({
      value: item.activity.aerobicTrainingEffect,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const trainingDays = new Set(
    activities28d.map((item) => localDateKey(new Date(item.timestamp))),
  ).size;
  const recoverySeries = buildRecovery(recovery, nowTimestamp);
  const categories = buildCategories(logs, nowTimestamp);
  const activityFamilies = buildActivityFamilies(activities28d);
  const manualSessions28d = categories.reduce(
    (total, category) => total + category.sessions,
    0,
  );
  const distanceChange = trendPercent(current7dDistanceKm, previous7dDistanceKm);
  const durationChange = trendPercent(current7dMinutes, previous7dMinutes);
  const elevationPerKm =
    runningDistanceKm28d > 0 ? elevationGainM / runningDistanceKm28d : null;
  const coverage = buildCoverage(activities28d);
  const latestRunningTimestamp = running28d.reduce<number | null>(
    (latest, item) => (latest === null || item.timestamp > latest ? item.timestamp : latest),
    null,
  );
  const latestActivityTimestamp = datedActivities.reduce<number | null>(
    (latest, item) => (latest === null || item.timestamp > latest ? item.timestamp : latest),
    null,
  );
  const latestRecovery = recoverySeries.at(-1) ?? null;
  const roundedTotalHours = round(totalDurationSeconds / 3_600);
  const coachBrief = buildCoachBrief({
    activities28d: activities28d.length,
    trainingDays28d: trainingDays,
    totalHours28d: roundedTotalHours,
    runningActivities28d: running28d.length,
    runningDistanceKm28d: round(runningDistanceKm28d),
    durationTrendPercent: durationChange,
    distanceTrendPercent: distanceChange,
    recoveryDays14d: recoverySeries.length,
    latestRecovery,
    manualSessions28d,
  });

  return {
    activities28d: activities28d.length,
    runningActivities28d: running28d.length,
    runningDistanceKm28d: round(runningDistanceKm28d),
    elevationGainM28d: Math.round(elevationGainM),
    runningHours28d: round(runningDurationSeconds / 3_600),
    totalHours28d: roundedTotalHours,
    totalMinutes28d: Math.round(totalDurationSeconds / 60),
    trainingDays28d: trainingDays,
    averagePaceSecondsPerKm: pace === null ? null : round(pace, 0),
    averageHeartRateBpm:
      averageHeartRateBpm === null ? null : round(averageHeartRateBpm, 0),
    averageCadenceSpm:
      averageCadenceSpm === null ? null : round(averageCadenceSpm, 0),
    averageAerobicTrainingEffect:
      averageAerobicTrainingEffect === null
        ? null
        : round(averageAerobicTrainingEffect, 1),
    highAerobicEffectActivities28d: activities28d.filter(
      (item) => (item.activity.aerobicTrainingEffect ?? 0) >= 3.5,
    ).length,
    elevationPerKm: elevationPerKm === null ? null : round(elevationPerKm, 0),
    current7dDistanceKm: round(current7dDistanceKm),
    previous7dDistanceKm: round(previous7dDistanceKm),
    distanceTrendPercent: distanceChange,
    current7dMinutes: Math.round(current7dMinutes),
    previous7dMinutes: Math.round(previous7dMinutes),
    durationTrendPercent: durationChange,
    recoveryDays14d: recoverySeries.length,
    manualSessions28d,
    daysSinceLastRun:
      latestRunningTimestamp === null
        ? null
        : Math.max(0, Math.floor((nowTimestamp - latestRunningTimestamp) / DAY_MS)),
    latestActivityAt:
      latestActivityTimestamp === null
        ? null
        : new Date(latestActivityTimestamp).toISOString(),
    latestRecovery,
    weekly: buildWeekly(activities, nowTimestamp),
    recovery: recoverySeries,
    categories,
    activityFamilies,
    recentActivities: datedActivities
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 8)
      .map((item) => item.activity),
    coverage,
    coachBrief,
    signals: buildSignals({
      activities28d: activities28d.length,
      trainingDays28d: trainingDays,
      totalHours28d: roundedTotalHours,
      runningActivities28d: running28d.length,
      runningDistanceKm28d: round(runningDistanceKm28d),
      elevationPerKm,
      current7dDistanceKm: round(current7dDistanceKm),
      previous7dDistanceKm: round(previous7dDistanceKm),
      distanceTrendPercent: distanceChange,
      current7dMinutes: Math.round(current7dMinutes),
      previous7dMinutes: Math.round(previous7dMinutes),
      durationTrendPercent: durationChange,
      recoveryDays14d: recoverySeries.length,
      coverage,
    }),
  };
}
