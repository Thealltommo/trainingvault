import { describe, expect, it } from "vitest";
import {
  assessDailyReadiness,
  manualDraftToAthleteSession,
  parseManualHawkeyeText,
} from "../../lib/athlete";

describe("manual Hawkeye parser", () => {
  it("parses a deterministic lift and metcon fallback without an AI service", () => {
    const draft = parseManualHawkeyeText(`Back squat 5x5
then
20 min AMRAP
15 wall balls
10 box jumps
5 cleans`);

    expect(draft.category).toBe("crossfit");
    expect(draft.durationMinutes).toBe(20);
    expect(draft.mainLifts[0]?.scheme).toBe("5x5");
    expect(
      draft.movements.some((movement) =>
        movement.name.toLowerCase().includes("wall balls"),
      ),
    ).toBe(true);
    expect(draft.blocks.some((block) => block.type === "conditioning")).toBe(true);
    expect(draft.load.scores.lowerBody).toBeGreaterThanOrEqual(3);
    expect(draft.load.scores.impact).toBeGreaterThanOrEqual(2);

    const session = manualDraftToAthleteSession(draft, {
      date: "2026-08-05",
      sourceId: "hawkeye-2026-08-05",
    });
    expect(session.source.kind).toBe("manual");
    expect(session.currentPrescription.date).toBe("2026-08-05");
    expect(session.status).toBe("planned");
  });
});

describe("readiness rules", () => {
  it("returns a conservative red recommendation when several severe signals agree", () => {
    const assessment = assessDailyReadiness({
      date: "2026-08-05",
      sleepHours: 4.5,
      hrvMs: 32,
      hrvBaselineMs: 52,
      soreness: 9,
      subjectiveReadiness: 2,
      lowerBodyLoad48h: 88,
    });

    expect(assessment.zone).toBe("RED");
    expect(assessment.computedRecommendation).toBe("rest");
    expect(assessment.score).toBeLessThan(30);
    expect(assessment.factors.some((factor) => factor.key === "hrv")).toBe(true);
  });

  it("retains the computed zone while recording an athlete manual override", () => {
    const assessment = assessDailyReadiness({
      date: "2026-08-05",
      sleepHours: 4.5,
      soreness: 9,
      subjectiveReadiness: 2,
      manualOverride: "full",
      manualOverrideReason: "Race day",
    });

    expect(assessment.zone).toBe("RED");
    expect(assessment.recommendation).toBe("full");
    expect(assessment.manualOverrideApplied).toBe(true);
    expect(assessment.manualOverrideReason).toBe("Race day");
  });
});
