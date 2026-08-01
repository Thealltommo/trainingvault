import { describe, expect, it } from "vitest";
import { buildSessionReview } from "@/lib/session-review";
import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import type { SessionLog, Workout } from "@/lib/types";

const workout: Workout = {
  id: "threshold-builder",
  title: "Threshold builder",
  category: "track",
  durationMinutes: 52,
  minimumMinutes: 32,
  intensity: "hard",
  sessionType: "run",
  date: "2026-08-01",
  prescribedLoadsOrPace: "3 x 8 min threshold / 2 min easy",
  targetStimulus: "Raise sustainable speed.",
  focus: ["threshold"],
  equipment: [],
  blocks: [],
};

const activity: NormalizedGarminActivity = {
  activityId: "123",
  activityType: "running",
  title: "Threshold builder",
  startTime: "2026-08-01T05:10:00Z",
  localStartTime: "2026-08-01T06:10:00+01:00",
  durationSeconds: 3_120,
  movingDurationSeconds: 3_100,
  distanceMeters: 9_200,
  averageSpeedMps: 2.95,
  averagePaceSecondsPerKm: 339,
  averageHeartRateBpm: 158,
  maxHeartRateBpm: 177,
  averageCadenceSpm: 174,
  elevationGainMeters: 42,
  elevationLossMeters: 40,
  calories: 690,
  aerobicTrainingEffect: 3.8,
  anaerobicTrainingEffect: 0.5,
  garminWorkoutId: "456",
  laps: [],
};

function log(overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id: "log-1",
    workoutId: workout.id,
    workoutTitle: workout.title,
    workoutCategory: workout.category,
    workoutSessionType: workout.sessionType,
    workoutDate: workout.date,
    completedAt: "2026-08-01T06:05:00Z",
    rpe: 8,
    actualDurationMinutes: 52,
    execution: "as_planned",
    sessionFeel: "controlled",
    recoveryConcern: "none",
    ...overrides,
  };
}

describe("completed session review", () => {
  it("asks for athlete feedback when Garmin is the only evidence", () => {
    const review = buildSessionReview({ workout, activity });

    expect(review.title).toBe("Garmin confirms the work");
    expect(review.needsAthleteFeedback).toBe(true);
    expect(review.sourceLabel).toBe("Garmin only");
  });

  it("recognises a controlled quality session", () => {
    const review = buildSessionReview({
      workout,
      activity,
      log: log(),
    });

    expect(review.title).toBe("Quality session landed");
    expect(review.tone).toBe("positive");
    expect(review.nextAction).toContain("Keep the next planned session");
    expect(review.metrics).toEqual(
      expect.arrayContaining([
        { label: "RPE", value: "8/10" },
        { label: "Session load", value: "416 AU" },
      ]),
    );
  });

  it("flags an easy session that cost too much", () => {
    const review = buildSessionReview({
      workout: { ...workout, intensity: "easy" },
      log: log({ rpe: 8, sessionFeel: "struggled" }),
    });

    expect(review.title).toBe("Easy work cost too much");
    expect(review.tone).toBe("watch");
  });

  it("does not turn cut-short volume into automatic debt", () => {
    const review = buildSessionReview({
      workout,
      log: log({
        execution: "cut_short",
        actualDurationMinutes: 28,
        rpe: 7,
      }),
    });

    expect(review.title).toBe("Reduced dose recorded");
    expect(review.nextAction).toContain("Do not make up the missing work");
  });
});
