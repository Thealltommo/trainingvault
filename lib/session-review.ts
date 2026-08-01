import type { StructuredRunningWorkout } from "@/lib/garmin";
import {
  analyseGarminPlannedVsActual,
  generateGarminPostRunCoachInsight,
  type GarminPlannedSession,
  type NormalizedGarminActivity,
} from "@/lib/garmin-storage";
import { normalizeLimiter } from "@/lib/session-log";
import type { SessionLog, Workout } from "@/lib/types";

export type SessionReviewTone = "positive" | "watch" | "neutral";

export type SessionReviewMetric = {
  label: string;
  value: string;
};

export type SessionReview = {
  title: string;
  summary: string;
  nextAction: string;
  confidence: string;
  sourceLabel: string;
  tone: SessionReviewTone;
  needsAthleteFeedback: boolean;
  metrics: SessionReviewMetric[];
  observations: string[];
};

type BuildSessionReviewInput = {
  workout: Workout;
  log?: SessionLog | null;
  activity?: NormalizedGarminActivity | null;
  structuredWorkout?: StructuredRunningWorkout | null;
};

function formatDurationMinutes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 90) {
    return `${Math.round(value)} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${minutes}m`;
}

function formatPace(secondsPerKm: number | null | undefined) {
  if (
    secondsPerKm === null ||
    secondsPerKm === undefined ||
    !Number.isFinite(secondsPerKm)
  ) {
    return "—";
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function flattenedStructuredSteps(workout: StructuredRunningWorkout | null | undefined) {
  if (!workout) {
    return [];
  }

  return workout.steps.flatMap((element) =>
    element.kind === "repeat"
      ? Array.from({ length: element.repetitions }, () => element.steps).flat()
      : [element],
  );
}

function plannedIntervalCount(workout: StructuredRunningWorkout | null | undefined) {
  if (!workout) {
    return null;
  }

  const count = workout.steps.reduce((total, element) => {
    if (element.kind !== "repeat") {
      return total;
    }

    return element.steps.some((step) => step.phase === "work")
      ? total + element.repetitions
      : total;
  }, 0);

  return count > 0 ? count : null;
}

function plannedDistanceMeters(workout: StructuredRunningWorkout | null | undefined) {
  const steps = flattenedStructuredSteps(workout);

  if (
    steps.length === 0 ||
    steps.some((step) => step.duration.type !== "distance")
  ) {
    return null;
  }

  return steps.reduce(
    (total, step) =>
      total + (step.duration.type === "distance" ? step.duration.meters : 0),
    0,
  );
}

function plannedHeartRateRange(workout: StructuredRunningWorkout | null | undefined) {
  const workTargets = flattenedStructuredSteps(workout)
    .filter((step) => step.phase === "work")
    .map((step) => step.target)
    .filter(
      (target): target is Extract<typeof target, { type: "heart_rate" }> =>
        target.type === "heart_rate",
    );

  if (workTargets.length === 0) {
    return null;
  }

  return [
    Math.min(...workTargets.map((target) => target.minimumBpm)),
    Math.max(...workTargets.map((target) => target.maximumBpm)),
  ] as [number, number];
}

function plannedSession(
  workout: Workout,
  structuredWorkout: StructuredRunningWorkout | null | undefined,
): GarminPlannedSession {
  return {
    sessionId: workout.id,
    title: workout.title,
    date: workout.date ?? structuredWorkout?.date ?? "1970-01-01",
    plannedDurationSeconds:
      structuredWorkout?.estimatedDurationSeconds ?? workout.durationMinutes * 60,
    plannedDistanceMeters: plannedDistanceMeters(structuredWorkout),
    plannedHeartRateRange: plannedHeartRateRange(structuredWorkout),
    plannedIntervalCount: plannedIntervalCount(structuredWorkout),
  };
}

function completedBlockCounts(log: SessionLog | null | undefined) {
  const blocks = log?.blockResults ?? [];
  return {
    done: blocks.filter((block) => block.status === "done").length,
    skipped: blocks.filter((block) => block.status === "skipped").length,
    total: blocks.length,
  };
}

function outcomeLabel(value: SessionLog["sessionFeel"]) {
  if (value === "strong") return "Strong";
  if (value === "struggled") return "Struggled";
  if (value === "controlled") return "Controlled";
  return null;
}

function executionLabel(value: SessionLog["execution"]) {
  if (value === "as_planned") return "As planned";
  if (value === "modified") return "Modified";
  if (value === "cut_short") return "Cut short";
  return null;
}

function recoveryLabel(value: SessionLog["recoveryConcern"]) {
  if (value === "monitor") return "Monitor recovery";
  if (value === "protect_next") return "Protect next quality";
  if (value === "none") return "No concern";
  return null;
}

function pushUnique(target: string[], value: string | null | undefined) {
  if (value && !target.includes(value)) {
    target.push(value);
  }
}

export function buildSessionReview({
  workout,
  log = null,
  activity = null,
  structuredWorkout = null,
}: BuildSessionReviewInput): SessionReview {
  const actualDurationMinutes =
    log?.actualDurationMinutes ??
    (activity?.durationSeconds != null ? activity.durationSeconds / 60 : null);
  const plannedDurationMinutes =
    structuredWorkout?.estimatedDurationSeconds != null
      ? structuredWorkout.estimatedDurationSeconds / 60
      : workout.durationMinutes;
  const durationRatio =
    actualDurationMinutes != null && plannedDurationMinutes > 0
      ? actualDurationMinutes / plannedDurationMinutes
      : null;
  const subjectiveLoad =
    log && actualDurationMinutes != null
      ? Math.round(actualDurationMinutes * log.rpe)
      : null;
  const limiter = normalizeLimiter(log?.limiter);
  const blocks = completedBlockCounts(log);
  const isRun = Boolean(
    activity?.activityType?.toLowerCase().includes("run") ||
      workout.sessionType?.toLowerCase().includes("run") ||
      workout.category === "track",
  );
  const comparison =
    activity && isRun
      ? analyseGarminPlannedVsActual(
          plannedSession(workout, structuredWorkout),
          activity,
        )
      : null;
  const garminInsight = comparison
    ? generateGarminPostRunCoachInsight(comparison)
    : null;
  const needsAthleteFeedback = !log;
  const highCost = Boolean(
    log &&
      (log.rpe >= 9 ||
        log.sessionFeel === "struggled" ||
        log.recoveryConcern === "protect_next"),
  );
  const cutShort = Boolean(
    log?.execution === "cut_short" ||
      comparison?.adherence === "partial" ||
      (durationRatio !== null && durationRatio < 0.8),
  );
  const extraVolume = Boolean(
    comparison?.adherence === "over" ||
      (durationRatio !== null && durationRatio > 1.2),
  );
  const easyCostTooHigh = Boolean(
    log && workout.intensity === "easy" && log.rpe >= 7,
  );
  const recoveryWasCostly = Boolean(
    log && workout.category === "recovery" && log.rpe >= 6,
  );
  const qualityLanded = Boolean(
    log &&
      workout.intensity === "hard" &&
      log.rpe >= 7 &&
      log.rpe <= 8 &&
      log.sessionFeel !== "struggled" &&
      log.execution !== "cut_short" &&
      comparison?.adherence !== "partial",
  );

  let title = "Session recorded";
  let summary =
    "Completion is recorded, but there is not enough evidence for a useful training conclusion yet.";
  let nextAction =
    "Add RPE, how the session landed, and any limiter so TrainVault can close the loop.";
  let tone: SessionReviewTone = "neutral";

  if (needsAthleteFeedback && activity) {
    title = "Garmin confirms the work";
    summary =
      "The watch supplied objective completion data. Subjective cost is still missing, so TrainVault will not infer that the session was easy, productive, or recoverable.";
  } else if (needsAthleteFeedback) {
    title = "Completion needs an athlete read";
    summary =
      "The session is marked complete, but no RPE or outcome has been logged. Add the twenty-second debrief before using it to guide the next session.";
  } else if (recoveryWasCostly) {
    title = "Recovery work was not restorative";
    summary =
      "This session carried more subjective cost than a recovery prescription should. Count it as training rather than free recovery volume.";
    nextAction =
      "Keep the next hard session conditional on morning recovery and the warm-up response.";
    tone = "watch";
  } else if (easyCostTooHigh) {
    title = "Easy work cost too much";
    summary =
      "The session was labelled easy but landed at a high subjective effort. That may reflect pace, terrain, fatigue, conditions, or incomplete recovery.";
    nextAction =
      "Do not compensate by forcing the next quality session. Reassess after recovery data and the first ten minutes of the warm-up.";
    tone = "watch";
  } else if (cutShort) {
    title = "Reduced dose recorded";
    summary =
      "The completed work landed materially below the prescribed dose or was explicitly cut short. The useful work still counts; the missing volume does not become automatic debt.";
    nextAction =
      "Keep the next session in its planned place unless the reason for cutting this one short is still present. Do not make up the missing work by default.";
    tone = "watch";
  } else if (highCost) {
    title = "High-cost session";
    summary =
      "The work was completed, but the subjective response says it required a large recovery payment. Treat the result and the cost as separate facts.";
    nextAction =
      "Protect the next hard or lower-body session until recovery and the warm-up both support it.";
    tone = "watch";
  } else if (extraVolume) {
    title = "Extra volume added";
    summary =
      "The completed dose materially exceeded the prescription. That can be useful, but it must be counted before the next quality or lower-body exposure.";
    nextAction =
      "Leave the plan unchanged only if recovery remains normal; otherwise reduce the next non-essential volume before touching the key session.";
    tone = "watch";
  } else if (qualityLanded) {
    title = "Quality session landed";
    summary =
      "The key work was completed at a productive subjective cost without an obvious warning flag. That is the response a quality session is meant to create.";
    nextAction =
      "Keep the next planned session unless morning recovery or the warm-up contradicts this read.";
    tone = "positive";
  } else if (log) {
    title = log.sessionFeel === "strong" ? "Session absorbed well" : "Session landed as intended";
    summary =
      garminInsight?.body ??
      "The available athlete feedback does not show a reason to rewrite the plan. The completed dose and subjective cost are now part of the training record.";
    nextAction =
      log.recoveryConcern === "monitor"
        ? "Monitor the next morning response before adding optional volume."
        : "Continue with the plan unless recovery or performance provides a reason to change it.";
    tone = "positive";
  }

  const metrics: SessionReviewMetric[] = [
    {
      label: "Actual / planned",
      value: `${formatDurationMinutes(actualDurationMinutes)} / ${formatDurationMinutes(
        plannedDurationMinutes,
      )}`,
    },
  ];

  if (log) {
    metrics.push({ label: "RPE", value: `${log.rpe}/10` });
  }

  if (subjectiveLoad !== null) {
    metrics.push({ label: "Session load", value: `${subjectiveLoad} AU` });
  }

  if (activity?.distanceMeters != null) {
    metrics.push({
      label: "Distance",
      value: `${(activity.distanceMeters / 1_000).toFixed(2)} km`,
    });
  }

  if (activity?.averagePaceSecondsPerKm != null) {
    metrics.push({
      label: "Average pace",
      value: formatPace(activity.averagePaceSecondsPerKm),
    });
  }

  if (activity?.averageHeartRateBpm != null) {
    metrics.push({
      label: "Average HR",
      value: `${Math.round(activity.averageHeartRateBpm)} bpm`,
    });
  }

  if (activity?.elevationGainMeters != null) {
    metrics.push({
      label: "Climb",
      value: `${Math.round(activity.elevationGainMeters)} m`,
    });
  }

  const observations: string[] = [];

  if (comparison) {
    comparison.observations
      .filter((observation) => !observation.startsWith("Add subjective RPE"))
      .slice(0, 3)
      .forEach((observation) => pushUnique(observations, observation));
  } else if (durationRatio !== null) {
    const difference = Math.round((durationRatio - 1) * 100);
    pushUnique(
      observations,
      Math.abs(difference) <= 10
        ? "Completed duration was close to the prescribed dose."
        : `Completed duration was ${Math.abs(difference)}% ${
            difference > 0 ? "above" : "below"
          } the prescription.`,
    );
  }

  if (log) {
    pushUnique(
      observations,
      `${executionLabel(log.execution) ?? "Completion logged"} · ${
        outcomeLabel(log.sessionFeel) ?? `RPE ${log.rpe}`
      }.`,
    );
    pushUnique(
      observations,
      recoveryLabel(log.recoveryConcern)
        ? `Athlete recovery flag: ${recoveryLabel(log.recoveryConcern)?.toLowerCase()}.`
        : null,
    );
  }

  if (limiter) {
    pushUnique(observations, `Primary limiter: ${limiter}.`);
  }

  if (log?.score ?? log?.result) {
    pushUnique(observations, `Headline result: ${log.score ?? log.result}.`);
  }

  if (blocks.total > 0) {
    pushUnique(
      observations,
      `${blocks.done} of ${blocks.total} blocks completed${
        blocks.skipped > 0 ? `; ${blocks.skipped} skipped` : ""
      }.`,
    );
  }

  if (observations.length === 0) {
    observations.push(
      needsAthleteFeedback
        ? "Objective completion exists, but subjective response is missing."
        : "The session is recorded with limited comparable detail.",
    );
  }

  const sourceLabel = activity
    ? log
      ? "Garmin + athlete log"
      : "Garmin only"
    : log
      ? "Athlete log"
      : "Completion marker";
  const confidence = activity && log
    ? "High · objective and subjective data"
    : activity || log
      ? "Medium · one evidence stream"
      : "Low · completion only";

  return {
    title,
    summary,
    nextAction,
    confidence,
    sourceLabel,
    tone,
    needsAthleteFeedback,
    metrics: metrics.slice(0, 7),
    observations,
  };
}
