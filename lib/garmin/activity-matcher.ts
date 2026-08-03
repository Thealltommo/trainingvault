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

function datePart(timestamp: string | null | undefined) {
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

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleSimilarityScore(
  activityTitle: string | null,
  sessionTitle: string,
) {
  const actual = normalizeTitle(activityTitle);
  const planned = normalizeTitle(sessionTitle);

  if (!actual || !planned) return 0;
  if (actual === planned) return 40;

  if (
    Math.min(actual.length, planned.length) >= 8 &&
    (actual.includes(planned) || planned.includes(actual))
  ) {
    return 24;
  }

  const actualTokens = new Set(actual.split(" "));
  const plannedTokens = new Set(planned.split(" "));
  const overlap = [...actualTokens].filter((token) => plannedTokens.has(token)).length;
  const union = new Set([...actualTokens, ...plannedTokens]).size;
  const similarity = union > 0 ? overlap / union : 0;

  if (similarity >= 0.75) return 22;
  if (similarity >= 0.5) return 10;
  return 0;
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
  const plannedDateDifference = activityDate
    ? daysApart(activityDate, session.date)
    : Number.POSITIVE_INFINITY;
  const completionDate = datePart(session.completedAt);
  const completionDateDifference =
    activityDate && completionDate
      ? daysApart(activityDate, completionDate)
      : Number.POSITIVE_INFINITY;
  const bestDateDifference = Math.min(
    plannedDateDifference,
    completionDateDifference,
  );
  const workoutIdMatches =
    Boolean(activity.garminWorkoutId) &&
    Boolean(session.garminWorkoutId) &&
    activity.garminWorkoutId === session.garminWorkoutId;

  // A manually confirmed completion date remains valid matching evidence after
  // the athlete moves the plan around. Without it, date drift greater than one
  // day is too weak to consider unless Garmin supplies the originating workout.
  if (!workoutIdMatches && bestDateDifference > 1) {
    return null;
  }

  let score = 0;
  const reasons: ActivityMatchReason[] = [];

  if (workoutIdMatches) {
    score += 70;
    reasons.push("garmin_workout_id");
  }

  if (plannedDateDifference === 0) {
    score += 30;
    reasons.push("same_date");
  } else if (completionDateDifference === 0) {
    score += 30;
    reasons.push("completion_date");
  } else if (bestDateDifference === 1) {
    score += 5;
    reasons.push("adjacent_date");
  }

  const titleScore = titleSimilarityScore(activity.title, session.title);
  score += titleScore;
  if (titleScore > 0) {
    reasons.push("title");
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
  if (distance.reason) reasons.push(distance.reason);

  const duration = addSimilarityScore(
    activity.durationSeconds,
    session.plannedDurationSeconds,
    "duration",
    15,
    8,
  );
  score += duration.score;
  if (duration.reason) reasons.push(duration.reason);

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
  const competingExactMatch =
    runnerUp?.reasons.includes("garmin_workout_id") ?? false;
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