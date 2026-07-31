import { describe, expect, it } from "vitest";
import { sanitizeCoachDecision } from "@/lib/coach";
import type { CoachDecision, CoachRequest } from "@/lib/coach-schema";

function request(mode: CoachRequest["mode"]): CoachRequest {
  return {
    mode,
    message: "Change my plan",
    context: {
      today: "2026-08-03",
      readiness: {
        zone: "green",
        score: 78,
        factors: ["Sleep supports training"],
        athleteOverride: false,
      },
      sessions: [
        {
          id: "run-1",
          title: "Easy aerobic run",
          date: "2026-08-04",
          type: "run",
          status: "planned",
          variant: "full",
          durationMinutes: 45,
          intensity: "easy",
          targetStimulus: "Aerobic volume",
          lowerBodySignal: true,
        },
        {
          id: "strength-1",
          title: "Strength",
          date: "2026-08-05",
          type: "strength",
          status: "planned",
          variant: "full",
          durationMinutes: 60,
          intensity: "moderate",
          targetStimulus: "Strength",
          lowerBodySignal: true,
        },
      ],
      recentLogs: [],
      recentActivities: [],
      upcomingEvents: [],
    },
  };
}

function decision(): CoachDecision {
  return {
    summary: "Change the running architecture.",
    rationale: ["The athlete explicitly requested a threshold session."],
    cautions: [],
    proposedChanges: [
      {
        id: "rewrite-1",
        action: "rewrite_session",
        sessionId: "run-1",
        sessionTitle: "Easy aerobic run",
        currentDate: "2026-08-04",
        newDate: null,
        variant: null,
        rewriteKind: "threshold",
        reason: "Use this run as the weekly threshold anchor.",
      },
    ],
    changeStatus: "proposed",
    blockedReason: null,
    confidence: "medium",
    dataSummary: ["2 calendar sessions"],
  };
}

describe("sanitizeCoachDecision", () => {
  it("keeps valid rewrite proposals in change-plan mode", () => {
    const result = sanitizeCoachDecision(decision(), request("change_plan"));
    expect(result.changeStatus).toBe("proposed");
    expect(result.proposedChanges).toHaveLength(1);
    expect(result.proposedChanges[0]?.rewriteKind).toBe("threshold");
  });

  it("strips plan writes in advise mode", () => {
    const result = sanitizeCoachDecision(decision(), request("advise"));
    expect(result.changeStatus).toBe("not_requested");
    expect(result.proposedChanges).toEqual([]);
  });

  it("blocks an invalid rewrite instead of silently returning no changes", () => {
    const invalid = decision();
    invalid.proposedChanges = [
      {
        ...invalid.proposedChanges[0],
        sessionId: "strength-1",
        sessionTitle: "Strength",
      },
    ];
    const result = sanitizeCoachDecision(invalid, request("change_plan"));
    expect(result.changeStatus).toBe("blocked");
    expect(result.proposedChanges).toEqual([]);
    expect(result.blockedReason).toBeTruthy();
  });
});
