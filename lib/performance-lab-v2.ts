import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import type { DailyRecoveryRecord } from "@/lib/recovery-storage";
import type { SessionLog, WorkoutCategory } from "@/lib/types";

const DAY_MS = 86_400_000;

export type ActivityFamily =
  | "run"
  | "trail"
  | "walk_hike"
  | "cycle"
  | "strength"
  | "cardio"
  | "other";

export type PerformanceFamilyPoint = {
  family: ActivityFamily;
  label: string;
  activities: number;
  minutes: number;
  distanceKm: number;
};

export type PerformanceWeeklyPointV2 = {
  key: string;
  label: string;
  runDistanceKm: number;
  elevationM: number;
  runHours: number;
  runActivities: number;
  allActivityHours: number;
};

export type PerformanceRecoveryPointV2 = {
  date: string;
  label: string;
  hrvMs: number | null;
  restingHeartRate: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  bodyBattery: number | null;
  readiness: number | null;
};

export type PerformanceDailyLoadPoint = {
  date: string;
  label: string;
  garminMinutes: number;
  runKm: number;
  manualMinutes: number;
  manualRpeLoad: number;
  recoveryCaptured: boolean;
};

export type PerformanceSignalV2 = {
  id: string;
  title: string;
  body: string;
  confidence: "low" | "moderate" | "high";
  status: "building" | "watch" | "positive" | "neutral";
  evidence: string[];
};

export type PerformanceManualCategory = {
  category: WorkoutCategory | "unknown";
  sessions: number;
  minutes: number;
};

export type PaceHeartRateComparison = {
  comparable: boolean;
  currentPaceSecondsPerKm: number | null;
  currentHeartRateBpm: number | null;
  previousPaceSecondsPerKm: number | null;
  previousHeartRateBpm: number | null;
  paceDeltaSecondsPerKm: number | null;
  heartRateDeltaBpm: number | null;
  currentRuns: number;
  previousRuns: number;
};

export type PerformanceLabV2Snapshot = {
  source: {
    activities28d: number;
    activeDays28d: number;
    totalHours28d: number;
    recoveryDays14d: number;
    recoveryCoveragePercent: number;
    lastActivityAt: string | null;
    lastRunAt: string | null;
  };
  run: {
    activities28d: number;
    days28d: number;
    distanceKm28d: number;
    hours28d: number;
    elevationGainM28d: number;
    elevationPerKm: number | null;
    averagePaceSecondsPerKm: number | null;
    averageHeartRateBpm: number | null;
    averageCadenceSpm: number | null;
    averageRunDistanceKm: number | null;
    longestRunDistanceKm: number | null;
    longestRunMinutes: number | null;
    current7dDistanceKm: number;
    previous7dDistanceKm: number;
    distanceTrendPercent: number | null;
    current14dDistanceKm: number;
    previous14dDistanceKm: number;
    averageAerobicTrainingEffect: number | null;
    averageAnaerobicTrainingEffect: number | null;
    trainingEffectActivities: number;
  };
  recovery: {
    latest: PerformanceRecoveryPointV2 | null;
    averageHrv7d: number | null;
    averageRestingHeartRate7d: number | null;
    averageSleepScore7d: number | null;
    averageSleepHours7d: number | null;
    averageBodyBattery7d: number | null;
    averageReadiness7d: number | null;
    hrvDeltaVsBaselinePercent: number | null;
    restingHeartRateDeltaVsBaseline: number | null;
  };
  paceHeartRate: PaceHeartRateComparison;
  weekly: PerformanceWeeklyPointV2[];
  recoverySeries: PerformanceRecoveryPointV2[];
  dailyLoad: PerformanceDailyLoadPoint[];
  families: PerformanceFamilyPoint[];
  manualCategories: PerformanceManualCategory[];
  recentActivities: NormalizedGarminActivity[];
  recentRuns: NormalizedGarminActivity[];
  signals: PerformanceSignalV2[];
};

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function activityTimestamp(activity: NormalizedGarminActivity) {
  return validTimestamp(activity.localStartTime) ?? validTimestamp(activity.startTime);
}

function normalizedActivityText(activity: NormalizedGarminActivity) {
  return `${activity.activityType ?? ""} ${activity.title ?? ""}`
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll("/", "_");
}

export function classifyGarminActivity(
  activity: NormalizedGarminActivity,
): ActivityFamily {
  const value = normalizedActivityText(activity);

  if (
    value.includes("trail_run") ||
    value.includes("trail running") ||
    value.includes("fell") ||
    value.includes("mountain_run") ||
    value.includes("ultra_run") ||
    value.includes("cross_country")
  ) {
    return "trail";
  }

  if (
    value.includes("running") ||
    value.includes(" run ") ||
    value.startsWith("run ") ||
    value.endsWith(" run") ||
    value.includes("treadmill") ||
    value.includes("jog") ||
    value.includes("track_run") ||
    value.includes("indoor_run")
  ) {
    return "run";
  }

  if (
    value.includes("hike") ||
    value.includes("hiking") ||
    value.includes("walk") ||
    value.includes("walking")
  ) {
    return "walk_hike";
  }

  if (
    value.includes("cycling") ||
    value.includes("bike") ||
    value.includes("biking") ||
    value.includes("cycle") ||
    value.includes("virtual_ride")
  ) {
    return "cycle";
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
    value.includes(" row ") ||
    value.includes("stair") ||
    value.includes("indoor_cardio")
  ) {
    return "cardio";
  }

  return "other";
}

export function isGarminRunningActivity(activity: NormalizedGarminActivity) {
  const family = classifyGarminActivity(activity);
  return family === "run" || family === "trail";
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return usable.length > 0
    ? usable.reduce((total, value) => total + value, 0) / usable.length
    : null;
}

function weightedAverage(
  values: Array<{
    value: number | null | undefined;
    weight: number | null | undefined;
  }>,
) {
  const usable = values.filter(
    (item): item is { value: number; weight: number } =>
      item.value != null &&
      Number.isFinite(item.value) &&
      item.weight != null &&
      Number.isFinite(item.weight) &&
      item.weight > 0,
  );

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

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function activityDurationSeconds(activity: NormalizedGarminActivity) {
  return activity.movingDurationSeconds ?? activity.durationSeconds ?? 0;
}

function activityPaceSecondsPerKm(activity: NormalizedGarminActivity) {
  if (
    activity.averagePaceSecondsPerKm != null &&
    Number.isFinite(activity.averagePaceSecondsPerKm) &&
    activity.averagePaceSecondsPerKm > 0
  ) {
    return activity.averagePaceSecondsPerKm;
  }

  const duration = activityDurationSeconds(activity);
  const distance = activity.distanceMeters ?? 0;
  return distance > 0 && duration > 0 ? duration / (distance / 1_000) : null;
}

function buildWeekly(
  activities: NormalizedGarminActivity[],
  nowTimestamp: number,
): PerformanceWeeklyPointV2[] {
  const currentWeek = mondayStart(nowTimestamp);
  const points = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (7 - index) * 7);
    return {
      key: localDateKey(start),
      label: dateLabel(start),
      runDistanceKm: 0,
      elevationM: 0,
      runHours: 0,
      runActivities: 0,
      allActivityHours: 0,
    };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));

  for (const activity of activities) {
    const timestamp = activityTimestamp(activity);
    if (timestamp === null) continue;
    const point = byKey.get(localDateKey(mondayStart(timestamp)));
    if (!point) continue;

    point.allActivityHours += activityDurationSeconds(activity) / 3_600;

    if (!isGarminRunningActivity(activity)) continue;
    point.runDistanceKm += (activity.distanceMeters ?? 0) / 1_000;
    point.elevationM += activity.elevationGainMeters ?? 0;
    point.runHours += activityDurationSeconds(activity) / 3_600;
    point.runActivities += 1;
  }

  return points.map((point) => ({
    ...point,
    runDistanceKm: round(point.runDistanceKm),
    elevationM: Math.round(point.elevationM),
    runHours: round(point.runHours),
    allActivityHours: round(point.allActivityHours),
  }));
}

function buildRecoverySeries(
  recovery: DailyRecoveryRecord[],
  nowTimestamp: number,
): PerformanceRecoveryPointV2[] {
  const start = nowTimestamp - 13 * DAY_MS;

  return recovery
    .filter((record) => {
      const timestamp = Date.parse(`${record.date}T12:00:00`);
      return (
        Number.isFinite(timestamp) &&
        timestamp >= start &&
        timestamp <= nowTimestamp + DAY_MS
      );
    })
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((record) => ({
      date: record.date,
      label: dateLabel(new Date(`${record.date}T12:00:00`)),
      hrvMs: record.hrvMs,
      restingHeartRate: record.restingHeartRate,
      sleepScore: record.sleepScore,
      sleepHours: record.sleepHours,
      bodyBattery: record.bodyBattery,
      readiness: record.garminReadiness,
    }));
}

function buildManualCategories(
  logs: SessionLog[],
  nowTimestamp: number,
): PerformanceManualCategory[] {
  const start = nowTimestamp - 28 * DAY_MS;
  const totals = new Map<
    WorkoutCategory | "unknown",
    { sessions: number; minutes: number }
  >();

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
    .sort(
      (first, second) =>
        second.minutes - first.minutes || second.sessions - first.sessions,
    );
}

function familyLabel(family: ActivityFamily) {
  switch (family) {
    case "run":
      return "Road / run";
    case "trail":
      return "Trail / fell";
    case "walk_hike":
      return "Walk / hike";
    case "cycle":
      return "Cycle";
    case "strength":
      return "Strength";
    case "cardio":
      return "Cardio";
    default:
      return "Other";
  }
}

function buildFamilies(
  activities: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
) {
  const totals = new Map<
    ActivityFamily,
    { activities: number; minutes: number; distanceKm: number }
  >();

  for (const item of activities) {
    const family = classifyGarminActivity(item.activity);
    const existing = totals.get(family) ?? {
      activities: 0,
      minutes: 0,
      distanceKm: 0,
    };
    existing.activities += 1;
    existing.minutes += activityDurationSeconds(item.activity) / 60;
    existing.distanceKm += (item.activity.distanceMeters ?? 0) / 1_000;
    totals.set(family, existing);
  }

  return Array.from(totals.entries())
    .map(([family, values]) => ({
      family,
      label: familyLabel(family),
      activities: values.activities,
      minutes: Math.round(values.minutes),
      distanceKm: round(values.distanceKm),
    }))
    .sort(
      (first, second) =>
        second.minutes - first.minutes || second.activities - first.activities,
    );
}

function buildDailyLoad(
  activities: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
  recovery: DailyRecoveryRecord[],
  logs: SessionLog[],
  nowTimestamp: number,
): PerformanceDailyLoadPoint[] {
  const points = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(nowTimestamp);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    return {
      date: localDateKey(date),
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      garminMinutes: 0,
      runKm: 0,
      manualMinutes: 0,
      manualRpeLoad: 0,
      recoveryCaptured: false,
    };
  });
  const byDate = new Map(points.map((point) => [point.date, point]));

  for (const item of activities) {
    const point = byDate.get(localDateKey(new Date(item.timestamp)));
    if (!point) continue;
    point.garminMinutes += activityDurationSeconds(item.activity) / 60;
    if (isGarminRunningActivity(item.activity)) {
      point.runKm += (item.activity.distanceMeters ?? 0) / 1_000;
    }
  }

  for (const log of logs) {
    const timestamp = validTimestamp(log.completedAt);
    if (timestamp === null) continue;
    const point = byDate.get(localDateKey(new Date(timestamp)));
    if (!point) continue;
    const minutes = log.actualDurationMinutes ?? 0;
    point.manualMinutes += minutes;
    point.manualRpeLoad += minutes * Math.max(0, log.rpe);
  }

  for (const record of recovery) {
    const point = byDate.get(record.date);
    if (point) point.recoveryCaptured = true;
  }

  return points.map((point) => ({
    ...point,
    garminMinutes: Math.round(point.garminMinutes),
    runKm: round(point.runKm),
    manualMinutes: Math.round(point.manualMinutes),
    manualRpeLoad: Math.round(point.manualRpeLoad),
  }));
}

function aggregateRunWindow(
  runs: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
  start: number,
  end: number,
) {
  const inWindow = runs.filter(
    (item) => item.timestamp >= start && item.timestamp < end,
  );
  const distanceMeters = sum(inWindow.map((item) => item.activity.distanceMeters));
  const pace = weightedAverage(
    inWindow.map((item) => ({
      value: activityPaceSecondsPerKm(item.activity),
      weight: item.activity.distanceMeters,
    })),
  );
  const heartRate = weightedAverage(
    inWindow.map((item) => ({
      value: item.activity.averageHeartRateBpm,
      weight: activityDurationSeconds(item.activity),
    })),
  );

  return {
    runs: inWindow.length,
    distanceKm: distanceMeters / 1_000,
    pace,
    heartRate,
  };
}

function buildPaceHeartRateComparison(
  runs: Array<{ activity: NormalizedGarminActivity; timestamp: number }>,
  nowTimestamp: number,
): PaceHeartRateComparison {
  const current = aggregateRunWindow(
    runs,
    nowTimestamp - 14 * DAY_MS,
    nowTimestamp + DAY_MS,
  );
  const previous = aggregateRunWindow(
    runs,
    nowTimestamp - 28 * DAY_MS,
    nowTimestamp - 14 * DAY_MS,
  );
  const heartRateDelta =
    current.heartRate != null && previous.heartRate != null
      ? current.heartRate - previous.heartRate
      : null;
  const paceDelta =
    current.pace != null && previous.pace != null
      ? current.pace - previous.pace
      : null;

  return {
    comparable:
      current.runs >= 2 &&
      previous.runs >= 2 &&
      heartRateDelta != null &&
      paceDelta != null &&
      Math.abs(heartRateDelta) <= 5,
    currentPaceSecondsPerKm:
      current.pace == null ? null : round(current.pace, 0),
    currentHeartRateBpm:
      current.heartRate == null ? null : round(current.heartRate, 0),
    previousPaceSecondsPerKm:
      previous.pace == null ? null : round(previous.pace, 0),
    previousHeartRateBpm:
      previous.heartRate == null ? null : round(previous.heartRate, 0),
    paceDeltaSecondsPerKm: paceDelta == null ? null : round(paceDelta, 0),
    heartRateDeltaBpm:
      heartRateDelta == null ? null : round(heartRateDelta, 0),
    currentRuns: current.runs,
    previousRuns: previous.runs,
  };
}

function buildSignals(input: {
  activities28d: number;
  runActivities28d: number;
  activeDays28d: number;
  current7dDistanceKm: number;
  previous7dDistanceKm: number;
  distanceTrendPercent: number | null;
  elevationPerKm: number | null;
  runningDistanceKm28d: number;
  recoveryDays14d: number;
  latestRecovery: PerformanceRecoveryPointV2 | null;
  hrvDeltaVsBaselinePercent: number | null;
  restingHeartRateDeltaVsBaseline: number | null;
  paceHeartRate: PaceHeartRateComparison;
}): PerformanceSignalV2[] {
  const signals: PerformanceSignalV2[] = [];

  if (input.activities28d > 0 && input.runActivities28d === 0) {
    signals.push({
      id: "run-evidence",
      title: "Garmin is live; run evidence is sparse",
      body: `${input.activities28d} Garmin activities across ${input.activeDays28d} days are present in the last 28 days, but none currently classify as a run or trail run. The Lab is working; running metrics will stay deliberately blank until run-distance evidence arrives.`,
      confidence: "high",
      status: "building",
      evidence: [
        `${input.activities28d} Garmin activities`,
        `${input.activeDays28d} active days`,
        "0 classified runs in 28d",
      ],
    });
  } else if (input.distanceTrendPercent != null) {
    const direction = input.distanceTrendPercent >= 0 ? "up" : "down";
    signals.push({
      id: "volume",
      title: "Running volume movement",
      body: `Seven-day running distance is ${Math.abs(input.distanceTrendPercent).toFixed(0)}% ${direction} versus the previous seven days (${input.current7dDistanceKm.toFixed(1)} km vs ${input.previous7dDistanceKm.toFixed(1)} km). This describes workload movement, not whether more or less mileage is automatically better.`,
      confidence: input.runActivities28d >= 8 ? "high" : "moderate",
      status:
        Math.abs(input.distanceTrendPercent) >= 35 ? "watch" : "neutral",
      evidence: [
        `${input.current7dDistanceKm.toFixed(1)} km current 7d`,
        `${input.previous7dDistanceKm.toFixed(1)} km previous 7d`,
      ],
    });
  } else {
    signals.push({
      id: "volume",
      title: "Running volume baseline is building",
      body:
        input.current7dDistanceKm > 0
          ? `Current seven-day running volume is ${input.current7dDistanceKm.toFixed(1)} km. TrainVault needs a non-zero comparison week before calling a direction.`
          : "No running distance is present in the current seven-day window yet.",
      confidence: "low",
      status: "building",
      evidence: [`${input.runActivities28d} classified runs in 28d`],
    });
  }

  if (input.elevationPerKm != null) {
    signals.push({
      id: "terrain",
      title: "Terrain density",
      body: `Recent run/trail activity averages ${Math.round(input.elevationPerKm)} m of ascent per kilometre across ${input.runningDistanceKm28d.toFixed(1)} km. That gives TrainVault a better picture of leg cost than distance alone.`,
      confidence: input.runningDistanceKm28d >= 30 ? "high" : "moderate",
      status: input.elevationPerKm >= 45 ? "watch" : "neutral",
      evidence: [
        `${Math.round(input.elevationPerKm)} m/km`,
        `${input.runningDistanceKm28d.toFixed(1)} km observed`,
      ],
    });
  } else {
    signals.push({
      id: "terrain",
      title: "Terrain model waiting for evidence",
      body: "Running distance plus elevation gain is required before TrainVault describes how vertical the recent block has been.",
      confidence: "low",
      status: "building",
      evidence: ["No comparable run + elevation window yet"],
    });
  }

  if (
    input.hrvDeltaVsBaselinePercent != null ||
    input.restingHeartRateDeltaVsBaseline != null
  ) {
    const hrvText =
      input.hrvDeltaVsBaselinePercent == null
        ? null
        : `HRV ${input.hrvDeltaVsBaselinePercent >= 0 ? "+" : ""}${input.hrvDeltaVsBaselinePercent.toFixed(0)}% vs recent baseline`;
    const rhrText =
      input.restingHeartRateDeltaVsBaseline == null
        ? null
        : `resting HR ${input.restingHeartRateDeltaVsBaseline >= 0 ? "+" : ""}${input.restingHeartRateDeltaVsBaseline.toFixed(0)} bpm`;
    const watch =
      (input.hrvDeltaVsBaselinePercent != null &&
        input.hrvDeltaVsBaselinePercent <= -10) ||
      (input.restingHeartRateDeltaVsBaseline != null &&
        input.restingHeartRateDeltaVsBaseline >= 5);

    signals.push({
      id: "recovery",
      title: "Recovery baseline comparison",
      body: `Latest recovery sits at ${[hrvText, rhrText].filter(Boolean).join(" and ")}. TrainVault keeps this as context for the plan rather than turning one morning into a diagnosis.`,
      confidence: input.recoveryDays14d >= 7 ? "moderate" : "low",
      status: watch ? "watch" : "positive",
      evidence: [
        `${input.recoveryDays14d}/14 recovery days`,
        ...(hrvText ? [hrvText] : []),
        ...(rhrText ? [rhrText] : []),
      ],
    });
  } else {
    signals.push({
      id: "recovery",
      title: "Recovery runway",
      body: `${input.recoveryDays14d} of the last 14 days contain recovery data. A longer consecutive streak unlocks meaningful HRV, resting-HR and sleep comparisons instead of single-day snapshots.`,
      confidence: input.recoveryDays14d >= 10 ? "moderate" : "low",
      status: "building",
      evidence: [`${input.recoveryDays14d}/14 recovery days captured`],
    });
  }

  if (input.paceHeartRate.comparable) {
    const delta = input.paceHeartRate.paceDeltaSecondsPerKm ?? 0;
    const faster = delta < 0;
    signals.push({
      id: "efficiency",
      title: "Pace at comparable heart rate",
      body: `Across the last two 14-day windows, weighted running pace is ${Math.abs(delta).toFixed(0)} sec/km ${faster ? "faster" : "slower"} while weighted heart rate stayed within 5 bpm. This is an emerging aerobic-efficiency signal, not a race prediction.`,
      confidence:
        input.paceHeartRate.currentRuns >= 3 &&
        input.paceHeartRate.previousRuns >= 3
          ? "high"
          : "moderate",
      status: faster ? "positive" : "watch",
      evidence: [
        `${input.paceHeartRate.currentRuns} current-window runs`,
        `${input.paceHeartRate.previousRuns} previous-window runs`,
        `${Math.abs(input.paceHeartRate.heartRateDeltaBpm ?? 0).toFixed(0)} bpm HR difference`,
      ],
    });
  } else {
    signals.push({
      id: "efficiency",
      title: "Aerobic efficiency needs comparable runs",
      body: "TrainVault will compare pace at similar weighted heart rate once both 14-day windows contain at least two runs with usable HR and pace data. Until then it refuses to call improvement or decline.",
      confidence: "low",
      status: "building",
      evidence: [
        `${input.paceHeartRate.currentRuns} runs in current 14d`,
        `${input.paceHeartRate.previousRuns} runs in previous 14d`,
      ],
    });
  }

  return signals;
}

export function buildPerformanceLabV2Snapshot(
  activities: NormalizedGarminActivity[],
  recovery: DailyRecoveryRecord[],
  logs: SessionLog[],
  now = new Date(),
): PerformanceLabV2Snapshot {
  const nowTimestamp = now.getTime();
  const windowEnd = nowTimestamp + DAY_MS;
  const start28 = nowTimestamp - 28 * DAY_MS;
  const start14 = nowTimestamp - 14 * DAY_MS;
  const start7 = nowTimestamp - 7 * DAY_MS;
  const start56 = nowTimestamp - 56 * DAY_MS;

  const datedActivities = activities
    .map((activity) => ({ activity, timestamp: activityTimestamp(activity) }))
    .filter(
      (item): item is { activity: NormalizedGarminActivity; timestamp: number } =>
        item.timestamp !== null,
    )
    .sort((first, second) => first.timestamp - second.timestamp);
  const activities56d = datedActivities.filter(
    (item) => item.timestamp >= start56 && item.timestamp <= windowEnd,
  );
  const activities28d = datedActivities.filter(
    (item) => item.timestamp >= start28 && item.timestamp <= windowEnd,
  );
  const runs56d = activities56d.filter((item) =>
    isGarminRunningActivity(item.activity),
  );
  const runs28d = activities28d.filter((item) =>
    isGarminRunningActivity(item.activity),
  );
  const current7dRuns = runs28d.filter((item) => item.timestamp >= start7);
  const previous7dRuns = runs28d.filter(
    (item) => item.timestamp >= start14 && item.timestamp < start7,
  );

  const runDistanceMeters = sum(runs28d.map((item) => item.activity.distanceMeters));
  const runDurationSeconds = sum(
    runs28d.map((item) => activityDurationSeconds(item.activity)),
  );
  const runElevation = sum(
    runs28d.map((item) => item.activity.elevationGainMeters),
  );
  const runDistanceKm = runDistanceMeters / 1_000;
  const current7dDistanceKm =
    sum(current7dRuns.map((item) => item.activity.distanceMeters)) / 1_000;
  const previous7dDistanceKm =
    sum(previous7dRuns.map((item) => item.activity.distanceMeters)) / 1_000;
  const pace = weightedAverage(
    runs28d.map((item) => ({
      value: activityPaceSecondsPerKm(item.activity),
      weight: item.activity.distanceMeters,
    })),
  );
  const heartRate = weightedAverage(
    runs28d.map((item) => ({
      value: item.activity.averageHeartRateBpm,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const cadence = weightedAverage(
    runs28d.map((item) => ({
      value: item.activity.averageCadenceSpm,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const aerobicTrainingEffect = weightedAverage(
    runs28d.map((item) => ({
      value: item.activity.aerobicTrainingEffect,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const anaerobicTrainingEffect = weightedAverage(
    runs28d.map((item) => ({
      value: item.activity.anaerobicTrainingEffect,
      weight: activityDurationSeconds(item.activity),
    })),
  );
  const trainingEffectActivities = runs28d.filter(
    (item) =>
      item.activity.aerobicTrainingEffect != null ||
      item.activity.anaerobicTrainingEffect != null,
  ).length;
  const longestRun = [...runs28d].sort(
    (first, second) =>
      (second.activity.distanceMeters ?? 0) - (first.activity.distanceMeters ?? 0),
  )[0];
  const activeDays = new Set(
    activities28d.map((item) => localDateKey(new Date(item.timestamp))),
  );
  const runDays = new Set(
    runs28d.map((item) => localDateKey(new Date(item.timestamp))),
  );
  const totalActivitySeconds = sum(
    activities28d.map((item) => activityDurationSeconds(item.activity)),
  );

  const recoverySeries = buildRecoverySeries(recovery, nowTimestamp);
  const latestRecovery = recoverySeries.at(-1) ?? null;
  const recentRecovery = recoverySeries.slice(-7);
  const baselineRecovery = recoverySeries.slice(0, -1).slice(-7);
  const baselineHrv = average(baselineRecovery.map((point) => point.hrvMs));
  const baselineRhr = average(
    baselineRecovery.map((point) => point.restingHeartRate),
  );
  const hrvDelta =
    latestRecovery?.hrvMs != null && baselineHrv != null && baselineHrv > 0
      ? ((latestRecovery.hrvMs - baselineHrv) / baselineHrv) * 100
      : null;
  const restingHeartRateDelta =
    latestRecovery?.restingHeartRate != null && baselineRhr != null
      ? latestRecovery.restingHeartRate - baselineRhr
      : null;

  const paceHeartRate = buildPaceHeartRateComparison(runs56d, nowTimestamp);
  const current14 = aggregateRunWindow(
    runs56d,
    nowTimestamp - 14 * DAY_MS,
    windowEnd,
  );
  const previous14 = aggregateRunWindow(
    runs56d,
    nowTimestamp - 28 * DAY_MS,
    nowTimestamp - 14 * DAY_MS,
  );
  const elevationPerKm =
    runDistanceKm > 0 ? runElevation / runDistanceKm : null;

  const signals = buildSignals({
    activities28d: activities28d.length,
    runActivities28d: runs28d.length,
    activeDays28d: activeDays.size,
    current7dDistanceKm: round(current7dDistanceKm),
    previous7dDistanceKm: round(previous7dDistanceKm),
    distanceTrendPercent: trendPercent(
      current7dDistanceKm,
      previous7dDistanceKm,
    ),
    elevationPerKm,
    runningDistanceKm28d: runDistanceKm,
    recoveryDays14d: recoverySeries.length,
    latestRecovery,
    hrvDeltaVsBaselinePercent: hrvDelta,
    restingHeartRateDeltaVsBaseline: restingHeartRateDelta,
    paceHeartRate,
  });

  return {
    source: {
      activities28d: activities28d.length,
      activeDays28d: activeDays.size,
      totalHours28d: round(totalActivitySeconds / 3_600),
      recoveryDays14d: recoverySeries.length,
      recoveryCoveragePercent: Math.round((recoverySeries.length / 14) * 100),
      lastActivityAt:
        datedActivities.length > 0
          ? datedActivities.at(-1)?.activity.localStartTime ??
            datedActivities.at(-1)?.activity.startTime ??
            null
          : null,
      lastRunAt:
        runs56d.length > 0
          ? runs56d.at(-1)?.activity.localStartTime ??
            runs56d.at(-1)?.activity.startTime ??
            null
          : null,
    },
    run: {
      activities28d: runs28d.length,
      days28d: runDays.size,
      distanceKm28d: round(runDistanceKm),
      hours28d: round(runDurationSeconds / 3_600),
      elevationGainM28d: Math.round(runElevation),
      elevationPerKm: elevationPerKm == null ? null : round(elevationPerKm, 0),
      averagePaceSecondsPerKm: pace == null ? null : round(pace, 0),
      averageHeartRateBpm: heartRate == null ? null : round(heartRate, 0),
      averageCadenceSpm: cadence == null ? null : round(cadence, 0),
      averageRunDistanceKm:
        runs28d.length > 0 ? round(runDistanceKm / runs28d.length) : null,
      longestRunDistanceKm:
        longestRun?.activity.distanceMeters != null
          ? round(longestRun.activity.distanceMeters / 1_000)
          : null,
      longestRunMinutes:
        longestRun != null
          ? Math.round(activityDurationSeconds(longestRun.activity) / 60)
          : null,
      current7dDistanceKm: round(current7dDistanceKm),
      previous7dDistanceKm: round(previous7dDistanceKm),
      distanceTrendPercent: trendPercent(
        current7dDistanceKm,
        previous7dDistanceKm,
      ),
      current14dDistanceKm: round(current14.distanceKm),
      previous14dDistanceKm: round(previous14.distanceKm),
      averageAerobicTrainingEffect:
        aerobicTrainingEffect == null ? null : round(aerobicTrainingEffect),
      averageAnaerobicTrainingEffect:
        anaerobicTrainingEffect == null ? null : round(anaerobicTrainingEffect),
      trainingEffectActivities,
    },
    recovery: {
      latest: latestRecovery,
      averageHrv7d:
        average(recentRecovery.map((point) => point.hrvMs)) == null
          ? null
          : round(average(recentRecovery.map((point) => point.hrvMs)) as number),
      averageRestingHeartRate7d:
        average(recentRecovery.map((point) => point.restingHeartRate)) == null
          ? null
          : round(
              average(
                recentRecovery.map((point) => point.restingHeartRate),
              ) as number,
            ),
      averageSleepScore7d:
        average(recentRecovery.map((point) => point.sleepScore)) == null
          ? null
          : round(
              average(recentRecovery.map((point) => point.sleepScore)) as number,
              0,
            ),
      averageSleepHours7d:
        average(recentRecovery.map((point) => point.sleepHours)) == null
          ? null
          : round(
              average(recentRecovery.map((point) => point.sleepHours)) as number,
            ),
      averageBodyBattery7d:
        average(recentRecovery.map((point) => point.bodyBattery)) == null
          ? null
          : round(
              average(recentRecovery.map((point) => point.bodyBattery)) as number,
              0,
            ),
      averageReadiness7d:
        average(recentRecovery.map((point) => point.readiness)) == null
          ? null
          : round(
              average(recentRecovery.map((point) => point.readiness)) as number,
              0,
            ),
      hrvDeltaVsBaselinePercent: hrvDelta == null ? null : round(hrvDelta, 0),
      restingHeartRateDeltaVsBaseline:
        restingHeartRateDelta == null ? null : round(restingHeartRateDelta, 0),
    },
    paceHeartRate,
    weekly: buildWeekly(activities56d.map((item) => item.activity), nowTimestamp),
    recoverySeries,
    dailyLoad: buildDailyLoad(activities28d, recovery, logs, nowTimestamp),
    families: buildFamilies(activities28d),
    manualCategories: buildManualCategories(logs, nowTimestamp),
    recentActivities: [...datedActivities]
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 10)
      .map((item) => item.activity),
    recentRuns: [...runs56d]
      .sort((first, second) => second.timestamp - first.timestamp)
      .slice(0, 6)
      .map((item) => item.activity),
    signals,
  };
}
