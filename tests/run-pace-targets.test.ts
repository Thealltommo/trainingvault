import { describe, expect, it } from "vitest";
import { applyDerivedPaceTargets, deriveRunPaceBand } from "@/lib/run-pace-targets";
import type { StructuredRunningWorkout } from "@/lib/garmin/types";

describe("run pace targets", () => {
  it("derives the current threshold band from a 22:19 5K baseline", () => {
    const target = deriveRunPaceBand("Threshold builder", "22:19");
    expect(target).toMatchObject({
      fastestSecondsPerKm: 281,
      slowestSecondsPerKm: 292,
      label: "4:41/km–4:52/km",
    });
  });

  it("hydrates open threshold work steps but leaves recovery open", () => {
    const workout: StructuredRunningWorkout = {
      id: "threshold",
      name: "Threshold builder",
      date: "2026-08-08",
      estimatedDurationSeconds: 3120,
      steps: [
        {
          kind: "step",
          phase: "warmup",
          duration: { type: "time", seconds: 720 },
          target: { type: "open" },
        },
        {
          kind: "repeat",
          repetitions: 3,
          steps: [
            {
              kind: "step",
              phase: "work",
              duration: { type: "time", seconds: 480 },
              target: { type: "open" },
              description: "Controlled threshold",
            },
            {
              kind: "step",
              phase: "recovery",
              duration: { type: "time", seconds: 120 },
              target: { type: "open" },
            },
          ],
        },
      ],
    };

    const hydrated = applyDerivedPaceTargets(workout, "22:19");
    const repeat = hydrated.steps[1];
    expect(repeat.kind).toBe("repeat");
    if (repeat.kind !== "repeat") return;
    expect(repeat.steps[0].target).toEqual({
      type: "pace",
      fastestSecondsPerKm: 281,
      slowestSecondsPerKm: 292,
    });
    expect(repeat.steps[0].description).toContain("4:41/km–4:52/km");
    expect(repeat.steps[1].target).toEqual({ type: "open" });
  });

  it("does not force pace onto terrain-led sessions", () => {
    expect(deriveRunPaceBand("Hill power repeats", "22:19")).toBeNull();
    expect(deriveRunPaceBand("Long trail / fell run", "22:19")).toBeNull();
  });
});
