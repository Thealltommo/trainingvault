import { makeStableId, round } from "./ids";
import type {
  AthleteInsight,
  AthleteSession,
  PerformanceObservation,
  WeeklyTrainingMetrics,
} from "./types";

function dateKey(value: string | undefined) {
  return value?.slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inRange(value: string | undefined, start: string, end: string) {
  const key = dateKey(value);
  return Boolean(key && key >= start && key <= end);
}

function confidenceFor(count: number): AthleteInsight["confidence"] {
  return count >= 10 ? "high" : count >= 6 ? "medium" : "low";
}

export function computeWeeklyTrainingMetrics(
  sessions: AthleteSession[],
  weekStart: string,
): WeeklyTrainingMetrics {
  const weekEnd = addDays(weekStart, 6);
  const planned = sessions.filter((session) =>
    inRange(session.currentPrescription.date, weekStart, weekEnd),
  );
  const completed = sessions.filter((session) =>
    inRange(session.completedPrescription?.completedAt, weekStart, weekEnd),
  );
  const completedPlannedIds = new Set(
    planned
      .filter((session) => session.status === "completed")
      .map((session) => session.id),
  );
  const actualMinutes = completed.reduce(
    (total, session) =>
      total + (session.completedPrescription?.actualDurationMinutes ?? 0),
    0,
  );
  const rpeValues = completed
    .map((session) => session.completedPrescription?.rpe)
    .filter((value): value is number => value !== undefined);

  return {
    weekStart,
    weekEnd,
    plannedSessions: planned.length,
    completedSessions: completed.length,
    skippedSessions: planned.filter((session) => session.status === "skipped").length,
    modifiedSessions: planned.filter((session) => session.isModified).length,
    plannedMinutes: planned.reduce(
      (total, session) => total + session.currentPrescription.durationMinutes,
      0,
    ),
    actualMinutes,
    plannedDistanceKm: round(
      planned.reduce(
        (total, session) =>
          total + (session.currentPrescription.targets.distanceMeters ?? 0),
        0,
      ) / 1_000,
      2,
    ),
    actualDistanceKm: round(
      completed.reduce(
        (total, session) =>
          total +
          (session.completedPrescription?.actualDistanceMeters ?? 0),
        0,
      ) / 1_000,
      2,
    ),
    plannedElevationMeters: Math.round(
      planned.reduce(
        (total, session) =>
          total +
          (session.currentPrescription.targets.elevationGainMeters ?? 0),
        0,
      ),
    ),
    actualElevationMeters: Math.round(
      completed.reduce(
        (total, session) =>
          total +
          (session.completedPrescription?.actualElevationGainMeters ?? 0),
        0,
      ),
    ),
    adherencePercent:
      planned.length > 0
        ? Math.round((completedPlannedIds.size / planned.length) * 100)
        : undefined,
    averageRpe:
      rpeValues.length > 0
        ? round(
            rpeValues.reduce((total, value) => total + value, 0) /
              rpeValues.length,
            1,
          )
        : undefined,
    totalPlannedCost: planned.reduce(
      (total, session) => total + session.plannedLoad.plannedCost,
      0,
    ),
  };
}

function insight(
  kind: AthleteInsight["kind"],
  title: string,
  message: string,
  dataPoints: number,
  options: {
    action?: string;
    insufficientData?: boolean;
  } = {},
): AthleteInsight {
  return {
    id: makeStableId("insight", kind, title, dataPoints, message),
    kind,
    title,
    message,
    action: options.action,
    confidence: options.insufficientData ? "low" : confidenceFor(dataPoints),
    dataPoints,
    insufficientData: options.insufficientData ?? false,
  };
}

export function generateAthleteInsights(input: {
  sessions: AthleteSession[];
  observations?: PerformanceObservation[];
  minimumSampleSize?: number;
}): AthleteInsight[] {
  const minimumSampleSize = Math.max(3, input.minimumSampleSize ?? 4);
  const completed = input.sessions
    .filter((session) => session.completedPrescription)
    .sort(
      (first, second) =>
        new Date(first.completedPrescription!.completedAt).getTime() -
        new Date(second.completedPrescription!.completedAt).getTime(),
    );
  const insights: AthleteInsight[] = [];

  if (completed.length < minimumSampleSize) {
    insights.push(
      insight(
        "data_quality",
        "More training data needed",
        `Only ${completed.length} completed session${completed.length === 1 ? "" : "s"} are available. TrainVault will not claim a performance trend yet.`,
        completed.length,
        { insufficientData: true },
      ),
    );
  }

  const datedPlanned = input.sessions.filter(
    (session) => session.currentPrescription.date,
  );
  if (datedPlanned.length >= minimumSampleSize) {
    const completedCount = datedPlanned.filter(
      (session) => session.status === "completed",
    ).length;
    const adherence = completedCount / datedPlanned.length;

    if (adherence < 0.75) {
      insights.push(
        insight(
          "adherence",
          "Plan adherence is below 75%",
          `${completedCount} of ${datedPlanned.length} dated sessions are completed in this sample.`,
          datedPlanned.length,
          {
            action:
              "Review whether session placement, recovery cost, or available training days are making the plan unrealistic.",
          },
        ),
      );
    }
  }

  const durationComparisons = completed
    .map((session) => {
      const actual = session.completedPrescription?.actualDurationMinutes;
      const planned = session.currentPrescription.durationMinutes;
      return actual && planned > 0 ? actual / planned : undefined;
    })
    .filter((value): value is number => value !== undefined);

  if (durationComparisons.length >= minimumSampleSize) {
    const averageRatio =
      durationComparisons.reduce((total, value) => total + value, 0) /
      durationComparisons.length;

    if (averageRatio < 0.8) {
      insights.push(
        insight(
          "load",
          "Completed duration is consistently below plan",
          `Across ${durationComparisons.length} sessions, actual duration averaged ${Math.round(averageRatio * 100)}% of planned duration.`,
          durationComparisons.length,
          {
            action:
              "Consider programming the adjusted version up front on constrained days.",
          },
        ),
      );
    }
  }

  const rpeValues = completed
    .map((session) => session.completedPrescription?.rpe)
    .filter((value): value is number => value !== undefined);

  if (rpeValues.length >= 6) {
    const midpoint = Math.floor(rpeValues.length / 2);
    const earlier =
      rpeValues.slice(0, midpoint).reduce((total, value) => total + value, 0) /
      midpoint;
    const laterValues = rpeValues.slice(midpoint);
    const later =
      laterValues.reduce((total, value) => total + value, 0) /
      laterValues.length;
    const delta = later - earlier;

    if (Math.abs(delta) >= 1) {
      insights.push(
        insight(
          "recovery",
          delta > 0 ? "Recent RPE is trending higher" : "Recent RPE is trending lower",
          `Mean RPE changed from ${earlier.toFixed(1)} to ${later.toFixed(1)} across ${rpeValues.length} sessions. This is directional, not proof of a physiological trend.`,
          rpeValues.length,
          {
            action:
              delta > 0
                ? "Check recovery and lower-body interference before adding training load."
                : "Confirm pace, load, and session quality also improved before progressing volume.",
          },
        ),
      );
    }
  }

  const observations = (input.observations ?? []).filter(
    (observation) => observation.paceEfficiency !== undefined,
  );
  const afterLowerBody = observations.filter(
    (observation) => observation.precededByHighLowerBodyLoad48h,
  );
  const withoutLowerBody = observations.filter(
    (observation) => !observation.precededByHighLowerBodyLoad48h,
  );

  if (
    afterLowerBody.length >= 3 &&
    withoutLowerBody.length >= 3
  ) {
    const affectedAverage =
      afterLowerBody.reduce(
        (total, observation) => total + observation.paceEfficiency!,
        0,
      ) / afterLowerBody.length;
    const baselineAverage =
      withoutLowerBody.reduce(
        (total, observation) => total + observation.paceEfficiency!,
        0,
      ) / withoutLowerBody.length;
    const difference =
      baselineAverage === 0
        ? 0
        : (affectedAverage - baselineAverage) / Math.abs(baselineAverage);

    if (difference >= 0.03) {
      insights.push(
        insight(
          "performance",
          "Possible lower-body interference",
          `In this sample, pace-efficiency cost was ${Math.round(difference * 100)}% higher after high lower-body load (${afterLowerBody.length} affected vs ${withoutLowerBody.length} comparison sessions).`,
          observations.length,
          {
            action:
              "Where practical, separate key running quality from high lower-body sessions by another day and keep collecting data.",
          },
        ),
      );
    }
  }

  return insights.length > 0
    ? insights
    : [
        insight(
          "data_quality",
          "No defensible insight yet",
          "The available sample does not cross a configured threshold for an actionable conclusion.",
          completed.length,
          { insufficientData: true },
        ),
      ];
}
