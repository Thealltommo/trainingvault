import { describe, expect, it } from "vitest";
import {
  buildConservativeRunPlan,
  type ConservativeRunPlanInput,
} from "../../lib/athlete";

const input: ConservativeRunPlanInput = {
  startDate: "2026-08-03",
  targetDate: "2026-10-25",
  targetEventType: "fell_race",
  targetDistanceKm: 21,
  targetElevationMeters: 1_200,
  targetTimeSeconds: 7_200,
  runningDaysPerWeek: 4,
  preferredLongRunDay: 0,
  restDays: [5],
  maximumWeeklyTrainingDays: 6,
  currentWeeklyDistanceKm: 32,
  currentWeeklyElevationMeters: 500,
  recentWeeklyDistanceKm: [30, 32, 31, 33],
  recentWeeklyElevationMeters: [420, 500, 480, 510],
  maximumWeeklyDistanceKm: 44,
  trainingAgeYears: 3,
  commitments: [
    {
      dayOfWeek: 2,
      name: "Heavy Hawkeye",
      lowerBodyLoad: "high",
      fixed: true,
    },
  ],
};

describe("conservative run-plan foundation", () => {
  it("tracks distance and elevation while capping normal weekly growth", () => {
    const plan = buildConservativeRunPlan(input);

    expect(plan.weeks.length).toBeGreaterThanOrEqual(8);
    expect(plan.weeks.every((week) => week.targetDistanceKm <= 44)).toBe(true);
    expect(plan.weeks.every((week) => week.targetElevationMeters >= 0)).toBe(true);

    const normalBuildPairs = plan.weeks
      .slice(1)
      .map((week, index) => ({ previous: plan.weeks[index], week }))
      .filter(
        ({ previous, week }) =>
          week.phase !== "recovery" &&
          week.phase !== "taper" &&
          previous.phase !== "recovery",
      );
    normalBuildPairs.forEach(({ previous, week }) => {
      expect(
        week.targetDistanceKm <= previous.targetDistanceKm * 1.071 + 0.11,
      ).toBe(true);
    });
    expect(
      plan.weeks.some(
        (week, index) =>
          week.phase === "recovery" &&
          index > 0 &&
          week.targetDistanceKm < plan.weeks[index - 1].targetDistanceKm,
      ),
    ).toBe(true);
  });

  it("does not put the quality session the day after a known high lower-body commitment", () => {
    const plan = buildConservativeRunPlan(input);
    const qualityFamilies = new Set([
      "threshold",
      "hill_reps",
      "race_specific",
      "fell_trail",
      "strides",
    ]);

    plan.weeks.forEach((week) => {
      week.sessions
        .filter((session) => qualityFamilies.has(session.family))
        .forEach((session) => expect(session.dayOfWeek).not.toBe(3));
    });
  });

  it("records ambitious targets without using them to force load growth", () => {
    const plan = buildConservativeRunPlan(input);

    expect(
      plan.warnings.some((warning) => warning.includes("Target time")),
    ).toBe(true);
    expect(
      plan.guardrails.some((guardrail) =>
        guardrail.includes("Target time never"),
      ),
    ).toBe(true);
  });
});
