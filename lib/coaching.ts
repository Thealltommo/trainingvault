import {
  auditCurrentPlan,
  buildCoachingInsights as buildBaseCoachingInsights,
  buildTrainingMetrics as buildBaseTrainingMetrics,
  buildWeeklyTrend,
  getCurrentProgrammeWeek,
  getGoalCopy,
  isCrossFitStyleWorkout,
  isEasyRun,
  isHillWorkout,
  isIntervalWorkout,
  isLongRun,
  isRunWorkout,
  isThresholdWorkout,
  type CoachingInsight,
  type CoachingTone,
  type PlanAudit,
  type TrainingMetrics,
  type WeeklyTrendPoint,
} from "./coaching-base";
import type { Programme, SessionLog } from "./types";

const RUN_SIGNAL = /\b(run|running|track|5k|10k|mile|threshold|tempo|interval|trail|fell|road|treadmill|race)\b/i;

function completedAtMs(log: SessionLog) {
  return new Date(log.completedAt).getTime();
}

export function isStructuredRunLog(log: SessionLog) {
  const runLike = log.workoutCategory === "track" || RUN_SIGNAL.test(`${log.workoutTitle} ${log.workoutSessionType ?? ""}`);
  const hasMetrics = Boolean(log.distanceKm || log.averagePaceSecondsPerKm || log.elevationM);
  return runLike && hasMetrics;
}

export function buildTrainingMetrics(programme: Programme | null | undefined, logs: SessionLog[], now: number): TrainingMetrics {
  const base = buildBaseTrainingMetrics(programme, logs, now);
  const cutoff28 = (now || Date.now()) - 28 * 86_400_000;
  const runLogsWithMetrics = logs.filter((log) => completedAtMs(log) >= cutoff28 && isStructuredRunLog(log)).length;

  return {
    ...base,
    runLogsWithMetrics,
  };
}

export function buildCoachingInsights(programme: Programme | null | undefined, logs: SessionLog[], now: number): CoachingInsight[] {
  const base = buildBaseCoachingInsights(programme, logs, now);
  const metrics = buildTrainingMetrics(programme, logs, now);
  const withoutRunData = base.filter((insight) => insight.id !== "run-data" && insight.id !== "run-data-good");

  const runDataInsight: CoachingInsight = metrics.runLogsWithMetrics < 2
    ? {
        id: "run-data",
        title: "Unlock better run coaching",
        summary: "Pace, distance and elevation are not yet structured enough for credible trend analysis.",
        action: "Use Quick Log after runs. Distance + duration are enough to start; pace is calculated automatically and elevation/HR are optional.",
        tone: "amber",
        confidence: "high",
      }
    : {
        id: "run-data-good",
        title: "Run data is becoming coachable",
        summary: `${metrics.runLogsWithMetrics} run sessions in the last 28 days include structured pace, distance or elevation data — including standalone Quick Logs.`,
        action: "Keep logging consistently. The useful signal is whether similar RPE produces faster pace, more distance or more elevation over time.",
        tone: "purple",
        confidence: "high",
      };

  return [...withoutRunData.slice(0, 6), runDataInsight].slice(0, 7);
}

export {
  auditCurrentPlan,
  buildWeeklyTrend,
  getCurrentProgrammeWeek,
  getGoalCopy,
  isCrossFitStyleWorkout,
  isEasyRun,
  isHillWorkout,
  isIntervalWorkout,
  isLongRun,
  isRunWorkout,
  isThresholdWorkout,
};

export type {
  CoachingInsight,
  CoachingTone,
  PlanAudit,
  TrainingMetrics,
  WeeklyTrendPoint,
};
