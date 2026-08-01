import { describe, expect, it } from "vitest";
import { matchGarminActivity } from "../lib/garmin/activity-matcher";
import type { GarminActivity, PlannedRunningSession } from "../lib/garmin/types";

function activity(overrides: Partial<GarminActivity> = {}): GarminActivity {
  return {
    activityId: "1728631568",
    activityType: "treadmill_running",
    title: "Threshold builder",
    startTime: "2026-08-01T04:24:00.000Z",
    localStartTime: "2026-08-01T05:24:00",
    durationSeconds: 2_640,
    movingDurationSeconds: 2_582,
    distanceMeters: 7_980,
    averageSpeedMps: 3.02,
    averagePaceSecondsPerKm: 331,
    averageHeartRateBpm: 155,
    maxHeartRateBpm: 177,
    averageCadenceSpm: 154,
    elevationGainMeters: 0,
    elevationLossMeters: 0,
    calories: 498,
    aerobicTrainingEffect: 3.6,
    anaerobicTrainingEffect: 0.1,
    garminWorkoutId: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<PlannedRunningSession> = {},
): PlannedRunningSession {
  return {
    sessionId: "threshold-builder-2026-08-01",
    title: "Threshold builder",
    date: "2026-08-01",
    plannedStartTime: null,
    plannedDistanceMeters: null,
    plannedDurationSeconds: 3_120,
    garminWorkoutId: "1648338667",
    ...overrides,
  };
}

describe("Garmin activity title matching", () => {
  it("auto-links a same-day treadmill workout when Garmin omits the workout id", () => {
    const result = matchGarminActivity(activity(), [session()]);

    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.candidate.sessionId).toBe("threshold-builder-2026-08-01");
      expect(result.candidate.score).toBeGreaterThanOrEqual(65);
    }
  });

  it("does not allow a title match to bridge unrelated dates", () => {
    const result = matchGarminActivity(activity(), [
      session({ date: "2026-08-05" }),
    ]);

    expect(result.kind).toBe("none");
  });

  it("keeps two same-day identical titles ambiguous", () => {
    const result = matchGarminActivity(activity(), [
      session({ sessionId: "first" }),
      session({ sessionId: "second" }),
    ]);

    expect(result.kind).toBe("ambiguous");
  });
});
