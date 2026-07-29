import type {
  ActivityMatchCandidate,
  ActivityMatchReason,
  ActivityMatchResult,
  GarminActivity,
  PlannedRunningSession,
} from "./types";

const AUTO_MATCH_SCORE = 65;
const REVIEW_SCORE = 30;
const AMBIGUOUS_MARGIN = 15;

function isRunningActivity(activityType: string | null) {
  const normalized = activityType?.toLowerCase().replaceAll("-", "_") ?? "";
  return normalized.includes("run") || normalized.includes("jog");
}

function datePart(timestamp: string | null) {
  const match = timestamp?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function daysApart(first: string, second: string) {
  const firstTime = Date.parse(`${first}T00:00:00Z`);
  const secondTime = Date.parse(`${second}T00:00:00Z`);

  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(firstTime - secondTime) / 86_400_000;
}

function relativeDifference(actual: number, planned: number) {
  return Math.abs(actual - planned) / planned;
}

function addSimilarityScore(
  actual: number | null,
  planned: number | null | undefined,
  reason: ActivityMatchReason,
  strongScore: number,
  moderateScore: number,
) {
  if (
    actual === null ||
    planned === null ||
    planned === undefined ||
    actual <= 0 ||
    planned <= 0
  ) {
    return { score: 0, reason: null };
  }

  const difference = relativeDifference(actual, planned);

  if (difference <= 0.1) {
    return { score: strongScore, reason };
  }

  if (difference <= 0.25) {
    return { score: moderateScore, reason };
  }

  return { score: 0, reason: null };
}

function scoreCandidate(
  activity: GarminActivity,
  session: PlannedRunningSession,
): ActivityMatchCandidate | null {
  const activityDate =
    datePart(activity.localStartTime) ?? datePart(activity.startTime);
  const differenceInDays = activityDate
    ? daysApart(activityDate, session.date)
    : Number.POSITIVE_INFINITY;
  const workoutIdMatches =
    Boolean(activity.garminWorkoutId) &&
    Boolean(session.garminWorkoutId) &&
    activity.garminWorkoutId === session.garminWorkoutId;

  if (!workoutIdMatches && differenceInDays > 1) {
    return null;
  }

  let score = 0;
  const reasons: ActivityMatchReason[] = [];

  if (workoutIdMatches) {
    score += 70;
    reasons.push("garmin_workout_id");
  }

  if (differenceInDays === 0) {
    score += 30;
    reasons.push("same_date");
  } else if (differenceInDays === 1) {
    score += 5;
    reasons.push("adjacent_date");
  }

  if (session.plannedStartTime && activity.startTime) {
    const plannedTime = Date.parse(session.plannedStartTime);
    const activityTime = Date.parse(activity.startTime);
    const hoursApart =
      Math.abs(plannedTime - activityTime) / (60 * 60 * 1_000);

    if (Number.isFinite(hoursApart) && hoursApart <= 3) {
      score += 15;
      reasons.push("start_time");
    }
  }

  const distance = addSimilarityScore(
    activity.distanceMeters,
    session.plannedDistanceMeters,
    "distance",
    20,
    10,
  );
  score += distance.score;
  if (distance.reason) {
    reasons.push(distance.reason);
  }

  const duration = addSimilarityScore(
    activity.durationSeconds,
    session.plannedDurationSeconds,
    "duration",
    15,
    8,
  );
  score += duration.score;
  if (duration.reason) {
    reasons.push(duration.reason);
  }

  return {
    sessionId: session.sessionId,
    score,
    reasons,
  };
}

/**
 * Deterministically match a completed Garmin run to a planned session.
 * Ambiguous evidence is returned for athlete confirmation, never auto-linked.
 */
export function matchGarminActivity(
  activity: GarminActivity,
  sessions: PlannedRunningSession[],
): ActivityMatchResult {
  if (!isRunningActivity(activity.activityType)) {
    return {
      kind: "none",
      confidence: "low",
      candidate: null,
      alternatives: [],
    };
  }

  const candidates = sessions
    .map((session) => scoreCandidate(activity, session))
    .filter((candidate): candidate is ActivityMatchCandidate => candidate !== null)
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.sessionId.localeCompare(second.sessionId),
    );
  const best = candidates[0];

  if (!best || best.score < REVIEW_SCORE) {
    return {
      kind: "none",
      confidence: "low",
      candidate: null,
      alternatives: [],
    };
  }

  const alternatives = candidates.slice(1);
  const runnerUp = alternatives[0];
  const exactWorkoutMatch = best.reasons.includes("garmin_workout_id");
  const competingExactMatch = runnerUp?.reasons.includes("garmin_workout_id") ?? false;
  const clearLead =
    !runnerUp || best.score - runnerUp.score >= AMBIGUOUS_MARGIN;

  if (
    best.score >= AUTO_MATCH_SCORE &&
    clearLead &&
    (!competingExactMatch || exactWorkoutMatch)
  ) {
    return {
      kind: "matched",
      confidence: best.score >= 85 ? "high" : "medium",
      candidate: best,
      alternatives,
    };
  }

  return {
    kind: "ambiguous",
    confidence: "low",
    candidate: best,
    alternatives,
  };
}
