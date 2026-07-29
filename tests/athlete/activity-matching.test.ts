import { describe, expect, it } from "vitest";
import {
  analysePlannedVsActual,
  matchActivityToSession,
  rankActivityMatches,
  type NormalizedActivityRecord,
} from "../../lib/athlete";
import { athleteSession } from "./fixtures";

function activity(
  overrides: Partial<NormalizedActivityRecord> = {},
): NormalizedActivityRecord {
  return {
    id: "activity-1",
    source: "garmin",
    sourceActivityId: "garmin-activity-1",
    type: "running",
    startTime: "2026-08-03T07:00:00.000Z",
    durationSeconds: 3_600,
    distanceMeters: 10_000,
    averagePaceSecondsPerKm: 360,
    ...overrides,
  };
}

describe("activity matching", () => {
  it("auto-links an exact Garmin workout ID", () => {
    const session = athleteSession();
    const match = matchActivityToSession(
      session,
      activity({ garminWorkoutId: "garmin-workout-1" }),
    );

    expect(match.confidence).toBe("high");
    expect(match.shouldAutoLink).toBe(true);
    expect(match.score).toBeGreaterThanOrEqual(0.96);
  });

  it("requires confirmation when two activities are similarly plausible", () => {
    const session = athleteSession();
    const matches = rankActivityMatches(session, [
      activity({ id: "a", sourceActivityId: "a" }),
      activity({
        id: "b",
        sourceActivityId: "b",
        startTime: "2026-08-03T08:00:00.000Z",
      }),
    ]);

    expect(matches[0].ambiguous).toBe(true);
    expect(matches[0].shouldAutoLink).toBe(false);
  });

  it("compares only fields available on both plan and activity", () => {
    const session = athleteSession();
    session.currentPrescription.targets.distanceMeters = 10_000;
    session.currentPrescription.targets.paceSecondsPerKm = 365;
    const comparison = analysePlannedVsActual(
      session,
      activity({
        durationSeconds: 3_720,
        distanceMeters: 9_800,
        averagePaceSecondsPerKm: 370,
      }),
    );

    expect(comparison.distanceDeltaMeters).toBe(-200);
    expect(comparison.paceDeltaSecondsPerKm).toBe(5);
    expect(comparison.adherence).toBe("on_target");
  });
});
