import { describe, expect, it } from "vitest";
import {
  buildStructuredRunningWorkout,
  describeStructuredRunningWorkout,
  parsePaceSecondsPerKm,
} from "@/lib/structured-running";
import { toGarminRunningWorkoutRequest } from "@/lib/garmin/workout-converter";

describe("structured running prescriptions", () => {
  it("parses bounded pace values", () => {
    expect(parsePaceSecondsPerKm("3:58")).toBe(238);
    expect(parsePaceSecondsPerKm("4:03")).toBe(243);
    expect(parsePaceSecondsPerKm("fast")).toBeNull();
    expect(parsePaceSecondsPerKm("1:59")).toBeNull();
  });

  it("builds the Sunday easy-run acceptance shape", () => {
    const workout = buildStructuredRunningWorkout({
      id: "sunday-run",
      name: "Sunday easy run",
      date: "2026-08-02",
      mode: "continuous",
      warmupMinutes: 10,
      continuousMinutes: 30,
      cooldownMinutes: 5,
      repetitions: 0,
      workDistanceMeters: 0,
      recoverySeconds: 0,
      fastestPace: "5:30",
      slowestPace: "6:00",
      description: "Easy aerobic development.",
    });

    expect(workout.steps).toHaveLength(3);
    expect(workout.estimatedDurationSeconds).toBe(2_700);
    expect(describeStructuredRunningWorkout(workout)).toContain(
      "work: 30 min @ 5:30/km–6:00/km",
    );
    expect(toGarminRunningWorkoutRequest(workout).steps).toEqual(workout.steps);
  });

  it("builds explicit 6 x 800 m work and recovery steps", () => {
    const workout = buildStructuredRunningWorkout({
      id: "threshold",
      name: "6 x 800 m",
      date: "2026-08-04",
      mode: "intervals",
      warmupMinutes: 15,
      continuousMinutes: 0,
      cooldownMinutes: 10,
      repetitions: 6,
      workDistanceMeters: 800,
      recoverySeconds: 120,
      fastestPace: "3:58",
      slowestPace: "4:03",
      description: "Threshold development.",
    });
    const repeat = workout.steps[1];

    expect(repeat).toMatchObject({
      kind: "repeat",
      repetitions: 6,
      steps: [
        {
          phase: "work",
          duration: { type: "distance", meters: 800 },
          target: {
            type: "pace",
            fastestSecondsPerKm: 238,
            slowestSecondsPerKm: 243,
          },
        },
        {
          phase: "recovery",
          duration: { type: "time", seconds: 120 },
        },
      ],
    });
    expect(() => toGarminRunningWorkoutRequest(workout)).not.toThrow();
  });
});

