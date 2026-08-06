import { describe, expect, it } from "vitest";
import type {
  AnalysisSample,
  AnalysisSplit,
} from "@/lib/run-activity-analysis";
import type { StructuredRunningWorkout } from "@/lib/garmin";
import {
  boundedBestEffort,
  buildBestEfforts,
  buildIntervalIntelligence,
  buildRacePredictions,
  classifyRunRole,
  estimateStructuredDistance,
  findComparableRuns,
} from "@/lib/v4-intelligence";

function samples(
  distanceMeters = 7_500,
  paceSecondsPerKm = 300,
): AnalysisSample[] {
  const points: AnalysisSample[] = [];
  const step = 100;

  for (let distance = 0; distance <= distanceMeters; distance += step) {
    const elapsedSeconds = (distance / 1_000) * paceSecondsPerKm;
    points.push({
      elapsedSeconds,
      movingSeconds: elapsedSeconds,
      distanceMeters: distance,
      paceSecondsPerKm,
      heartRateBpm: 140 + Math.round(distance / 1_000),
      cadenceSpm: 174,
      elevationMeters: 50,
      gradePercent: 0,
      temperatureC: 17,
    });
  }

  return points;
}

const structured: StructuredRunningWorkout = {
  id: "rhythm",
  name: "5K rhythm intervals",
  date: "2026-08-06",
  estimatedDurationSeconds: 2_520,
  steps: [
    {
      kind: "step",
      phase: "warmup",
      duration: { type: "time", seconds: 600 },
      target: {
        type: "pace",
        fastestSecondsPerKm: 360,
        slowestSecondsPerKm: 390,
      },
    },
    {
      kind: "repeat",
      repetitions: 3,
      steps: [
        {
          kind: "step",
          phase: "work",
          duration: { type: "time", seconds: 180 },
          target: {
            type: "pace",
            fastestSecondsPerKm: 275,
            slowestSecondsPerKm: 290,
          },
        },
        {
          kind: "step",
          phase: "recovery",
          duration: { type: "time", seconds: 120 },
          target: { type: "open" },
        },
      ],
    },
    {
      kind: "step",
      phase: "cooldown",
      duration: { type: "time", seconds: 600 },
      target: {
        type: "pace",
        fastestSecondsPerKm: 360,
        slowestSecondsPerKm: 420,
      },
    },
  ],
};

function split(
  index: number,
  type: string,
  pace: number,
  heartRate: number,
): AnalysisSplit {
  return {
    splitIndex: index,
    splitType: type,
    durationSeconds: type === "work" ? 180 : 120,
    movingDurationSeconds: type === "work" ? 180 : 120,
    distanceMeters: type === "work" ? (180 / pace) * 1_000 : 200,
    averagePaceSecondsPerKm: pace,
    averageHeartRateBpm: heartRate,
    maxHeartRateBpm: heartRate + 8,
    averageCadenceSpm: type === "work" ? 176 : 150,
    elevationGainMeters: 0,
    elevationLossMeters: 0,
    calories: 40,
  };
}

describe("V4 athlete intelligence", () => {
  it("never invents a one-second best effort beyond the recorded finish", () => {
    const trace = samples(7_500, 300);

    expect(boundedBestEffort(trace, 1_000)).toBeCloseTo(300, 5);
    expect(boundedBestEffort(trace, 5_000)).toBeCloseTo(1_500, 5);
    expect(boundedBestEffort(trace, 10_000)).toBeNull();

    const efforts = buildBestEfforts(trace);
    expect(efforts.find((effort) => effort.key === "1k")?.durationSeconds).toBeCloseTo(300, 5);
    expect(efforts.find((effort) => effort.key === "5k")?.durationSeconds).toBeCloseTo(1_500, 5);
    expect(efforts.find((effort) => effort.key === "10k")?.durationSeconds).toBeNull();
  });

  it("scores repeatability and target execution from aligned Garmin intervals", () => {
    const splits: AnalysisSplit[] = [
      split(1, "warmup", 375, 132),
      split(2, "work", 286, 158),
      split(3, "recovery", 650, 143),
      split(4, "work", 282, 162),
      split(5, "recovery", 670, 145),
      split(6, "work", 284, 165),
      split(7, "recovery", 660, 146),
      split(8, "cooldown", 390, 142),
    ];

    const result = buildIntervalIntelligence(splits, structured);

    expect(result).not.toBeNull();
    expect(result?.workCount).toBe(3);
    expect(result?.targetCount).toBe(3);
    expect(result?.onTargetCount).toBe(3);
    expect(result?.averageWorkPaceSecondsPerKm).toBeCloseTo(284, 1);
    expect(result?.paceVariationPercent).toBeLessThan(1);
    expect(result?.verdict).toContain("Excellent repeatability");
  });

  it("builds honest provisional race ranges from a valid continuous effort", () => {
    const efforts = buildBestEfforts(samples(10_000, 300));
    const predictions = buildRacePredictions(efforts);
    const fiveK = predictions.find((prediction) => prediction.distance === "5K");
    const tenK = predictions.find((prediction) => prediction.distance === "10K");

    expect(fiveK?.midpointSeconds).toBeCloseTo(1_500, 0);
    expect(tenK?.midpointSeconds).toBeCloseTo(3_000, 0);
    expect(fiveK?.confidence).toBe("medium");
  });

  it("classifies plan intent and estimates only structurally supported distance", () => {
    expect(classifyRunRole("Carlisle - 5K rhythm intervals", structured)).toBe("intervals");
    expect(classifyRunRole("Long aerobic run", null)).toBe("long");

    const estimate = estimateStructuredDistance(structured);
    expect(estimate).not.toBeNull();
    expect(estimate ?? 0).toBeGreaterThan(4_500);
    expect(estimate ?? 0).toBeLessThan(7_500);
  });

  it("matches comparable running activities while excluding unrelated sports", () => {
    const current = {
      activityId: "current",
      activityType: "running",
      title: "Carlisle - 5K rhythm intervals",
      startTime: "2026-08-06T09:00:00Z",
      localStartTime: "2026-08-06T10:00:00+01:00",
      durationSeconds: 2_520,
      movingDurationSeconds: 2_516,
      distanceMeters: 7_540,
      averageSpeedMps: 2.99,
      averagePaceSecondsPerKm: 334,
      averageHeartRateBpm: 145,
      maxHeartRateBpm: 171,
      averageCadenceSpm: 154,
      elevationGainMeters: 40,
      elevationLossMeters: 39,
      calories: 508,
      aerobicTrainingEffect: 3.5,
      anaerobicTrainingEffect: 1.2,
      garminWorkoutId: null,
    };
    const matches = findComparableRuns(current, [
      current,
      {
        ...current,
        activityId: "similar",
        title: "Morning Run",
        startTime: "2026-07-30T09:00:00Z",
        distanceMeters: 7_400,
        averagePaceSecondsPerKm: 340,
      },
      {
        ...current,
        activityId: "bike",
        activityType: "cycling",
        distanceMeters: 7_500,
      },
      {
        ...current,
        activityId: "too-short",
        distanceMeters: 3_000,
      },
    ]);

    expect(matches.map((match) => match.activityId)).toEqual(["similar"]);
  });
});
