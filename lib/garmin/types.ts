export type GarminActivity = {
  activityId: string | null;
  activityType: string | null;
  title: string | null;
  startTime: string | null;
  localStartTime: string | null;
  durationSeconds: number | null;
  movingDurationSeconds: number | null;
  distanceMeters: number | null;
  averageSpeedMps: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  calories: number | null;
  aerobicTrainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
  garminWorkoutId: string | null;
};

export type DailyRecoverySnapshot = {
  date: string;
  restingHeartRateBpm: number | null;
  hrvLastNightMs: number | null;
  hrvWeeklyAverageMs: number | null;
  hrvStatus: string | null;
  sleepScore: number | null;
  sleepDurationSeconds: number | null;
  deepSleepSeconds: number | null;
  remSleepSeconds: number | null;
  averageStressLevel: number | null;
  bodyBatteryCurrent: number | null;
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  trainingReadinessScore: number | null;
  trainingReadinessLevel: string | null;
  trainingReadinessFeedback: string | null;
  partial: boolean;
  unavailableMetrics: string[];
};

export type GarminSyncState =
  | "not_sent"
  | "syncing"
  | "scheduled"
  | "sent_to_device"
  | "error";

export type RunningStepPhase = "warmup" | "work" | "recovery" | "cooldown";

export type RunningStepDuration =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "open" };

export type RunningStepTarget =
  | { type: "open" }
  | {
      type: "pace";
      fastestSecondsPerKm: number;
      slowestSecondsPerKm: number;
    }
  | {
      type: "heart_rate";
      minimumBpm: number;
      maximumBpm: number;
    };

export type StructuredRunningStep = {
  kind: "step";
  phase: RunningStepPhase;
  duration: RunningStepDuration;
  target: RunningStepTarget;
  description?: string;
};

export type StructuredRunningRepeat = {
  kind: "repeat";
  repetitions: number;
  steps: StructuredRunningStep[];
};

export type StructuredRunningElement =
  | StructuredRunningStep
  | StructuredRunningRepeat;

export type StructuredRunningWorkout = {
  id: string;
  name: string;
  date?: string;
  description?: string;
  estimatedDurationSeconds?: number;
  steps: StructuredRunningElement[];
};

export type GarminRunningWorkoutRequest = {
  name: string;
  description?: string;
  estimatedDurationSeconds: number;
  steps: StructuredRunningElement[];
};

export type PlannedRunningSession = {
  sessionId: string;
  title: string;
  date: string;
  plannedStartTime?: string | null;
  plannedDistanceMeters?: number | null;
  plannedDurationSeconds?: number | null;
  garminWorkoutId?: string | null;
};

export type ActivityMatchReason =
  | "garmin_workout_id"
  | "same_date"
  | "adjacent_date"
  | "start_time"
  | "distance"
  | "duration";

export type ActivityMatchCandidate = {
  sessionId: string;
  score: number;
  reasons: ActivityMatchReason[];
};

export type ActivityMatchResult =
  | {
      kind: "matched";
      confidence: "high" | "medium";
      candidate: ActivityMatchCandidate;
      alternatives: ActivityMatchCandidate[];
    }
  | {
      kind: "ambiguous";
      confidence: "low";
      candidate: ActivityMatchCandidate;
      alternatives: ActivityMatchCandidate[];
    }
  | {
      kind: "none";
      confidence: "low";
      candidate: null;
      alternatives: [];
    };
