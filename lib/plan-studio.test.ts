import { describe, expect, it } from "vitest";
import { buildPlanStudioSessions } from "@/lib/plan-studio";

describe("5K Plan Studio", () => {
  it("keeps one interval, one threshold and one long run every build week", () => {
    const sessions = buildPlanStudioSessions({
      goal: "5k",
      startDate: "2026-08-03",
      weeks: 8,
      runDays: [1, 3, 5, 6],
      longRunDay: 6,
      hawkeyeDays: [],
      currentFiveK: "22:19",
      targetFiveK: "19:59",
    });

    for (const week of [1, 2, 3, 4]) {
      const titles = sessions
        .filter((session) => session.week === week)
        .map((session) => session.title);
      expect(titles).toContain("Threshold builder");
      expect(titles).toContain("5K rhythm intervals");
      expect(titles).toContain("Long aerobic run");
    }
  });

  it("does not force a reduced week before four full build weeks", () => {
    const sessions = buildPlanStudioSessions({
      goal: "5k",
      startDate: "2026-08-03",
      weeks: 8,
      runDays: [1, 3, 5, 6],
      longRunDay: 6,
      hawkeyeDays: [],
    });

    const weekFourTitles = sessions
      .filter((session) => session.week === 4)
      .map((session) => session.title);
    expect(weekFourTitles.some((title) => title.startsWith("Reduced"))).toBe(false);

    const weekFiveTitles = sessions
      .filter((session) => session.week === 5)
      .map((session) => session.title);
    expect(weekFiveTitles).toContain("Reduced threshold builder");
    expect(weekFiveTitles).toContain("Reduced 5K rhythm intervals");
    expect(weekFiveTitles).toContain("Reduced long aerobic run");
  });
});
