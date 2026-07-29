import { describe, expect, it } from "vitest";
import {
  computeWeeklyTrainingMetrics,
  generateAthleteInsights,
  type PerformanceObservation,
} from "../../lib/athlete";
import { athleteSession } from "./fixtures";

describe("athlete metrics and insight guards", () => {
  it("does not claim a trend from a tiny sample", () => {
    const one = athleteSession({ includeLog: true });
    const insights = generateAthleteInsights({ sessions: [one] });

    expect(insights[0].kind).toBe("data_quality");
    expect(insights[0].insufficientData).toBe(true);
    expect(insights[0].message).toMatch(/will not claim/i);
  });

  it("calculates planned and actual weekly values from separate prescriptions", () => {
    const session = athleteSession({ includeOverride: true, includeLog: true });
    const metrics = computeWeeklyTrainingMetrics(
      [session],
      "2026-08-03",
    );

    expect(metrics.plannedSessions).toBe(1);
    expect(metrics.completedSessions).toBe(1);
    expect(metrics.plannedMinutes).toBe(45);
    expect(metrics.actualMinutes).toBe(43);
    expect(metrics.adherencePercent).toBe(100);
  });

  it("only emits an interference insight after both comparison groups reach three samples", () => {
    const observations: PerformanceObservation[] = Array.from(
      { length: 6 },
      (_, index) => ({
        id: `obs-${index}`,
        sessionId: `session-${index}`,
        date: `2026-08-0${index + 1}`,
        paceEfficiency: index < 3 ? 106 : 100,
        precededByHighLowerBodyLoad48h: index < 3,
      }),
    );
    const sessions = Array.from({ length: 4 }, (_, index) => {
      const session = athleteSession({ includeLog: true });
      session.id = `session-${index}`;
      return session;
    });
    const insights = generateAthleteInsights({
      sessions,
      observations,
    });

    expect(
      insights.some((item) => item.title === "Possible lower-body interference"),
    ).toBe(true);
  });
});
