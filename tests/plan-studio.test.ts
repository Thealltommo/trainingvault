import { describe, expect, it } from "vitest";
import {
  buildPlanStudioSessions,
  buildPlanStudioStructuredWorkout,
} from "@/lib/plan-studio";

describe("Plan Studio", () => {
  it("builds a bounded hybrid-aware block with a month-first reassessment week", () => {
    const sessions = buildPlanStudioSessions({
      goal: "5k",
      startDate: "2026-08-03",
      weeks: 8,
      runDays: [1, 3, 5, 6],
      longRunDay: 6,
      hawkeyeDays: [0, 2],
      currentFiveK: "22:19",
      targetFiveK: "19:59",
    });

    expect(sessions).toHaveLength(48);
    expect(sessions.filter((session) => session.type === "crossfit")).toHaveLength(16);
    expect(sessions.filter((session) => session.type === "run")).toHaveLength(32);
    expect(
      sessions.some(
        (session) =>
          session.week === 5 &&
          session.targetStimulus.includes("first planned reduced-dose reassessment week"),
      ),
    ).toBe(true);
    expect(
      sessions.some(
        (session) => session.week === 4 && session.title.startsWith("Reduced"),
      ),
    ).toBe(false);
    expect(
      sessions.every(
        (session) => session.durationMinutes >= session.minimumMinutes,
      ),
    ).toBe(true);
  });

  it("turns Spartan long days into trail sessions", () => {
    const sessions = buildPlanStudioSessions({
      goal: "spartan",
      startDate: "2026-08-03",
      weeks: 8,
      runDays: [1, 4, 6],
      longRunDay: 6,
      hawkeyeDays: [],
    });

    const longRuns = sessions.filter((session) => session.role === "long");
    expect(longRuns).toHaveLength(8);
    expect(longRuns.every((session) => session.type === "fell-trail")).toBe(true);
  });

  it("never schedules before the selected start or after an optional target date", () => {
    const sessions = buildPlanStudioSessions({
      goal: "10k",
      startDate: "2026-08-06",
      targetDate: "2026-08-20",
      weeks: 8,
      runDays: [0, 2, 4, 6],
      longRunDay: 5,
      hawkeyeDays: [1],
    });

    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.date >= "2026-08-06")).toBe(true);
    expect(sessions.every((session) => session.date <= "2026-08-20")).toBe(true);
    expect(sessions.some((session) => session.role === "long")).toBe(true);
  });

  it("converts generated quality runs into explicit Garmin-safe structure", () => {
    const sessions = buildPlanStudioSessions({
      goal: "5k",
      startDate: "2026-08-03",
      weeks: 8,
      runDays: [1, 3, 6],
      longRunDay: 6,
      hawkeyeDays: [],
    });
    const quality = sessions.find((session) => session.role === "quality");
    expect(quality).toBeTruthy();

    const structured = buildPlanStudioStructuredWorkout("manual-test", quality!);
    expect(structured?.id).toBe("manual-test");
    expect(structured?.date).toBe(quality?.date);
    expect(structured?.steps[0]).toMatchObject({ kind: "step", phase: "warmup" });
    expect(structured?.steps.some((element) => element.kind === "repeat")).toBe(true);
  });
});
