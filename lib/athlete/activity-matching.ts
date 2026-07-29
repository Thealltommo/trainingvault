import { clamp, round } from "./ids";
import type {
  ActivityMatch,
  ActivityMatchConfidence,
  AthleteSession,
  NormalizedActivityRecord,
  PlannedVsActual,
} from "./types";

function normalizedType(value: string) {
  const signal = value.toLowerCase();
  if (signal.includes("trail")) return "trail";
  if (signal.includes("run") || signal.includes("treadmill")) return "run";
  if (signal.includes("walk") || signal.includes("hike")) return "hike";
  if (signal.includes("strength") || signal.includes("weight")) return "strength";
  if (signal.includes("cardio") || signal.includes("crossfit")) return "conditioning";
  if (signal.includes("bike") || signal.includes("cycling")) return "bike";
  if (signal.includes("row")) return "row";
  return signal.trim();
}

function typeCompatibility(session: AthleteSession, activity: NormalizedActivityRecord) {
  const planned = session.currentPrescription.category;
  const actual = normalizedType(activity.type);

  if (planned === actual) return 1;
  if ((planned === "run" || planned === "race") && (actual === "run" || actual === "trail")) return 0.9;
  if (planned === "trail" && (actual === "trail" || actual === "run" || actual === "hike")) return 0.85;
  if (
    (planned === "crossfit" || planned === "hybrid" || planned === "hyrox") &&
    (actual === "conditioning" || actual === "strength")
  ) {
    return 0.7;
  }
  if (planned === "conditioning" && ["conditioning", "bike", "row", "run"].includes(actual)) return 0.65;
  return 0;
}

function sameDate(plannedDate: string | undefined, timestamp: string) {
  if (!plannedDate) return undefined;
  const actualDate = timestamp.slice(0, 10);
  if (actualDate === plannedDate) return 1;

  const planned = new Date(`${plannedDate}T00:00:00Z`).getTime();
  const actual = new Date(`${actualDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) return 0;
  const days = Math.abs(actual - planned) / 86_400_000;
  return days === 1 ? 0.45 : 0;
}

function similarity(actual: number, planned: number) {
  if (actual <= 0 || planned <= 0) return 0;
  return clamp(1 - Math.abs(actual - planned) / planned, 0, 1);
}

function confidenceFor(score: number): ActivityMatchConfidence {
  if (score >= 0.82) return "high";
  if (score >= 0.62) return "medium";
  if (score >= 0.4) return "low";
  return "none";
}

export function matchActivityToSession(
  session: AthleteSession,
  activity: NormalizedActivityRecord,
): ActivityMatch {
  const reasons: string[] = [];
  const planned = session.currentPrescription;
  const components: Array<{ weight: number; value: number }> = [];
  const exactGarminWorkout =
    Boolean(session.integration.garminWorkoutId) &&
    session.integration.garminWorkoutId === activity.garminWorkoutId;
  const conflictingGarminWorkout =
    Boolean(session.integration.garminWorkoutId) &&
    Boolean(activity.garminWorkoutId) &&
    session.integration.garminWorkoutId !== activity.garminWorkoutId;

  const typeScore = typeCompatibility(session, activity);
  components.push({ weight: 0.25, value: typeScore });
  reasons.push(
    typeScore >= 0.85
      ? "Activity type closely matches the planned session."
      : typeScore > 0
        ? "Activity type is compatible but not exact."
        : "Activity type does not match the planned session.",
  );

  const dateScore = sameDate(planned.date, activity.startTime);
  if (dateScore !== undefined) {
    components.push({ weight: 0.35, value: dateScore });
    reasons.push(
      dateScore === 1
        ? "Activity occurred on the planned date."
        : dateScore > 0
          ? "Activity occurred one day from the planned date."
          : "Activity date is outside the matching window.",
    );
  }

  if (activity.durationSeconds && planned.durationMinutes > 0) {
    const durationScore = similarity(
      activity.durationSeconds,
      planned.durationMinutes * 60,
    );
    components.push({ weight: 0.2, value: durationScore });
    reasons.push(
      `Duration similarity is ${Math.round(durationScore * 100)}%.`,
    );
  }

  if (
    activity.distanceMeters &&
    planned.targets.distanceMeters &&
    planned.targets.distanceMeters > 0
  ) {
    const distanceScore = similarity(
      activity.distanceMeters,
      planned.targets.distanceMeters,
    );
    components.push({ weight: 0.2, value: distanceScore });
    reasons.push(
      `Distance similarity is ${Math.round(distanceScore * 100)}%.`,
    );
  }

  const totalWeight = components.reduce((total, component) => total + component.weight, 0);
  let score =
    totalWeight > 0
      ? components.reduce(
          (total, component) => total + component.weight * component.value,
          0,
        ) / totalWeight
      : 0;

  if (exactGarminWorkout) {
    score = Math.max(score, 0.96);
    reasons.unshift("Garmin workout ID is an exact match.");
  } else if (conflictingGarminWorkout) {
    score = Math.min(score, 0.25);
    reasons.unshift("Garmin workout IDs conflict.");
  }

  score = round(clamp(score, 0, 1), 3);
  const confidence = confidenceFor(score);

  return {
    sessionId: session.id,
    activityId: activity.id,
    score,
    confidence,
    shouldAutoLink:
      confidence === "high" && !conflictingGarminWorkout,
    ambiguous: false,
    reasons,
  };
}

export function rankActivityMatches(
  session: AthleteSession,
  activities: NormalizedActivityRecord[],
): ActivityMatch[] {
  const ranked = activities
    .map((activity) => matchActivityToSession(session, activity))
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.activityId.localeCompare(second.activityId),
    );

  if (ranked.length < 2) return ranked;

  const ambiguous =
    ranked[0].score >= 0.4 &&
    ranked[0].score - ranked[1].score < 0.08 &&
    !ranked[0].reasons.includes("Garmin workout ID is an exact match.");

  if (ambiguous) {
    ranked[0] = {
      ...ranked[0],
      ambiguous: true,
      shouldAutoLink: false,
      reasons: [
        ...ranked[0].reasons,
        "Another activity has a similar score; athlete confirmation is required.",
      ],
    };
    ranked[1] = {
      ...ranked[1],
      ambiguous: true,
      shouldAutoLink: false,
    };
  }

  return ranked;
}

export function analysePlannedVsActual(
  session: AthleteSession,
  activity: NormalizedActivityRecord,
): PlannedVsActual {
  const planned = session.currentPrescription;
  const durationDeltaMinutes =
    activity.durationSeconds !== undefined
      ? round(activity.durationSeconds / 60 - planned.durationMinutes, 1)
      : undefined;
  const durationDeltaPercent =
    activity.durationSeconds !== undefined && planned.durationMinutes > 0
      ? round(
          ((activity.durationSeconds / 60 - planned.durationMinutes) /
            planned.durationMinutes) *
            100,
          1,
        )
      : undefined;
  const distanceDeltaMeters =
    activity.distanceMeters !== undefined &&
    planned.targets.distanceMeters !== undefined
      ? round(activity.distanceMeters - planned.targets.distanceMeters, 0)
      : undefined;
  const distanceDeltaPercent =
    distanceDeltaMeters !== undefined &&
    planned.targets.distanceMeters !== undefined &&
    planned.targets.distanceMeters > 0
      ? round((distanceDeltaMeters / planned.targets.distanceMeters) * 100, 1)
      : undefined;
  const plannedPace =
    planned.targets.paceSecondsPerKm ??
    (planned.targets.paceRangeSecondsPerKm
      ? (planned.targets.paceRangeSecondsPerKm[0] +
          planned.targets.paceRangeSecondsPerKm[1]) /
        2
      : undefined);
  const paceDeltaSecondsPerKm =
    plannedPace !== undefined &&
    activity.averagePaceSecondsPerKm !== undefined
      ? round(activity.averagePaceSecondsPerKm - plannedPace, 1)
      : undefined;
  const elevationDeltaMeters =
    planned.targets.elevationGainMeters !== undefined &&
    activity.elevationGainMeters !== undefined
      ? round(
          activity.elevationGainMeters -
            planned.targets.elevationGainMeters,
          0,
        )
      : undefined;
  const completionRatios = [
    activity.durationSeconds !== undefined
      ? activity.durationSeconds / 60 / Math.max(1, planned.durationMinutes)
      : undefined,
    activity.distanceMeters !== undefined &&
    planned.targets.distanceMeters !== undefined
      ? activity.distanceMeters / Math.max(1, planned.targets.distanceMeters)
      : undefined,
  ].filter((value): value is number => value !== undefined);
  const averageRatio =
    completionRatios.length > 0
      ? completionRatios.reduce((total, value) => total + value, 0) /
        completionRatios.length
      : undefined;
  const adherence =
    averageRatio === undefined
      ? "unknown"
      : averageRatio < 0.8
        ? "partial"
        : averageRatio > 1.2
          ? "over"
          : "on_target";
  const observations: string[] = [];

  if (durationDeltaPercent !== undefined) {
    observations.push(
      `Actual duration was ${Math.abs(durationDeltaPercent).toFixed(1)}% ${durationDeltaPercent >= 0 ? "above" : "below"} plan.`,
    );
  }
  if (distanceDeltaPercent !== undefined) {
    observations.push(
      `Actual distance was ${Math.abs(distanceDeltaPercent).toFixed(1)}% ${distanceDeltaPercent >= 0 ? "above" : "below"} plan.`,
    );
  }
  if (paceDeltaSecondsPerKm !== undefined) {
    observations.push(
      `Average pace was ${Math.abs(paceDeltaSecondsPerKm).toFixed(0)} sec/km ${paceDeltaSecondsPerKm <= 0 ? "faster" : "slower"} than the target midpoint.`,
    );
  }
  if (observations.length === 0) {
    observations.push(
      "Not enough comparable planned and actual fields were available.",
    );
  }

  return {
    sessionId: session.id,
    activityId: activity.id,
    durationDeltaMinutes,
    durationDeltaPercent,
    distanceDeltaMeters,
    distanceDeltaPercent,
    paceDeltaSecondsPerKm,
    elevationDeltaMeters,
    adherence,
    observations,
  };
}
