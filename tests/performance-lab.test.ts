import { describe, expect, it } from "vitest";
import {
  buildPerformanceLabSnapshot,
  classifyActivityFamily,
} from "@/lib/performance-lab";
import type { NormalizedGarminActivity } from "@/lib/garmin-storage";
import type { DailyRecoveryRecord } from "@/lib/recovery-storage";
import type { SessionLog } from "@/lib/types";

function activity(
  id: string,
  startTime: string,
  overrides: Partial<NormalizedGarminActivity> = {},
): NormalizedGarminActivity {
  return {
    activityId: id,
    activityType: "running",
    title: `Run ${id}`,
    startTime,
    localStartTime: startTime,
    durationSeconds: 3_000,
    movingDurationSeconds: 2_950,
    distanceMeters: 10_000,
    averageSpeedMps: 3.33,
    averagePaceSecondsPerKm: 300,
    averageHeartRateBpm: 150,
    maxHeartRateBpm: 170,
    averageCadenceSpm: 170,
    elevationGainMeters: 100,
    elevationLossMeters: 100,
    calories: 650,
    aerobicTrainingEffect: 3.5,
    anaerobicTrainingEffect: 0.4,
    garminWorkoutId: null,
    laps: null,
    ...overrides,
  };
}

function recovery(date: string): DailyRecoveryRecord {
  return {
    date,
    source: "garmin",
    sleepHours: 7.5,
    sleepScore: 82,
    hrvMs: 52,
    hrvBaselineMs: 50,
    restingHeartRate: 48,
    restingHeartRateBaseline: 49,
    garminReadiness: 74,
    recentLoad7d: 500,
    baselineLoad7d: 450,
    lowerBodyLoad48h: null,
    runningLoad7d: null,
    highIntensitySessions72h: null,
    soreness: null,
    subjectiveReadiness: null,
    daysSinceRest: null,
    stressAverage: 24,
    bodyBattery: 78,
    manualOverride: null,
    manualOverrideReason: null,
    garminSyncedAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  };
}

function log(completedAt: string): SessionLog {
  return {
    id: completedAt,
    workoutId: `session-${completedAt}`,
    workoutTitle: "Strength",
    workoutCategory: "strength",
    completedAt,
    rpe: 7,
    actualDurationMinutes: 60,
  };
}

describe("classifyActivityFamily", () => {
  it("uses both Garmin type and title to preserve useful activity families", () => {
    expect(classifyActivityFamily(activity("run", "2026-07-28T07:00:00.000Z"))).toBe("run");
    expect(
      classifyActivityFamily(
        activity("trail", "2026-07-28T07:00:00.000Z", {
          activityType: "cardio",
          title: "Trail run around Helvellyn",
        }),
      ),
    ).toBe("run");
    expect(
      classifyActivityFamily(
        activity("lift", "2026-07-28T07:00:00.000Z", {
          activityType: "strength_training",
          title: "Hawkeye",
        }),
      ),
    ).toBe("strength");
    expect(
      classifyActivityFamily(
        activity("ride", "2026-07-28T07:00:00.000Z", {
          activityType: "cycling",
        }),
      ),
    ).toBe("cycle");
  });
});

describe("buildPerformanceLabSnapshot", () => {
  it("summarises recent running volume, terrain, all-training time and recovery", () => {
    const snapshot = buildPerformanceLabSnapshot(
      [
        activity("one", "2026-07-28T07:00:00.000Z"),
        activity("two", "2026-07-22T07:00:00.000Z", {
          distanceMeters: 5_000,
          durationSeconds: 1_500,
          elevationGainMeters: 50,
        }),
        activity("three", "2026-07-15T07:00:00.000Z", {
          distanceMeters: 8_000,
          durationSeconds: 2_400,
          elevationGainMeters: 240,
        }),
      ],
      [recovery("2026-07-28"), recovery("2026-07-27")],
      [log("2026-07-27T18:00:00.000Z")],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(snapshot.activities28d).toBe(3);
    expect(snapshot.runningActivities28d).toBe(3);
    expect(snapshot.runningDistanceKm28d).toBe(23);
    expect(snapshot.elevationGainM28d).toBe(390);
    expect(snapshot.runningHours28d).toBe(1.9);
    expect(snapshot.totalHours28d).toBe(1.9);
    expect(snapshot.averagePaceSecondsPerKm).toBe(300);
    expect(snapshot.averageHeartRateBpm).toBe(150);
    expect(snapshot.averageCadenceSpm).toBe(170);
    expect(snapshot.averageAerobicTrainingEffect).toBe(3.5);
    expect(snapshot.recoveryDays14d).toBe(2);
    expect(snapshot.latestRecovery?.date).toBe("2026-07-28");
    expect(snapshot.manualSessions28d).toBe(1);
    expect(snapshot.activityFamilies[0]).toMatchObject({
      family: "run",
      sessions: 3,
      distanceKm: 23,
    });
    expect(snapshot.categories[0]).toMatchObject({
      category: "strength",
      sessions: 1,
      minutes: 60,
    });
  });

  it("keeps non-running Garmin activities out of mileage while retaining their time", () => {
    const snapshot = buildPerformanceLabSnapshot(
      [
        activity("run", "2026-07-28T07:00:00.000Z"),
        activity("ride", "2026-07-27T07:00:00.000Z", {
          activityType: "cycling",
          title: "Bike",
          durationSeconds: 7_200,
          distanceMeters: 40_000,
          elevationGainMeters: 800,
        }),
      ],
      [],
      [],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(snapshot.activities28d).toBe(2);
    expect(snapshot.runningActivities28d).toBe(1);
    expect(snapshot.runningDistanceKm28d).toBe(10);
    expect(snapshot.elevationGainM28d).toBe(100);
    expect(snapshot.totalHours28d).toBe(2.8);
    expect(snapshot.activityFamilies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "cycle", minutes: 120 }),
        expect.objectContaining({ family: "run", minutes: 50 }),
      ]),
    );
  });

  it("produces a useful hybrid brief when training exists but running does not", () => {
    const snapshot = buildPerformanceLabSnapshot(
      [
        activity("strength", "2026-07-28T07:00:00.000Z", {
          activityType: "strength_training",
          title: "Strength",
          durationSeconds: 3_600,
          distanceMeters: null,
          averageSpeedMps: null,
          averagePaceSecondsPerKm: null,
          elevationGainMeters: null,
        }),
        activity("cardio", "2026-07-27T07:00:00.000Z", {
          activityType: "cardio",
          title: "Cardio",
          durationSeconds: 2_400,
          distanceMeters: null,
          averageSpeedMps: null,
          averagePaceSecondsPerKm: null,
          elevationGainMeters: null,
        }),
        activity("lift-two", "2026-07-25T07:00:00.000Z", {
          activityType: "strength_training",
          title: "Hawkeye",
          durationSeconds: 3_000,
          distanceMeters: null,
          averageSpeedMps: null,
          averagePaceSecondsPerKm: null,
          elevationGainMeters: null,
        }),
      ],
      [recovery("2026-07-28")],
      [],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(snapshot.runningActivities28d).toBe(0);
    expect(snapshot.totalHours28d).toBe(2.5);
    expect(snapshot.coachBrief.title).toContain("running evidence is not");
    expect(snapshot.coachBrief.evidence).toContain("3 Garmin activities");
    expect(snapshot.coverage.timedActivities).toBe(3);
  });
});
