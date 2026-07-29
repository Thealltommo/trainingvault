import { describe, expect, it } from "vitest";
import {
  buildPerformanceLabV2Snapshot,
  classifyGarminActivity,
} from "@/lib/performance-lab-v2";
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

function recovery(
  date: string,
  overrides: Partial<DailyRecoveryRecord> = {},
): DailyRecoveryRecord {
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
    ...overrides,
  };
}

function log(completedAt: string): SessionLog {
  return {
    id: completedAt,
    workoutId: `session-${completedAt}`,
    workoutTitle: "Hawkeye",
    workoutCategory: "hybrid",
    workoutSessionType: "crossfit",
    completedAt,
    rpe: 8,
    actualDurationMinutes: 60,
  };
}

describe("Performance Lab v2", () => {
  it("recognises Garmin run variants and leaves strength/cardio out of run totals", () => {
    expect(
      classifyGarminActivity(
        activity("trail", "2026-07-28T07:00:00Z", {
          activityType: "trail_running",
          title: "Helvellyn fell run",
        }),
      ),
    ).toBe("trail");
    expect(
      classifyGarminActivity(
        activity("treadmill", "2026-07-28T07:00:00Z", {
          activityType: "treadmill_running",
        }),
      ),
    ).toBe("run");
    expect(
      classifyGarminActivity(
        activity("strength", "2026-07-28T07:00:00Z", {
          activityType: "strength_training",
          title: "Strength",
          distanceMeters: 0,
        }),
      ),
    ).toBe("strength");
  });

  it("builds run, recovery, activity-family and hybrid evidence without double-counting manual logs into Garmin volume", () => {
    const snapshot = buildPerformanceLabV2Snapshot(
      [
        activity("one", "2026-07-28T07:00:00.000Z"),
        activity("two", "2026-07-22T07:00:00.000Z", {
          activityType: "trail_running",
          title: "Trail run",
          distanceMeters: 5_000,
          durationSeconds: 1_800,
          movingDurationSeconds: 1_760,
          elevationGainMeters: 300,
        }),
        activity("strength", "2026-07-27T18:00:00.000Z", {
          activityType: "strength_training",
          title: "Strength",
          distanceMeters: 0,
          durationSeconds: 3_600,
          movingDurationSeconds: 3_600,
          elevationGainMeters: 0,
          averagePaceSecondsPerKm: null,
        }),
      ],
      [
        recovery("2026-07-28"),
        recovery("2026-07-27", { hrvMs: 50, restingHeartRate: 49 }),
        recovery("2026-07-26", { hrvMs: 48, restingHeartRate: 50 }),
      ],
      [log("2026-07-27T18:00:00.000Z")],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(snapshot.source.activities28d).toBe(3);
    expect(snapshot.run.activities28d).toBe(2);
    expect(snapshot.run.distanceKm28d).toBe(15);
    expect(snapshot.run.elevationGainM28d).toBe(400);
    expect(snapshot.run.longestRunDistanceKm).toBe(10);
    expect(snapshot.families.some((family) => family.family === "strength")).toBe(true);
    expect(snapshot.manualCategories[0]).toMatchObject({
      category: "hybrid",
      sessions: 1,
      minutes: 60,
    });
    expect(snapshot.source.recoveryDays14d).toBe(3);
  });

  it("explains a live Garmin bank with no recent run evidence instead of implying sync failure", () => {
    const snapshot = buildPerformanceLabV2Snapshot(
      [
        activity("strength", "2026-07-28T07:00:00.000Z", {
          activityType: "strength_training",
          title: "Strength",
          distanceMeters: 0,
        }),
        activity("cardio", "2026-07-27T07:00:00.000Z", {
          activityType: "cardio",
          title: "Cardio",
          distanceMeters: 0,
        }),
      ],
      [],
      [],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(snapshot.source.activities28d).toBe(2);
    expect(snapshot.run.activities28d).toBe(0);
    expect(snapshot.signals[0]?.title).toContain("Garmin is live");
  });
});
