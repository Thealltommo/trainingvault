import assert from "node:assert/strict";
import test from "node:test";

import { matchGarminActivity } from "../activity-matcher.ts";

function activity(overrides = {}) {
  return {
    activityId: "a-1",
    activityType: "running",
    title: "Sunday easy",
    startTime: "2026-08-02T08:05:00Z",
    localStartTime: "2026-08-02T09:05:00",
    durationSeconds: 2_980,
    movingDurationSeconds: 2_940,
    distanceMeters: 10_050,
    averageSpeedMps: 3.37,
    averagePaceSecondsPerKm: 296.7,
    averageHeartRateBpm: 143,
    maxHeartRateBpm: 158,
    averageCadenceSpm: 176,
    elevationGainMeters: 88,
    elevationLossMeters: 86,
    calories: 640,
    aerobicTrainingEffect: 3.1,
    anaerobicTrainingEffect: 0,
    garminWorkoutId: "g-777",
    ...overrides,
  };
}

test("auto-matches exact Garmin workout id with supporting date evidence", () => {
  const result = matchGarminActivity(activity(), [
    {
      sessionId: "planned-1",
      title: "Sunday easy",
      date: "2026-08-02",
      plannedDistanceMeters: 10_000,
      plannedDurationSeconds: 3_000,
      garminWorkoutId: "g-777",
    },
  ]);

  assert.equal(result.kind, "matched");
  assert.equal(result.confidence, "high");
  assert.equal(result.candidate.sessionId, "planned-1");
  assert.ok(result.candidate.reasons.includes("garmin_workout_id"));
});

test("auto-matches same-day distance and duration when the lead is clear", () => {
  const result = matchGarminActivity(activity({ garminWorkoutId: null }), [
    {
      sessionId: "planned-1",
      title: "Sunday easy",
      date: "2026-08-02",
      plannedDistanceMeters: 10_000,
      plannedDurationSeconds: 3_000,
    },
    {
      sessionId: "planned-2",
      title: "Monday recovery",
      date: "2026-08-03",
      plannedDistanceMeters: 5_000,
      plannedDurationSeconds: 1_800,
    },
  ]);

  assert.equal(result.kind, "matched");
  assert.equal(result.candidate.sessionId, "planned-1");
});

test("returns ambiguous candidates instead of guessing", () => {
  const result = matchGarminActivity(
    activity({
      garminWorkoutId: null,
      distanceMeters: null,
      durationSeconds: null,
    }),
    [
      {
        sessionId: "planned-1",
        title: "AM run",
        date: "2026-08-02",
      },
      {
        sessionId: "planned-2",
        title: "PM run",
        date: "2026-08-02",
      },
    ],
  );

  assert.equal(result.kind, "ambiguous");
  assert.equal(result.candidate.score, 30);
  assert.equal(result.alternatives.length, 1);
});

test("does not match non-running activities", () => {
  const result = matchGarminActivity(activity({ activityType: "cycling" }), [
    {
      sessionId: "planned-1",
      title: "Sunday easy",
      date: "2026-08-02",
      garminWorkoutId: "g-777",
    },
  ]);

  assert.deepEqual(result, {
    kind: "none",
    confidence: "low",
    candidate: null,
    alternatives: [],
  });
});
